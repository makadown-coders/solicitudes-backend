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

/**
 * Crea un entorno PostgreSQL simulado en memoria con soporte para:
 * - Seguimiento estricto de llamadas directas a `pool.query()` vs `client.query()`.
 * - Verificación de `BEGIN`, `COMMIT`, `ROLLBACK` y `release()` en el mismo cliente.
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
    users.set(u.id, { ...u });
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

  let nextClientId = 1;

  const db = {
    tokens,
    users,
    userRoles,
    poolQueries,
    clients,
    failOnQuery: null,
    async query(text, values) {
      poolQueries.push({ text: String(text).trim(), values });
      throw new Error(`Unexpected direct pool.query() invoked during transactional test: ${text}`);
    },
    async connect() {
      const clientId = nextClientId++;
      const clientRecord = {
        clientId,
        queries: [],
        inTransaction: false,
        released: false,
        releaseCount: 0,
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
            await acquireRowLock(jti, clientId);
            const row = tokens.get(jti);
            return {
              rows: row ? [{ ...row }] : [],
              rowCount: row ? 1 : 0,
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

          if (/UPDATE public\.app_refresh_tokens SET revoked_at=now\(\), replaced_by=\$1 WHERE jti=\$2 AND revoked_at IS NULL/i.test(sql)) {
            const [newJti, oldJti] = values;
            // Verificamos integridad referencial: newJti debe existir antes de enlazar replaced_by
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

          if (/SELECT id, email, name FROM public\.app_users WHERE id=\$1/i.test(sql)) {
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

          throw new Error(`Unhandled SQL in mock client: ${sql}`);
        },
        release() {
          clientRecord.released = true;
          clientRecord.releaseCount += 1;
          releaseClientLocks(clientId);
        },
      };

      return client;
    },
  };

  return db;
}

const dummySignToken = async (payload) => `signed-jwt-for-${payload.sub}`;

test('1. refresh() exitoso ejecuta BEGIN, consultas, INSERT, UPDATE y COMMIT en el mismo cliente, sin usar pool.query() y preservando contrato con Angular', async () => {
  const jti = '11111111-1111-4111-8111-111111111111';
  const secretRaw = 'valid-secret-part';
  const hashed = await argon2.hash(secretRaw);

  const db = createMockDb({
    users: [{ id: 'user-1', email: 'rh@imssb.gob.mx', name: 'Analista RH' }],
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

  const service = new LocalAuthService({ db, signToken: dummySignToken });
  const result = await service.refresh(`${jti}.${secretRaw}`);

  // 1) Cero llamadas a pool.query()
  assert.equal(db.poolQueries.length, 0);

  // 2) Exactamente 1 cliente reservado, liberado 1 vez y sin transacción colgada
  assert.equal(db.clients.length, 1);
  const client = db.clients[0];
  assert.equal(client.released, true);
  assert.equal(client.releaseCount, 1);
  assert.equal(client.inTransaction, false);

  // 3) Secuencia exacta de sentencias en el mismo cliente
  const sqlList = client.queries.map(q => q.sql);
  assert.equal(sqlList[0], 'BEGIN');
  assert.match(sqlList[1], /SELECT \* FROM public\.app_refresh_tokens WHERE jti=\$1 FOR UPDATE/);
  assert.match(sqlList[2], /INSERT INTO public\.app_refresh_tokens/);
  assert.match(sqlList[3], /UPDATE public\.app_refresh_tokens SET revoked_at=now\(\), replaced_by=\$1 WHERE jti=\$2 AND revoked_at IS NULL/);
  assert.match(sqlList[4], /SELECT id, email, name FROM public\.app_users WHERE id=\$1/);
  assert.match(sqlList[5], /FROM public\.app_user_roles ur/);
  assert.equal(sqlList[6], 'COMMIT');

  // 4) Contrato de respuesta compatible con Angular (RefreshResponse)
  assert.equal(result.access_token, 'signed-jwt-for-user-1');
  assert.match(result.refresh_token, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
  assert.notEqual(result.refresh_token, `${jti}.${secretRaw}`);
  assert.deepEqual(result.user, {
    id: 'user-1',
    email: 'rh@imssb.gob.mx',
    name: 'Analista RH',
    roles: [{ code: 'ADMIN_RH', scope: 'GLOBAL', id: null }],
  });

  // 5) El token anterior quedó revocado y apuntando al nuevo
  const [newJti] = result.refresh_token.split('.');
  const oldRec = db.tokens.get(jti);
  assert.ok(oldRec.revoked_at);
  assert.equal(oldRec.replaced_by, newJti);
  assert.ok(db.tokens.get(newJti));
});

test('2. refresh() inválido o expirado hace ROLLBACK en el mismo cliente, libera la conexión y no deja transacción abierta', async () => {
  const jtiExpired = '22222222-2222-4222-8222-222222222222';
  const raw = 'some-raw-token';
  const hashed = await argon2.hash(raw);

  const db = createMockDb({
    tokens: [{
      jti: jtiExpired,
      user_id: 'user-1',
      hashed_token: hashed,
      user_agent: null,
      ip: null,
      expires_at: new Date(Date.now() - 60_000).toISOString(), // Expirado
      revoked_at: null,
      replaced_by: null,
    }],
  });

  const service = new LocalAuthService({ db, signToken: dummySignToken });

  await assert.rejects(
    () => service.refresh(`${jtiExpired}.${raw}`),
    { message: 'expired refresh' }
  );

  assert.equal(db.poolQueries.length, 0);
  assert.equal(db.clients.length, 1);
  const client = db.clients[0];
  assert.equal(client.released, true);
  assert.equal(client.inTransaction, false);
  assert.equal(client.queries[0].sql, 'BEGIN');
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
});

test('3. refresh() con contraseña/secreto incorrecto o inexistente hace ROLLBACK en el mismo cliente y lo libera', async () => {
  const jti = '33333333-3333-4333-8333-333333333333';
  const hashed = await argon2.hash('correct-secret');

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

  // Secreto equivocado
  await assert.rejects(
    () => service.refresh(`${jti}.wrong-secret`),
    { message: 'invalid refresh' }
  );

  // JTI inexistente
  await assert.rejects(
    () => service.refresh('99999999-9999-4999-8999-999999999999.any-secret'),
    { message: 'invalid refresh' }
  );

  assert.equal(db.poolQueries.length, 0);
  assert.equal(db.clients.length, 2);
  for (const c of db.clients) {
    assert.equal(c.released, true);
    assert.equal(c.inTransaction, false);
    assert.equal(c.queries[0].sql, 'BEGIN');
    assert.equal(c.queries.at(-1).sql, 'ROLLBACK');
  }
});

test('4. Dos refresh() concurrentes del mismo token producen una única rotación exitosa y el segundo falla tras el bloqueo FOR UPDATE', async () => {
  const jti = '44444444-4444-4444-8444-444444444444';
  const raw = 'concurrent-secret';
  const hashed = await argon2.hash(raw);

  const db = createMockDb({
    users: [{ id: 'user-1', email: 'concurrent@imssb.gob.mx', name: 'Usuario Concurrente' }],
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

  assert.equal(fulfilled.length, 1, 'Solo uno de los dos refresh concurrentes debe tener éxito');
  assert.equal(rejected.length, 1, 'El segundo refresh concurrente debe ser rechazado');
  assert.match(rejected[0].reason.message, /expired refresh|refresh already used/);

  // Ambos clientes fueron liberados y ninguno quedó con transacción abierta
  assert.equal(db.clients.length, 2);
  for (const c of db.clients) {
    assert.equal(c.released, true);
    assert.equal(c.inTransaction, false);
  }
  // Solo se insertó 1 nuevo token además del original
  assert.equal(db.tokens.size, 2);
});

test('5. logout() válido utiliza el mismo cliente para BEGIN, FOR UPDATE, UPDATE y COMMIT, es idempotente y nunca llama pool.query()', async () => {
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

  // Primera llamada a logout
  const res1 = await service.logout(`${jti}.${raw}`);
  assert.deepEqual(res1, { ok: true });
  const firstRevokedAt = db.tokens.get(jti).revoked_at;
  assert.ok(firstRevokedAt);

  // Segunda llamada idempotente con el mismo token
  const res2 = await service.logout(`${jti}.${raw}`);
  assert.deepEqual(res2, { ok: true });
  assert.equal(db.tokens.get(jti).revoked_at, firstRevokedAt);

  // Tercera llamada con token vacío o inexistente también es idempotente
  const res3 = await service.logout('');
  assert.deepEqual(res3, { ok: true });
  const res4 = await service.logout('00000000-0000-4000-8000-000000000000.nonexistent');
  assert.deepEqual(res4, { ok: true });

  assert.equal(db.poolQueries.length, 0);
  for (const c of db.clients) {
    assert.equal(c.released, true);
    assert.equal(c.inTransaction, false);
  }
});

test('6. Un error inesperado durante logout() ejecuta ROLLBACK en el mismo cliente y libera la conexión', async () => {
  const jti = '66666666-6666-4666-8666-666666666666';
  const raw = 'error-logout-secret';
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

  db.failOnQuery = (sql) => {
    if (/UPDATE public\.app_refresh_tokens/i.test(sql)) {
      throw new Error('simulated database failure on update');
    }
  };

  const service = new LocalAuthService({ db, signToken: dummySignToken });

  await assert.rejects(
    () => service.logout(`${jti}.${raw}`),
    { message: 'simulated database failure on update' }
  );

  assert.equal(db.poolQueries.length, 0);
  assert.equal(db.clients.length, 1);
  const client = db.clients[0];
  assert.equal(client.released, true);
  assert.equal(client.inTransaction, false);
  assert.equal(client.queries[0].sql, 'BEGIN');
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
});
