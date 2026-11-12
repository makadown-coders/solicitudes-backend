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

    if (/UPDATE public\.app_refresh_tokens SET revoked_at = COALESCE\(revoked_at, now\(\)\) WHERE user_id=\$1 AND revoked_at IS NULL/i.test(sql)) {
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
