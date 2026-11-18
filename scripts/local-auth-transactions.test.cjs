const assert = require('node:assert/strict');
const test = require('node:test');
const argon2 = require('argon2');
const path = require('node:path');

// Apuntamos las variables requeridas por src/auth/jwt.ts a los archivos JWK existentes
// únicamente para permitir el import del módulo compilado sin tocar jwt.ts ni leer llaves privadas.
const keysDir = path.resolve(__dirname, '../keys');
process.env.JWKS_PRIVATE_PATH = process.env.JWKS_PRIVATE_PATH || path.join(keysDir, 'current_private.jwk.json');
process.env.JWKS_PUBLIC_PATH = process.env.JWKS_PUBLIC_PATH || path.join(keysDir, 'current_public.jwk.json');
process.env.ACTIVE_KID_FILE = process.env.ACTIVE_KID_FILE || path.join(keysDir, 'ACTIVE_KID');

const LocalAuthService = require('../dist/services/localAuth.service').default;
const AuthService = require('../dist/services/auth.service').default;
const AuthController = require('../dist/controllers/auth.controller').default;
const authRouter = require('../dist/routes/auth').default;

/**
 * Crea un entorno PostgreSQL simulado en memoria con soporte para:
 * - Consultas no transaccionales en `db.query()` (login, me, logoutAll) y seguimiento de `poolQueries`.
 * - Clientes dedicados en `db.connect()` con seguimiento de `BEGIN`, `COMMIT`, `ROLLBACK` y `release(err)`.
 * - Bloqueo de fila simulado (`SELECT ... FOR UPDATE`) para pruebas de concurrencia entre clientes.
 */
function createMockDb(initialState = {}) {
  const tokens = new Map();
  const users = new Map();
  const userRoles = new Map();

  for (const t of initialState.tokens || []) {
    tokens.set(t.jti, { ...t });
  }
  for (const u of initialState.users || []) {
    users.set(u.id, { status: 'ACTIVE', ...u });
  }
  for (const [uid, roles] of Object.entries(initialState.userRoles || {})) {
    userRoles.set(uid, roles.map(r => ({ ...r })));
  }

  const poolQueries = [];
  const clients = [];
  const rowLocks = new Map(); // jti -> { ownerClientId, queue: [resolve] }

  function acquireRowLock(jti, clientId) {
    const existing = rowLocks.get(jti);
    if (!existing || existing.ownerClientId === clientId) {
      if (!existing) {
        rowLocks.set(jti, { ownerClientId: clientId, queue: [] });
      }
      return Promise.resolve();
    }
    return new Promise(resolve => {
      existing.queue.push(() => {
        existing.ownerClientId = clientId;
        resolve();
      });
    });
  }

  function releaseClientLocks(clientId) {
    for (const [jti, lock] of rowLocks.entries()) {
      if (lock.ownerClientId === clientId) {
        const next = lock.queue.shift();
        if (next) {
          next();
        } else {
          rowLocks.delete(jti);
        }
      }
    }
  }

  function executeSharedReadOrWrite(sql, values) {
    if (/SELECT id, email, password_hash, name, status FROM public\.app_users WHERE LOWER\(TRIM\(email\)\) = \$1/i.test(sql)) {
      const [normalizedEmail] = values;
      // Verifica que el parámetro venga ya normalizado en minúsculas y sin espacios
      assert.equal(normalizedEmail, normalizedEmail.trim().toLowerCase(), 'Email parameter must be normalized before querying');
      const found = [...users.values()].find(
        u => String(u.email).trim().toLowerCase() === normalizedEmail
      );
      return {
        rows: found ? [{ ...found }] : [],
        rowCount: found ? 1 : 0,
      };
    }

    if (/SELECT id, email, name, status FROM public\.app_users WHERE id=\$1/i.test(sql)) {
      const [userId] = values;
      const u = users.get(userId);
      return {
        rows: u ? [{ ...u }] : [],
        rowCount: u ? 1 : 0,
      };
    }

    if (/FROM public\.app_user_roles ur/i.test(sql)) {
      const [userId] = values;
      const r = userRoles.get(userId) || [];
      return {
        rows: r.map(item => ({ ...item })),
        rowCount: r.length,
      };
    }

    if (/INSERT INTO public\.app_refresh_tokens/i.test(sql)) {
      const [newJti, userId, hashedToken, userAgent, ip, days] = values;
      const expiresAt = new Date(Date.now() + Number(days) * 86400_000).toISOString();
      tokens.set(newJti, {
        jti: newJti,
        user_id: userId,
        hashed_token: hashedToken,
        user_agent: userAgent,
        ip,
        expires_at: expiresAt,
        revoked_at: null,
        replaced_by: null,
      });
      return { rows: [], rowCount: 1 };
    }

    if (/UPDATE public\.app_refresh_tokens SET revoked_at = COALESCE\(revoked_at, now\(\)\) WHERE user_id=\$1 AND revoked_at IS NULL/i.test(sql) ||
        /UPDATE public\.app_refresh_tokens\s+SET revoked_at = COALESCE\(revoked_at, now\(\)\)\s+WHERE user_id = \$1\s+AND revoked_at IS NULL/i.test(sql)) {
      const [userId] = values;
      let count = 0;
      for (const tok of tokens.values()) {
        if (tok.user_id === userId && tok.revoked_at === null) {
          tok.revoked_at = new Date().toISOString();
          count++;
        }
      }
      return { rows: [], rowCount: count };
    }

    return null;
  }

  let nextClientId = 1;

  const db = {
    tokens,
    users,
    userRoles,
    poolQueries,
    clients,
    allowPoolQueries: false,
    failOnQuery: null,
    failOnPoolQuery: null,
    async query(text, values = []) {
      const sql = String(text).trim();
      poolQueries.push({ text: sql, values });
      if (!db.allowPoolQueries) {
        throw new Error(`Unexpected direct pool.query() invoked during transactional test: ${sql}`);
      }
      if (typeof db.failOnPoolQuery === 'function') {
        db.failOnPoolQuery(sql, values);
      }
      const res = executeSharedReadOrWrite(sql, values);
      if (res) return res;
      throw new Error(`Unhandled SQL in mock pool.query(): ${sql}`);
    },
    async connect() {
      const clientId = nextClientId++;
      const clientRecord = {
        clientId,
        queries: [],
        inTransaction: false,
        released: false,
        releaseCount: 0,
        releaseArgs: [],
      };
      clients.push(clientRecord);

      const client = {
        async query(text, values = []) {
          const sql = String(text).trim();
          clientRecord.queries.push({ sql, values });

          if (typeof db.failOnQuery === 'function') {
            db.failOnQuery(sql, values, clientRecord);
          }

          if (sql === 'BEGIN') {
            assert.equal(clientRecord.inTransaction, false, 'BEGIN called while already in transaction');
            clientRecord.inTransaction = true;
            return { rows: [], rowCount: 0 };
          }

          if (sql === 'COMMIT') {
            assert.equal(clientRecord.inTransaction, true, 'COMMIT called without active transaction');
            clientRecord.inTransaction = false;
            releaseClientLocks(clientId);
            return { rows: [], rowCount: 0 };
          }

          if (sql === 'ROLLBACK') {
            assert.equal(clientRecord.inTransaction, true, 'ROLLBACK called without active transaction');
            clientRecord.inTransaction = false;
            releaseClientLocks(clientId);
            return { rows: [], rowCount: 0 };
          }

          assert.equal(
            clientRecord.inTransaction,
            true,
            `Transactional query executed outside BEGIN..COMMIT on client #${clientId}: ${sql}`
          );

          if (/SELECT \* FROM public\.app_refresh_tokens WHERE jti=\$1 FOR UPDATE/i.test(sql)) {
            const jti = values[0];
            assert.match(jti, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'jti sent to DB must be valid UUID');
            await acquireRowLock(jti, clientId);
            const row = tokens.get(jti);
            return {
              rows: row ? [{ ...row }] : [],
              rowCount: row ? 1 : 0,
            };
          }

          if (/SELECT id, password_hash, status FROM public\.app_users WHERE id = \$1 FOR UPDATE/i.test(sql)) {
            const userId = values[0];
            assert.match(userId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'userId sent to DB must be valid UUID');
            await acquireRowLock(`user:${userId}`, clientId);
            const row = users.get(userId);
            return {
              rows: row ? [{ id: row.id, password_hash: row.password_hash, status: row.status }] : [],
              rowCount: row ? 1 : 0,
            };
          }

          if (/UPDATE public\.app_users\s+SET password_hash = \$2\s+WHERE id = \$1/i.test(sql)) {
            const [userId, newPasswordHash] = values;
            const existing = users.get(userId);
            if (!existing) return { rows: [], rowCount: 0 };
            existing.password_hash = newPasswordHash;
            return { rows: [], rowCount: 1 };
          }

          if (/UPDATE public\.app_refresh_tokens SET revoked_at=now\(\), replaced_by=\$1 WHERE jti=\$2 AND revoked_at IS NULL/i.test(sql)) {
            const [newJti, oldJti] = values;
            assert.equal(tokens.has(newJti), true, 'FK violation: replaced_by target token must be inserted before UPDATE');
            const existing = tokens.get(oldJti);
            if (!existing || existing.revoked_at !== null) {
              return { rows: [], rowCount: 0 };
            }
            existing.revoked_at = new Date().toISOString();
            existing.replaced_by = newJti;
            return { rows: [], rowCount: 1 };
          }

          if (/UPDATE public\.app_refresh_tokens SET revoked_at = COALESCE\(revoked_at, now\(\)\) WHERE jti=\$1/i.test(sql)) {
            const [jti] = values;
            const existing = tokens.get(jti);
            if (!existing) return { rows: [], rowCount: 0 };
            if (!existing.revoked_at) {
              existing.revoked_at = new Date().toISOString();
            }
            return { rows: [], rowCount: 1 };
          }

          const shared = executeSharedReadOrWrite(sql, values);
          if (shared) return shared;

          throw new Error(`Unhandled SQL in mock client: ${sql}`);
        },
        release(err) {
          clientRecord.released = true;
          clientRecord.releaseCount += 1;
          clientRecord.releaseArgs.push(err);
          releaseClientLocks(clientId);
        },
      };

      return client;
    },
  };

  return db;
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const dummySignToken = async (payload) => `signed-jwt-for-${payload.sub}`;

test('1. Login de usuario ACTIVE y normalización de correo con mayúsculas y espacios', async () => {
  const passwordHash = await argon2.hash('Secreta123!');
  const db = createMockDb({
    users: [{
      id: 'user-active-1',
      email: 'Analista.RH@imssbienestar.gob.mx',
      password_hash: passwordHash,
      name: 'Analista RH Activo',
      status: 'ACTIVE',
    }],
    userRoles: {
      'user-active-1': [{ code: 'ADMIN_RH', scope_type: 'GLOBAL', scope_id: '*' }],
    },
  });
  db.allowPoolQueries = true;

  const service = new LocalAuthService({ db, signToken: dummySignToken });
  const res = await service.login('   ANALISTA.RH@IMSSBIENESTAR.GOB.MX  ', 'Secreta123!');

  assert.equal(res.access_token, 'signed-jwt-for-user-active-1');
  assert.match(res.refresh_token, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(res.user, {
    id: 'user-active-1',
    email: 'Analista.RH@imssbienestar.gob.mx',
    name: 'Analista RH Activo',
    roles: [{ code: 'ADMIN_RH', scope: 'GLOBAL', id: null }],
  });
  // Confirma que el parámetro enviado a PostgreSQL fue normalizado a minúsculas y sin espacios
  assert.equal(db.poolQueries[0].values[0], 'analista.rh@imssbienestar.gob.mx');
});

test('2. Login de usuario INACTIVE o SUSPENDED es rechazado con 401 sin enumeración de usuarios', async () => {
  const passwordHash = await argon2.hash('Secreta123!');
  const db = createMockDb({
    users: [
      { id: 'u-inactive', email: 'inactivo@imssb.gob.mx', password_hash: passwordHash, name: 'Inactivo', status: 'INACTIVE' },
      { id: 'u-suspended', email: 'suspendido@imssb.gob.mx', password_hash: passwordHash, name: 'Suspendido', status: 'SUSPENDED' },
    ],
  });
  db.allowPoolQueries = true;

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  for (const email of ['inactivo@imssb.gob.mx', 'suspendido@imssb.gob.mx', 'noexiste@imssb.gob.mx']) {
    const req = { body: { email, password: 'Secreta123!' } };
    const res = createMockRes();
    await controller.login(req, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
  }
  assert.equal(db.tokens.size, 0, 'No debe emitirse ningún refresh_token para usuarios inactivos o suspendidos');
});

test('3. Error genuino de PostgreSQL durante login o refresh devuelve 500 y no un falso 401', async () => {
  const db = createMockDb();
  db.allowPoolQueries = true;
  db.failOnPoolQuery = () => {
    throw new Error('connection terminated unexpectedly');
  };

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  const reqLogin = { body: { email: 'user@imssb.gob.mx', password: 'pw' } };
  const resLogin = createMockRes();
  await controller.login(reqLogin, resLogin);
  assert.equal(resLogin.statusCode, 500);
});

test('4. refresh() de usuario ACTIVE firma JWT antes de COMMIT, utiliza un único cliente y mantiene contrato con Angular', async () => {
  const jti = '11111111-1111-4111-8111-111111111111';
  const secretRaw = 'valid-secret-part';
  const hashed = await argon2.hash(secretRaw);

  const db = createMockDb({
    users: [{ id: 'user-1', email: 'rh@imssb.gob.mx', name: 'Analista RH', status: 'ACTIVE' }],
    userRoles: {
      'user-1': [{ code: 'ADMIN_RH', scope_type: 'GLOBAL', scope_id: '*' }],
    },
    tokens: [{
      jti,
      user_id: 'user-1',
      hashed_token: hashed,
      user_agent: 'Mozilla/5.0',
      ip: '127.0.0.1',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked_at: null,
      replaced_by: null,
    }],
  });

  const events = [];
  const signTokenSpy = async (payload) => {
    // En el momento de firmar el JWT, la transacción DEBE seguir abierta (antes de COMMIT)
    assert.equal(db.clients[0].inTransaction, true, 'signToken debe ejecutarse ANTES del COMMIT');
    events.push('SIGN_JWT');
    return `signed-jwt-for-${payload.sub}`;
  };

  const service = new LocalAuthService({ db, signToken: signTokenSpy });
  const result = await service.refresh(`${jti}.${secretRaw}`);

  assert.equal(db.poolQueries.length, 0);
  assert.equal(db.clients.length, 1);
  const client = db.clients[0];
  assert.equal(client.released, true);
  assert.equal(client.releaseCount, 1);
  assert.deepEqual(client.releaseArgs, [undefined]);
  assert.equal(client.inTransaction, false);

  const sqlList = client.queries.map(q => q.sql);
  assert.equal(sqlList[0], 'BEGIN');
  assert.match(sqlList[1], /SELECT \* FROM public\.app_refresh_tokens WHERE jti=\$1 FOR UPDATE/);
  assert.match(sqlList[2], /INSERT INTO public\.app_refresh_tokens/);
  assert.match(sqlList[3], /UPDATE public\.app_refresh_tokens SET revoked_at=now\(\), replaced_by=\$1 WHERE jti=\$2 AND revoked_at IS NULL/);
  assert.match(sqlList[4], /SELECT id, email, name, status FROM public\.app_users WHERE id=\$1/);
  assert.match(sqlList[5], /FROM public\.app_user_roles ur/);
  assert.equal(sqlList[6], 'COMMIT');
  assert.deepEqual(events, ['SIGN_JWT']);

  assert.equal(result.access_token, 'signed-jwt-for-user-1');
  assert.match(result.refresh_token, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(result.user, {
    id: 'user-1',
    email: 'rh@imssb.gob.mx',
    name: 'Analista RH',
    roles: [{ code: 'ADMIN_RH', scope: 'GLOBAL', id: null }],
  });
});

test('5. Fallo de firma JWT antes del COMMIT en refresh() ejecuta ROLLBACK en el mismo cliente y libera la conexión', async () => {
  const jti = '12121212-1212-4212-8212-121212121212';
  const raw = 'secret-before-jwt-fail';
  const hashed = await argon2.hash(raw);

  const db = createMockDb({
    users: [{ id: 'user-1', email: 'rh@imssb.gob.mx', name: 'Analista RH', status: 'ACTIVE' }],
    userRoles: { 'user-1': [] },
    tokens: [{
      jti,
      user_id: 'user-1',
      hashed_token: hashed,
      user_agent: null,
      ip: null,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked_at: null,
      replaced_by: null,
    }],
  });

  const failingSignToken = async () => {
    throw new Error('JWK signing key failure');
  };

  const service = new LocalAuthService({ db, signToken: failingSignToken });

  await assert.rejects(
    () => service.refresh(`${jti}.${raw}`),
    { message: 'JWK signing key failure' }
  );

  const client = db.clients[0];
  assert.equal(client.released, true);
  assert.deepEqual(client.releaseArgs, [undefined]);
  assert.equal(client.inTransaction, false);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!client.queries.some(q => q.sql === 'COMMIT'), 'No debe ejecutarse COMMIT si falla signToken');
});

test('6. Refresh de usuario INACTIVE o usuario inexistente durante refresh hace ROLLBACK y devuelve 401', async () => {
  const jtiInactive = '21212121-2121-4121-8121-212121212121';
  const jtiDeleted = '31313131-3131-4131-8131-313131313131';
  const raw = 'valid-raw-secret';
  const hashed = await argon2.hash(raw);

  const db = createMockDb({
    users: [
      { id: 'user-inactive', email: 'inactivo@imssb.gob.mx', name: 'Inactivo', status: 'INACTIVE' },
    ],
    tokens: [
      {
        jti: jtiInactive,
        user_id: 'user-inactive',
        hashed_token: hashed,
        user_agent: null,
        ip: null,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: null,
        replaced_by: null,
      },
      {
        jti: jtiDeleted,
        user_id: 'user-deleted',
        hashed_token: hashed,
        user_agent: null,
        ip: null,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        revoked_at: null,
        replaced_by: null,
      },
    ],
  });

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  // Caso A: usuario INACTIVE
  const resInactive = createMockRes();
  await controller.refresh({ body: { refresh_token: `${jtiInactive}.${raw}` } }, resInactive);
  assert.equal(resInactive.statusCode, 401);

  // Caso B: usuario eliminado
  const resDeleted = createMockRes();
  await controller.refresh({ body: { refresh_token: `${jtiDeleted}.${raw}` } }, resDeleted);
  assert.equal(resDeleted.statusCode, 401);

  assert.equal(db.clients.length, 2);
  for (const c of db.clients) {
    assert.equal(c.released, true);
    assert.equal(c.inTransaction, false);
    assert.equal(c.queries.at(-1).sql, 'ROLLBACK');
  }
});

test('7. /me con usuario ACTIVE devuelve 200, y con usuario INACTIVE o eliminado devuelve 401 (y 500 ante fallo de BD)', async () => {
  const db = createMockDb({
    users: [
      { id: 'u-active', email: 'activo@imssb.gob.mx', name: 'Activo', status: 'ACTIVE' },
      { id: 'u-inactive', email: 'inactivo@imssb.gob.mx', name: 'Inactivo', status: 'INACTIVE' },
    ],
    userRoles: {
      'u-active': [{ code: 'OPER_TIC', scope_type: 'CLUES', scope_id: 'BCIMB000001' }],
    },
  });
  db.allowPoolQueries = true;

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  // Usuario ACTIVE -> 200 con status: 'ACTIVE'
  const resActive = createMockRes();
  await controller.me({ user: { sub: 'u-active', email: 'activo@imssb.gob.mx' } }, resActive);
  assert.equal(resActive.statusCode, 200);
  assert.deepEqual(resActive.body.profile, {
    id: 'u-active',
    email: 'activo@imssb.gob.mx',
    name: 'Activo',
    status: 'ACTIVE',
    roles: [{ code: 'OPER_TIC', scope: 'CLUES', id: 'BCIMB000001' }],
  });

  // Usuario INACTIVE -> 401
  const resInactive = createMockRes();
  await controller.me({ user: { sub: 'u-inactive', email: 'inactivo@imssb.gob.mx' } }, resInactive);
  assert.equal(resInactive.statusCode, 401);

  // Usuario eliminado -> 401
  const resDeleted = createMockRes();
  await controller.me({ user: { sub: 'u-deleted', email: 'deleted@imssb.gob.mx' } }, resDeleted);
  assert.equal(resDeleted.statusCode, 401);

  // Error genuino de BD -> 500
  db.failOnPoolQuery = () => {
    throw new Error('DB read error');
  };
  const resDbError = createMockRes();
  await controller.me({ user: { sub: 'u-active', email: 'activo@imssb.gob.mx' } }, resDbError);
  assert.equal(resDbError.statusCode, 500);
});

test('8. Validación estricta de formato UUID en refresh_token para refresh() y logout() sin tocar PostgreSQL', async () => {
  const db = createMockDb();
  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  const malformedTokens = [
    'not-a-uuid.secret',
    '11111111-1111-1111-1111-111111111111.',
    '.secret',
    '11111111-1111-1111-1111-111111111111.part1.part2',
    'sin-punto',
    '12345',
  ];

  for (const badToken of malformedTokens) {
    // En refresh() -> 401 invalid refresh, sin abrir conexión al pool
    const resRefresh = createMockRes();
    await controller.refresh({ body: { refresh_token: badToken } }, resRefresh);
    assert.equal(resRefresh.statusCode, 401);
    assert.deepEqual(resRefresh.body, { error: 'invalid refresh' });

    // En logout() -> 200 { ok: true } idempotente, sin abrir conexión al pool
    const outLogout = await local.logout(badToken);
    assert.deepEqual(outLogout, { ok: true });
  }

  assert.equal(db.clients.length, 0, 'Tokens malformados no deben abrir conexiones ni enviar UUID inválidos a PostgreSQL');
  assert.equal(db.poolQueries.length, 0);
});

test('9. /auth/logout-all exige requireAuth en el router, rechaza llamadas sin Bearer con 401 y revoca solo sesiones del usuario autenticado', async () => {
  // 1) Verificar en el router Express que POST /logout-all tiene el middleware requireAuth montado antes del controlador
  const logoutAllLayer = authRouter.stack.find(
    layer => layer.route && layer.route.path === '/logout-all' && layer.route.methods.post
  );
  assert.ok(logoutAllLayer, 'Ruta POST /logout-all debe existir en authRouter');
  assert.equal(
    logoutAllLayer.route.stack.length >= 2,
    true,
    'POST /logout-all debe incluir el middleware requireAuth antes del handler del controlador'
  );
  assert.equal(logoutAllLayer.route.stack[0].name, 'requireAuth');

  // 2) Probar llamada sin token Bearer a través del middleware requireAuth -> 401
  const reqUnauth = {
    headers: {},
    get() { return undefined; },
    body: { user_id: 'victim-user' },
    query: { user_id: 'victim-user' },
  };
  const resUnauth = createMockRes();
  let nextCalled = false;
  await logoutAllLayer.route.stack[0].handle(reqUnauth, resUnauth, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(resUnauth.statusCode, 401);

  // 3) Probar llamada autenticada: revoca únicamente los tokens de req.user.sub e ignora user_id en body/query
  const db = createMockDb({
    tokens: [
      { jti: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: 'auth-user-1', hashed_token: 'h1', revoked_at: null },
      { jti: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user_id: 'other-user-2', hashed_token: 'h2', revoked_at: null },
    ],
  });
  db.allowPoolQueries = true;

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  const reqAuth = {
    user: { sub: 'auth-user-1' },
    body: { user_id: 'other-user-2' },
    query: { user_id: 'other-user-2' },
  };
  const resAuth = createMockRes();
  await controller.logoutAll(reqAuth, resAuth);

  assert.equal(resAuth.statusCode, 200);
  assert.deepEqual(resAuth.body, { ok: true });
  assert.ok(db.tokens.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').revoked_at, 'El token del usuario autenticado debe revocarse');
  assert.equal(db.tokens.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').revoked_at, null, 'El token de otro usuario NO debe revocarse');
});

test('10. Rollback fallido en refresh() y logout() descarta el cliente defectuoso con client.release(err) sin ocultar el error original', async () => {
  const jti = '77777777-7777-4777-8777-777777777777';
  const raw = 'secret-for-rollback-fail';
  const hashed = await argon2.hash(raw);

  const db = createMockDb({
    tokens: [{
      jti,
      user_id: 'user-1',
      hashed_token: hashed,
      user_agent: null,
      ip: null,
      expires_at: new Date(Date.now() - 60_000).toISOString(), // Expirado para forzar error original 'expired refresh'
      revoked_at: null,
      replaced_by: null,
    }],
  });

  const rollbackNetworkError = new Error('socket hang up during ROLLBACK');
  db.failOnQuery = (sql) => {
    if (sql === 'ROLLBACK') {
      throw rollbackNetworkError;
    }
  };

  const service = new LocalAuthService({ db, signToken: dummySignToken });

  // Caso A: refresh() preserva el error original ('expired refresh') y pasa rollbackNetworkError a client.release(err)
  await assert.rejects(
    () => service.refresh(`${jti}.${raw}`),
    { message: 'expired refresh' }
  );

  assert.equal(db.clients.length, 1);
  const refreshClient = db.clients[0];
  assert.equal(refreshClient.released, true);
  assert.equal(refreshClient.releaseCount, 1);
  assert.equal(refreshClient.releaseArgs[0], rollbackNetworkError);

  // Caso B: logout() ante fallo en UPDATE y posterior fallo en ROLLBACK preserva el error original y descarta el cliente
  const jtiLogout = '88888888-8888-4888-8888-888888888888';
  db.tokens.set(jtiLogout, {
    jti: jtiLogout,
    user_id: 'user-1',
    hashed_token: hashed,
    user_agent: null,
    ip: null,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    revoked_at: null,
    replaced_by: null,
  });

  db.failOnQuery = (sql) => {
    if (/UPDATE public\.app_refresh_tokens/i.test(sql)) {
      throw new Error('primary update failure');
    }
    if (sql === 'ROLLBACK') {
      throw rollbackNetworkError;
    }
  };

  await assert.rejects(
    () => service.logout(`${jtiLogout}.${raw}`),
    { message: 'primary update failure' }
  );

  assert.equal(db.clients.length, 2);
  const logoutClient = db.clients[1];
  assert.equal(logoutClient.released, true);
  assert.equal(logoutClient.releaseCount, 1);
  assert.equal(logoutClient.releaseArgs[0], rollbackNetworkError);
});

test('11. Dos refresh() concurrentes del mismo token producen una única rotación exitosa y el segundo falla tras el bloqueo FOR UPDATE', async () => {
  const jti = '44444444-4444-4444-8444-444444444444';
  const raw = 'concurrent-secret';
  const hashed = await argon2.hash(raw);

  const db = createMockDb({
    users: [{ id: 'user-1', email: 'concurrent@imssb.gob.mx', name: 'Usuario Concurrente', status: 'ACTIVE' }],
    userRoles: { 'user-1': [] },
    tokens: [{
      jti,
      user_id: 'user-1',
      hashed_token: hashed,
      user_agent: null,
      ip: null,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked_at: null,
      replaced_by: null,
    }],
  });

  const service = new LocalAuthService({ db, signToken: dummySignToken });
  const tokenInput = `${jti}.${raw}`;

  const outcomes = await Promise.allSettled([
    service.refresh(tokenInput),
    service.refresh(tokenInput),
  ]);

  const fulfilled = outcomes.filter(o => o.status === 'fulfilled');
  const rejected = outcomes.filter(o => o.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /expired refresh|refresh already used/);

  assert.equal(db.clients.length, 2);
  for (const c of db.clients) {
    assert.equal(c.released, true);
    assert.deepEqual(c.releaseArgs, [undefined]);
    assert.equal(c.inTransaction, false);
  }
  assert.equal(db.tokens.size, 2);
});

test('12. logout() válido es idempotente y libera correctamente el cliente', async () => {
  const jti = '55555555-5555-4555-8555-555555555555';
  const raw = 'logout-secret';
  const hashed = await argon2.hash(raw);

  const db = createMockDb({
    tokens: [{
      jti,
      user_id: 'user-1',
      hashed_token: hashed,
      user_agent: null,
      ip: null,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      revoked_at: null,
      replaced_by: null,
    }],
  });

  const service = new LocalAuthService({ db, signToken: dummySignToken });

  const res1 = await service.logout(`${jti}.${raw}`);
  assert.deepEqual(res1, { ok: true });
  const firstRevokedAt = db.tokens.get(jti).revoked_at;
  assert.ok(firstRevokedAt);

  const res2 = await service.logout(`${jti}.${raw}`);
  assert.deepEqual(res2, { ok: true });
  assert.equal(db.tokens.get(jti).revoked_at, firstRevokedAt);

  const res3 = await service.logout('');
  assert.deepEqual(res3, { ok: true });
  const res4 = await service.logout('00000000-0000-4000-8000-000000000000.nonexistent');
  assert.deepEqual(res4, { ok: true });

  assert.equal(db.poolQueries.length, 0);
  for (const c of db.clients) {
    assert.equal(c.released, true);
    assert.deepEqual(c.releaseArgs, [undefined]);
    assert.equal(c.inTransaction, false);
  }
});

test('13 (TI-2H.1). PUT /api/auth/me/password: ruta protegida con requireAuth (sin requireTiAdminGlobal), cambio exitoso para ACTIVE (con o sin ADMIN_TIC), verificación Argon2 y revocación aislada de refresh tokens', async () => {
  // 1) Verificar en el router Express que PUT /me/password tiene únicamente requireAuth + handler (2 handlers, sin requireTiAdminGlobal)
  const mePasswordLayer = authRouter.stack.find(
    layer => layer.route && layer.route.path === '/me/password' && layer.route.methods.put
  );
  assert.ok(mePasswordLayer, 'Ruta PUT /me/password debe existir en authRouter');
  assert.equal(
    mePasswordLayer.route.stack.length,
    2,
    'PUT /me/password debe tener exactamente 2 handlers (requireAuth y changeOwnPassword, sin requireTiAdminGlobal)'
  );
  assert.equal(mePasswordLayer.route.stack[0].name, 'requireAuth');

  // 2) Sin token -> HTTP 401
  const reqUnauth = {
    headers: {},
    get() { return undefined; },
    body: { current_password: 'OldPassword1!', new_password: 'NewPassword2!' },
  };
  const resUnauth = createMockRes();
  let nextCalled = false;
  await mePasswordLayer.route.stack[0].handle(reqUnauth, resUnauth, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(resUnauth.statusCode, 401);

  // 3) Preparar usuarios en BD simulada:
  // - userNoAdmin: usuario ACTIVE sin ADMIN_TIC (con 2 refresh tokens activos y 1 ya revocado)
  // - userAdmin: usuario ACTIVE con ADMIN_TIC GLOBAL (con 1 refresh token activo)
  // - otherUser: otro usuario ACTIVE (con 1 refresh token activo que NO debe revocarse)
  const userNoAdminId = '11111111-2222-4333-8444-555555555551';
  const userAdminId = '11111111-2222-4333-8444-555555555552';
  const otherUserId = '11111111-2222-4333-8444-555555555553';

  const oldPassNoAdmin = 'ClaveActualUsuario#1';
  const newPassNoAdmin = 'ClaveNuevaUsuario#2';
  const oldPassAdmin = 'ClaveActualAdmin#1';
  const newPassAdmin = 'ClaveNuevaAdmin#2';

  const db = createMockDb({
    users: [
      {
        id: userNoAdminId,
        email: 'operador@imssb.gob.mx',
        password_hash: await argon2.hash(oldPassNoAdmin),
        name: 'Operador Sin Admin',
        status: 'ACTIVE',
      },
      {
        id: userAdminId,
        email: 'admin.tic@imssb.gob.mx',
        password_hash: await argon2.hash(oldPassAdmin),
        name: 'Admin TIC Global',
        status: 'ACTIVE',
      },
      {
        id: otherUserId,
        email: 'otro@imssb.gob.mx',
        password_hash: await argon2.hash('ClaveOtro#1'),
        name: 'Otro Usuario',
        status: 'ACTIVE',
      },
    ],
    userRoles: {
      [userNoAdminId]: [{ code: 'SOLICITUDES_ABASTO', scope_type: 'CLUES', scope_id: 'BCIMB000001' }],
      [userAdminId]: [{ code: 'ADMIN_TIC', scope_type: 'GLOBAL', scope_id: '*' }],
    },
    tokens: [
      { jti: 'aaaaaaaa-1111-4111-8111-111111111111', user_id: userNoAdminId, hashed_token: 'h1', revoked_at: null },
      { jti: 'aaaaaaaa-2222-4222-8222-222222222222', user_id: userNoAdminId, hashed_token: 'h2', revoked_at: null },
      { jti: 'aaaaaaaa-3333-4333-8333-333333333333', user_id: userNoAdminId, hashed_token: 'h3', revoked_at: '2026-01-01T00:00:00.000Z' },
      { jti: 'bbbbbbbb-1111-4111-8111-111111111111', user_id: userAdminId, hashed_token: 'h4', revoked_at: null },
      { jti: 'cccccccc-1111-4111-8111-111111111111', user_id: otherUserId, hashed_token: 'h5', revoked_at: null },
    ],
  });

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  // Caso A: Usuario ACTIVE sin ADMIN_TIC cambia su propia contraseña
  const reqNoAdmin = {
    user: { sub: userNoAdminId, email: 'operador@imssb.gob.mx', roles: [{ code: 'SOLICITUDES_ABASTO', scope: 'CLUES', id: 'BCIMB000001' }] },
    body: { current_password: oldPassNoAdmin, new_password: newPassNoAdmin },
  };
  const resNoAdmin = createMockRes();
  await controller.changeOwnPassword(reqNoAdmin, resNoAdmin);

  assert.equal(resNoAdmin.statusCode, 200);
  assert.deepEqual(resNoAdmin.body, { ok: true, revoked_sessions: 2 });
  assert.equal(JSON.stringify(resNoAdmin.body).includes(newPassNoAdmin), false);
  assert.equal(JSON.stringify(resNoAdmin.body).includes('argon2'), false);

  // Verificar que el nuevo hash en BD fue generado con Argon2 y corresponde a newPassNoAdmin
  const updatedNoAdminHash = db.users.get(userNoAdminId).password_hash;
  assert.equal(await argon2.verify(updatedNoAdminHash, newPassNoAdmin), true);
  assert.equal(await argon2.verify(updatedNoAdminHash, oldPassNoAdmin), false);

  // Verificar que se revocaron los 2 refresh tokens activos de userNoAdminId y NO los de otros usuarios
  assert.ok(db.tokens.get('aaaaaaaa-1111-4111-8111-111111111111').revoked_at);
  assert.ok(db.tokens.get('aaaaaaaa-2222-4222-8222-222222222222').revoked_at);
  assert.equal(db.tokens.get('bbbbbbbb-1111-4111-8111-111111111111').revoked_at, null);
  assert.equal(db.tokens.get('cccccccc-1111-4111-8111-111111111111').revoked_at, null);

  // Caso B: Usuario ADMIN_TIC también puede cambiar su propia contraseña
  const reqAdmin = {
    user: { sub: userAdminId, email: 'admin.tic@imssb.gob.mx', roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }] },
    body: { current_password: oldPassAdmin, new_password: newPassAdmin },
  };
  const resAdmin = createMockRes();
  await controller.changeOwnPassword(reqAdmin, resAdmin);

  assert.equal(resAdmin.statusCode, 200);
  assert.deepEqual(resAdmin.body, { ok: true, revoked_sessions: 1 });
  assert.equal(await argon2.verify(db.users.get(userAdminId).password_hash, newPassAdmin), true);
  assert.ok(db.tokens.get('bbbbbbbb-1111-4111-8111-111111111111').revoked_at);
  assert.equal(db.tokens.get('cccccccc-1111-4111-8111-111111111111').revoked_at, null, 'No debe revocar sesiones de third-party');
});

test('14 (TI-2H.1). Validaciones de entrada, rechazo de propiedades extra (user_id, persona_id, email), contraseña actual incorrecta, nueva corta o igual a la actual y estados no activos', async () => {
  const activeUserId = '22222222-2222-4222-8222-222222222221';
  const suspendedUserId = '22222222-2222-4222-8222-222222222222';
  const inactiveUserId = '22222222-2222-4222-8222-222222222223';
  const missingUserId = '22222222-2222-4222-8222-222222222299';
  const victimUserId = '22222222-2222-4222-8222-222222222288';

  const currentPass = 'MiClaveActual#2026';
  const initialHash = await argon2.hash(currentPass);
  const victimHash = await argon2.hash('ClaveVictima#2026');

  const db = createMockDb({
    users: [
      { id: activeUserId, email: 'activo@imssb.gob.mx', password_hash: initialHash, name: 'Activo', status: 'ACTIVE' },
      { id: suspendedUserId, email: 'suspendido@imssb.gob.mx', password_hash: initialHash, name: 'Suspendido', status: 'SUSPENDED' },
      { id: inactiveUserId, email: 'inactivo@imssb.gob.mx', password_hash: initialHash, name: 'Inactivo', status: 'INACTIVE' },
      { id: victimUserId, email: 'victima@imssb.gob.mx', password_hash: victimHash, name: 'Victima', status: 'ACTIVE' },
    ],
    tokens: [
      { jti: 'dddddddd-1111-4111-8111-111111111111', user_id: activeUserId, hashed_token: 'h1', revoked_at: null },
      { jti: 'dddddddd-2222-4222-8222-222222222222', user_id: victimUserId, hashed_token: 'h2', revoked_at: null },
    ],
  });

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  // 1) Propiedades adicionales y campos prohibidos en body (user_id, persona_id, email, extra) -> HTTP 400 sin abrir transacción
  const forbiddenBodies = [
    { current_password: currentPass, new_password: 'NuevaClaveValida#1', user_id: victimUserId },
    { current_password: currentPass, new_password: 'NuevaClaveValida#1', persona_id: 101 },
    { current_password: currentPass, new_password: 'NuevaClaveValida#1', email: 'victima@imssb.gob.mx' },
    { current_password: currentPass, new_password: 'NuevaClaveValida#1', extra: true },
    { current_password: currentPass },
    { new_password: 'NuevaClaveValida#1' },
    null,
    ['array'],
  ];

  for (const badBody of forbiddenBodies) {
    const res = createMockRes();
    await controller.changeOwnPassword({ user: { sub: activeUserId }, body: badBody }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(db.clients.length, 0, 'Payloads rechazados en controlador no deben abrir conexiones a BD');

  // 2) Contraseña nueva demasiado corta (< 8 caracteres) o solo espacios -> HTTP 400 sin tocar BD
  for (const shortPass of ['', '1234567', '       ', '   abc  ']) {
    const res = createMockRes();
    await controller.changeOwnPassword(
      { user: { sub: activeUserId }, body: { current_password: currentPass, new_password: shortPass } },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.stringify(res.body).includes(shortPass.trim() || '1234567'), false);
  }
  assert.equal(db.clients.length, 0);

  // 3) Nueva contraseña idéntica a la actual -> HTTP 400 sin escrituras
  const resSame = createMockRes();
  await controller.changeOwnPassword(
    { user: { sub: activeUserId }, body: { current_password: currentPass, new_password: currentPass } },
    resSame
  );
  assert.equal(resSame.statusCode, 400);
  assert.equal(db.users.get(activeUserId).password_hash, initialHash);
  assert.equal(db.tokens.get('dddddddd-1111-4111-8111-111111111111').revoked_at, null);

  // 4) Contraseña actual incorrecta -> HTTP 400 con ROLLBACK, sin actualizar hash ni revocar sesiones ni filtrar contraseña
  const wrongCurrent = 'ClaveIncorrecta#999';
  const resWrong = createMockRes();
  await controller.changeOwnPassword(
    { user: { sub: activeUserId }, body: { current_password: wrongCurrent, new_password: 'NuevaClaveValida#2026' } },
    resWrong
  );
  assert.equal(resWrong.statusCode, 400);
  assert.equal(JSON.stringify(resWrong.body).includes(wrongCurrent), false);
  assert.equal(JSON.stringify(resWrong.body).includes(initialHash), false);
  assert.equal(db.users.get(activeUserId).password_hash, initialHash);
  assert.equal(db.tokens.get('dddddddd-1111-4111-8111-111111111111').revoked_at, null);
  assert.equal(db.clients.at(-1).queries.at(-1).sql, 'ROLLBACK');

  // 5) Cuenta SUSPENDED o INACTIVE -> HTTP 403 sin escrituras
  for (const uid of [suspendedUserId, inactiveUserId]) {
    const resStatus = createMockRes();
    await controller.changeOwnPassword(
      { user: { sub: uid }, body: { current_password: currentPass, new_password: 'NuevaClaveValida#2026' } },
      resStatus
    );
    assert.equal(resStatus.statusCode, 403);
    assert.equal(db.users.get(uid).password_hash, initialHash);
    assert.equal(db.clients.at(-1).queries.at(-1).sql, 'ROLLBACK');
  }

  // 6) Cuenta autenticada inexistente en app_users -> HTTP 404
  const resMissing = createMockRes();
  await controller.changeOwnPassword(
    { user: { sub: missingUserId }, body: { current_password: currentPass, new_password: 'NuevaClaveValida#2026' } },
    resMissing
  );
  assert.equal(resMissing.statusCode, 404);
  assert.equal(db.clients.at(-1).queries.at(-1).sql, 'ROLLBACK');

  // 7) La cuenta objetivo procede exclusivamente de req.user.sub (ignorando params/query de otra cuenta)
  const resTargetCheck = createMockRes();
  await controller.changeOwnPassword(
    {
      user: { sub: activeUserId },
      params: { id: victimUserId },
      query: { user_id: victimUserId },
      body: { current_password: currentPass, new_password: 'NuevaClavePropia#2026' },
    },
    resTargetCheck
  );
  assert.equal(resTargetCheck.statusCode, 200);
  assert.equal(db.users.get(victimUserId).password_hash, victimHash, 'La cuenta de otro usuario jamás debe modificarse');
  assert.equal(db.tokens.get('dddddddd-2222-4222-8222-222222222222').revoked_at, null);
});

test('15 (TI-2H.1). Atomicidad/rollback ante error de persistencia y concurrencia con bloqueo FOR UPDATE en changeOwnPassword()', async () => {
  const userId = '33333333-3333-4333-8333-333333333333';
  const initialPass = 'PasswordInicial#1';
  const initialHash = await argon2.hash(initialPass);

  const db = createMockDb({
    users: [
      { id: userId, email: 'concurrencia@imssb.gob.mx', password_hash: initialHash, name: 'Usuario Concurrencia', status: 'ACTIVE' },
    ],
    tokens: [
      { jti: 'eeeeeeee-1111-4111-8111-111111111111', user_id: userId, hashed_token: 'h1', revoked_at: null },
    ],
  });

  const local = new LocalAuthService({ db, signToken: dummySignToken });
  const auth = new AuthService({ local });
  const controller = new AuthController({ auth });

  // Parte A: Error en revocación de refresh tokens dentro de la transacción -> ROLLBACK y 500 sin exponer detalles SQL
  db.failOnQuery = (sql) => {
    if (/UPDATE public\.app_refresh_tokens/i.test(sql)) {
      throw new Error('simulated pg error on app_refresh_tokens');
    }
  };

  const resFail = createMockRes();
  await controller.changeOwnPassword(
    { user: { sub: userId }, body: { current_password: initialPass, new_password: 'PasswordFallida#2' } },
    resFail
  );
  assert.equal(resFail.statusCode, 500);
  assert.deepEqual(resFail.body, { error: 'Internal server error' });
  assert.equal(db.clients[0].queries.at(-1).sql, 'ROLLBACK');
  assert.equal(db.clients[0].released, true);

  // Restauramos hash inicial para probar concurrencia limpia
  db.users.get(userId).password_hash = initialHash;
  db.failOnQuery = null;

  // Parte B: Dos solicitudes concurrentes con la misma current_password ("PasswordInicial#1")
  // Gracias a SELECT ... FOR UPDATE sobre app_users, la primera actualiza el hash y hace COMMIT;
  // la segunda lee el nuevo hash tras liberarse el lock y rechaza current_password con 400.
  const [outcome1, outcome2] = await Promise.allSettled([
    local.changeOwnPassword(userId, { current_password: initialPass, new_password: 'NuevaConcurrenteA#1' }),
    local.changeOwnPassword(userId, { current_password: initialPass, new_password: 'NuevaConcurrenteB#2' }),
  ]);

  const fulfilled = [outcome1, outcome2].filter(o => o.status === 'fulfilled');
  const rejected = [outcome1, outcome2].filter(o => o.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactamente una solicitud concurrente debe tener éxito');
  assert.equal(rejected.length, 1, 'La segunda solicitud basada en la contraseña anterior debe ser rechazada');
  assert.equal(rejected[0].reason.statusCode, 400);

  // La contraseña final en BD debe corresponder exclusivamente a la primera que adquirió el lock (NuevaConcurrenteA#1)
  const finalHash = db.users.get(userId).password_hash;
  assert.equal(await argon2.verify(finalHash, 'NuevaConcurrenteA#1'), true);
  assert.equal(await argon2.verify(finalHash, 'NuevaConcurrenteB#2'), false);
});

