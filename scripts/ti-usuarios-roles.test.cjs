const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

// Limpiamos variables de entorno JWT antes de importar módulos compilados
delete process.env.JWKS_PRIVATE_PATH;
delete process.env.JWKS_PUBLIC_PATH;
delete process.env.ACTIVE_KID_FILE;
delete process.env.JWT_ISSUER;
delete process.env.JWT_ISSUER_ALLOWLIST;
delete process.env.JWT_AUDIENCE;

const { signAccessToken, clearJwtKeyCache } = require('../dist/auth/jwt');
const { clearRequireAuthCache } = require('../dist/auth/requireAuth');
const { pool } = require('../dist/db/pool');
const tiUsuariosRoutes = require('../dist/routes/tiUsuarios').default;

// Claves RSA-2048 efímeras en directorio temporal aislado (no lee keys/ del repositorio)
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-ti-usuarios-roles-test-'));
const privPath = path.join(tmpRoot, 'priv.jwk.json');
const pubPath = path.join(tmpRoot, 'pub.jwk.json');
const kidPath = path.join(tmpRoot, 'ACTIVE_KID');
const TEST_KID = 'test_kid_ti_2a';
const TEST_ISSUER = 'https://imssb-bc.local';
const TEST_AUDIENCE = 'imssb-bc';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.writeFileSync(
  pubPath,
  JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: TEST_KID, alg: 'RS256' }] }),
  'utf-8'
);
fs.writeFileSync(
  privPath,
  JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), kid: TEST_KID, alg: 'RS256' }] }),
  'utf-8'
);
fs.writeFileSync(kidPath, TEST_KID, 'utf-8');

function configureTestJwtEnv() {
  clearJwtKeyCache();
  clearRequireAuthCache();
  process.env.JWKS_PRIVATE_PATH = privPath;
  process.env.JWKS_PUBLIC_PATH = pubPath;
  process.env.ACTIVE_KID_FILE = kidPath;
  process.env.JWT_ISSUER = TEST_ISSUER;
  process.env.JWT_ISSUER_ALLOWLIST = TEST_ISSUER;
  process.env.JWT_AUDIENCE = TEST_AUDIENCE;
  process.env.ACCESS_TTL_SECONDS = '900';
}

// Datos simulados en memoria (cero conexiones reales a PostgreSQL)
const MOCK_ROLES_DB = [
  { id: 'aaaa1111-0000-0000-0000-000000000001', code: 'ADMIN_TIC', description: 'Administrador Global TIC', internal_secret: 'should_not_leak' },
  { id: 'aaaa1111-0000-0000-0000-000000000002', code: 'CONSULTA_TIC', description: 'Consulta TIC' },
  { id: 'aaaa1111-0000-0000-0000-000000000003', code: 'OPER_TIC', description: null },
  { id: 'aaaa1111-0000-0000-0000-000000000004', code: 'RECURSOS_HUMANOS', description: 'Gestión de Personal RH' },
];

const MOCK_USERS_DB = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin.ti@imssbienestar.gob.mx',
    name: 'Admin TI Global',
    status: 'ACTIVE',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$SECRET_HASH_1',
    hashed_token: 'SECRET_REFRESH_HASH_1',
    refresh_token: 'RAW_REFRESH_TOKEN_1',
    persona_id: 101,
    nombre_completo: 'Carlos Admin TIC',
    unidad_medica_id: 10,
    unidad_medica: 'Hospital General Tijuana',
    roles: [
      { code: 'ADMIN_TIC', scope_type: 'GLOBAL', scope_id: '*', role_id: 'secret-role-id' },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'multirole.user@imssbienestar.gob.mx',
    name: 'Usuario Multi Rol',
    status: 'ACTIVE',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$SECRET_HASH_2',
    persona_id: 102,
    nombre_completo: 'María Multi Rol',
    unidad_medica_id: null,
    unidad_medica: null,
    roles: [
      { code: 'CONSULTA_TIC', scope_type: 'CLUES', scope_id: 'BCIMB000010' },
      { code: 'OPER_TIC', scope_type: 'CLUES', scope_id: 'BCIMB000020' },
      { code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' },
    ],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'sin.persona@imssbienestar.gob.mx',
    name: 'Cuenta Sin Persona',
    status: 'SUSPENDED',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$SECRET_HASH_3',
    persona_id: null,
    nombre_completo: null,
    unidad_medica_id: null,
    unidad_medica: null,
    roles: [],
  },
];

let capturedQueries = [];
let forceDbError = false;
const originalPoolQuery = pool.query.bind(pool);

pool.query = async (sql, params = []) => {
  const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
  capturedQueries.push({ sql: normalizedSql, params });

  if (forceDbError) {
    const dbErr = new Error('FATAL: password authentication failed for user "postgres_prod_secret"');
    dbErr.code = '28P01';
    throw dbErr;
  }

  // Mock de GET /api/ti/roles
  if (/FROM public\.app_roles\b/i.test(normalizedSql) && !/FROM public\.app_users\b/i.test(normalizedSql)) {
    return {
      rows: MOCK_ROLES_DB.map((r) => ({ ...r })),
      rowCount: MOCK_ROLES_DB.length,
    };
  }

  // Mock de GET /api/ti/usuarios
  if (/FROM public\.app_users u\b/i.test(normalizedSql)) {
    let filtered = MOCK_USERS_DB.map((u) => ({ ...u }));

    const hasQ = /LIKE '%' \|\| \$1 \|\| '%'/i.test(normalizedSql);
    const hasStatusAs1 = /UPPER\(TRIM\(u\.status\)\) = \$1/i.test(normalizedSql);
    const hasStatusAs2 = /UPPER\(TRIM\(u\.status\)\) = \$2/i.test(normalizedSql);

    if (hasQ) {
      const qVal = String(params[0] || '').toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.email.toLowerCase().includes(qVal) ||
          u.name.toLowerCase().includes(qVal) ||
          (u.nombre_completo && u.nombre_completo.toLowerCase().includes(qVal))
      );
    }

    if (hasStatusAs1) {
      const stVal = String(params[0] || '').toUpperCase();
      filtered = filtered.filter((u) => u.status.toUpperCase() === stVal);
    } else if (hasStatusAs2) {
      const stVal = String(params[1] || '').toUpperCase();
      filtered = filtered.filter((u) => u.status.toUpperCase() === stVal);
    }

    const limit = Number(params[params.length - 2]);
    const offset = Number(params[params.length - 1]);
    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit).map((u) => ({
      ...u,
      total: String(total),
    }));

    return {
      rows: paged,
      rowCount: paged.length,
    };
  }

  throw new Error(`Consulta SQL no esperada en mock: ${normalizedSql}`);
};

const argon2 = require('argon2');
const originalPoolConnect = pool.connect.bind(pool);
let mockTxUsers = new Map();
let mockActiveGlobalAdminIds = [];
let mockRevokedTokensCount = 2;
let failOnTxSqlMatch = null;
let lastUpdatedPasswordHash = null;
let txEvents = [];
let mockTxUserRoles = new Map();
const MOCK_VALID_CLUES = new Set(['BCIMB00001', 'BCIMB00002']);
let mockTxPersonas = new Map();
let lastInsertedAppUser = null;
let simulateInsertUniqueViolation = false;

pool.connect = async () => {
  return {
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      txEvents.push({ sql: normalizedSql, params });

      if (failOnTxSqlMatch && normalizedSql.includes(failOnTxSqlMatch)) {
        throw new Error(`Simulated TX DB error on ${failOnTxSqlMatch}`);
      }

      if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (/^SELECT id, status FROM public\.app_users WHERE id = \$1 FOR UPDATE$/i.test(normalizedSql)) {
        const u = mockTxUsers.get(params[0]);
        return u ? { rows: [{ id: u.id, status: u.status }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/^SELECT id FROM public\.app_users WHERE id = \$1 FOR UPDATE$/i.test(normalizedSql)) {
        const u = mockTxUsers.get(params[0]);
        return u ? { rows: [{ id: u.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/^SELECT id FROM public\.app_roles WHERE code = 'ADMIN_TIC' FOR UPDATE$/i.test(normalizedSql)) {
        return { rows: [{ id: 'aaaa1111-0000-0000-0000-000000000001' }], rowCount: 1 };
      }

      if (/FROM public\.app_users u JOIN public\.app_user_roles ur/i.test(normalizedSql)) {
        return {
          rows: mockActiveGlobalAdminIds.map((id) => ({ id })),
          rowCount: mockActiveGlobalAdminIds.length,
        };
      }

      if (/^UPDATE public\.app_users SET status = \$2 WHERE id = \$1$/i.test(normalizedSql)) {
        const u = mockTxUsers.get(params[0]);
        if (u) u.status = params[1];
        return { rows: [], rowCount: u ? 1 : 0 };
      }

      if (/^UPDATE public\.app_users SET password_hash = \$2 WHERE id = \$1$/i.test(normalizedSql)) {
        lastUpdatedPasswordHash = params[1];
        return { rows: [], rowCount: 1 };
      }

      if (/^UPDATE public\.app_refresh_tokens SET revoked_at = COALESCE\(revoked_at, now\(\)\) WHERE user_id = \$1 AND revoked_at IS NULL$/i.test(normalizedSql)) {
        return { rows: [], rowCount: mockRevokedTokensCount };
      }

      if (/^SELECT id, code FROM public\.app_roles WHERE code = ANY\(\$1::text\[\]\)$/i.test(normalizedSql)) {
        const requested = Array.isArray(params[0]) ? params[0] : [];
        const matched = MOCK_ROLES_DB.filter((r) => requested.includes(r.code));
        return { rows: matched.map((r) => ({ id: r.id, code: r.code })), rowCount: matched.length };
      }

      if (/FROM public\.unidad_medica WHERE UPPER\(TRIM\(cluesimb\)\) = ANY\(\$1::text\[\]\)$/i.test(normalizedSql)) {
        const requested = Array.isArray(params[0]) ? params[0] : [];
        const matched = requested.filter((c) => MOCK_VALID_CLUES.has(c));
        return { rows: matched.map((clues) => ({ clues })), rowCount: matched.length };
      }

      if (/^DELETE FROM public\.app_user_roles WHERE user_id = \$1$/i.test(normalizedSql)) {
        mockTxUserRoles.set(params[0], []);
        return { rows: [], rowCount: 1 };
      }

      if (/^INSERT INTO public\.app_user_roles \(user_id, role_id, scope_type, scope_id\) VALUES \(\$1, \$2, \$3, \$4\)$/i.test(normalizedSql)) {
        const [uId, roleId, scopeType, scopeId] = params;
        const roleObj = MOCK_ROLES_DB.find((r) => r.id === roleId);
        const list = mockTxUserRoles.get(uId) || [];
        list.push({ code: roleObj ? roleObj.code : roleId, scope_type: scopeType, scope_id: scopeId });
        mockTxUserRoles.set(uId, list);
        return { rows: [], rowCount: 1 };
      }

      if (/SELECT r\.code, ur\.scope_type, ur\.scope_id FROM public\.app_user_roles ur JOIN public\.app_roles r/i.test(normalizedSql)) {
        const list = (mockTxUserRoles.get(params[0]) || []).slice().sort((a, b) => {
          return (
            a.code.localeCompare(b.code) ||
            a.scope_type.localeCompare(b.scope_type) ||
            a.scope_id.localeCompare(b.scope_id)
          );
        });
        return { rows: list, rowCount: list.length };
      }

      if (/^SELECT id, nombre_completo, activo FROM public\.persona WHERE id = \$1 FOR UPDATE$/i.test(normalizedSql)) {
        const p = mockTxPersonas.get(params[0]);
        return p ? { rows: [{ ...p }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/^SELECT id FROM public\.app_users WHERE persona_id = \$1 LIMIT 1$/i.test(normalizedSql)) {
        const found = Array.from(mockTxUsers.values()).find((u) => u.persona_id === params[0]);
        return found ? { rows: [{ id: found.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/^SELECT id FROM public\.app_users WHERE LOWER\(TRIM\(email\)\) = \$1 LIMIT 1$/i.test(normalizedSql)) {
        const found = Array.from(mockTxUsers.values()).find(
          (u) => u.email && u.email.trim().toLowerCase() === params[0]
        );
        return found ? { rows: [{ id: found.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (/^INSERT INTO public\.app_users \(email, name, password_hash, status, persona_id\)/i.test(normalizedSql)) {
        if (simulateInsertUniqueViolation) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
        const [email, name, passwordHash, status, personaId] = params;
        const newId = '55555555-5555-4555-8555-555555555555';
        lastInsertedAppUser = { id: newId, email, name, password_hash: passwordHash, status, persona_id: personaId };
        mockTxUsers.set(newId, { ...lastInsertedAppUser });
        return {
          rows: [{ id: newId, email, name, status, persona_id: personaId }],
          rowCount: 1,
        };
      }

      throw new Error(`Consulta TX SQL no esperada en mock: ${normalizedSql}`);
    },
    release() {
      txEvents.push({ sql: 'RELEASE', params: [] });
    },
  };
};

const app = express();
app.use(express.json());
app.use('/api/ti', tiUsuariosRoutes);

let server;
let baseUrl;

test.before(async () => {
  configureTestJwtEnv();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  pool.query = originalPoolQuery;
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

test.beforeEach(() => {
  capturedQueries = [];
  forceDbError = false;
});

async function issueTokenForRoles(roles, sub = '11111111-1111-1111-1111-111111111111') {
  configureTestJwtEnv();
  return await signAccessToken({
    sub,
    email: 'admin.ti@imssbienestar.gob.mx',
    name: 'Admin TI Global',
    roles,
  });
}

async function requestJson(method, routePath, { token, body } = {}) {
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

test('1. Acceso permitido con ADMIN_TIC + GLOBAL + id: null en GET /api/ti/roles y GET /api/ti/usuarios', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  const rolesRes = await requestJson('GET', '/api/ti/roles', { token });
  assert.equal(rolesRes.status, 200);
  assert.ok(Array.isArray(rolesRes.body));
  assert.equal(rolesRes.body.length, 4);
  assert.deepEqual(rolesRes.body[0], {
    id: 'aaaa1111-0000-0000-0000-000000000001',
    code: 'ADMIN_TIC',
    description: 'Administrador Global TIC',
  });

  const usersRes = await requestJson('GET', '/api/ti/usuarios', { token });
  assert.equal(usersRes.status, 200);
  assert.equal(usersRes.body.page, 1);
  assert.equal(usersRes.body.pageSize, 20);
  assert.equal(usersRes.body.total, 3);
  assert.equal(usersRes.body.items.length, 3);
});

test('2. Acceso rechazado sin sesión (401) o con token inválido (401)', async () => {
  for (const endpoint of ['/api/ti/roles', '/api/ti/usuarios']) {
    const noToken = await requestJson('GET', endpoint);
    assert.equal(noToken.status, 401, `Sin token debe devolver 401 en ${endpoint}`);
    assert.deepEqual(noToken.body, { error: 'Missing Bearer token' });

    const badToken = await requestJson('GET', endpoint, { token: 'invalid.jwt.token' });
    assert.equal(badToken.status, 401, `Token inválido debe devolver 401 en ${endpoint}`);
  }
  assert.equal(capturedQueries.length, 0, 'No debe ejecutar SQL cuando falla la autenticación');
});

test('3. Acceso rechazado con rol de RH u otros roles no autorizados (403)', async () => {
  const unauthorizedRoles = [
    [{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }],
    [{ code: 'ADMIN_RH', scope: 'GLOBAL', id: null }],
    [{ code: 'OPER_TIC', scope: 'GLOBAL', id: null }],
    [{ code: 'CONSULTA_TIC', scope: 'GLOBAL', id: null }],
    [{ code: 'LECTOR_TIC', scope: 'GLOBAL', id: null }],
    [{ code: 'SOLICITUDES_ABASTO', scope: 'GLOBAL', id: null }],
    [],
  ];

  for (const roles of unauthorizedRoles) {
    const token = await issueTokenForRoles(roles);
    for (const endpoint of ['/api/ti/roles', '/api/ti/usuarios']) {
      const res = await requestJson('GET', endpoint, { token });
      assert.equal(res.status, 403, `Rol ${JSON.stringify(roles)} debe recibir 403 en ${endpoint}`);
      assert.deepEqual(res.body, { error: 'Permiso insuficiente' });
    }
  }
  assert.equal(capturedQueries.length, 0, 'No debe ejecutar SQL cuando falla la autorización de rol');
});

test('4. Acceso rechazado con ADMIN_TIC no global (CLUES, DEPTO o id distinto de null) (403) y métodos de escritura no expuestos (404)', async () => {
  const nonGlobalAdminTicVariants = [
    [{ code: 'ADMIN_TIC', scope: 'CLUES', id: 'BCIMB000010' }],
    [{ code: 'ADMIN_TIC', scope: 'DEPTO', id: 'TI' }],
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: '*' }],
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: '10' }],
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL' }],
    ['ADMIN_TIC'],
  ];

  for (const roles of nonGlobalAdminTicVariants) {
    const token = await issueTokenForRoles(roles);
    for (const endpoint of ['/api/ti/roles', '/api/ti/usuarios']) {
      const res = await requestJson('GET', endpoint, { token });
      assert.equal(res.status, 403, `Variante ${JSON.stringify(roles)} debe recibir 403 en ${endpoint}`);
      assert.deepEqual(res.body, { error: 'Permiso insuficiente' });
    }
  }

  // Verificar que POST, PUT, PATCH y DELETE no existen (solo lectura en TI-2A)
  const validToken = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const endpoint of ['/api/ti/roles', '/api/ti/usuarios']) {
      const res = await requestJson(method, endpoint, { token: validToken, body: {} });
      assert.equal(res.status, 404, `${method} ${endpoint} no debe estar habilitado en TI-2A`);
    }
  }
});

test('5. Ausencia absoluta de password_hash, tokens o material criptográfico en SQL y en la respuesta JSON', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  const rolesRes = await requestJson('GET', '/api/ti/roles', { token });
  assert.equal(rolesRes.status, 200);
  for (const role of rolesRes.body) {
    assert.deepEqual(Object.keys(role).sort(), ['code', 'description', 'id']);
    assert.equal('internal_secret' in role, false);
  }

  const usersRes = await requestJson('GET', '/api/ti/usuarios', { token });
  assert.equal(usersRes.status, 200);

  const rawJson = JSON.stringify(usersRes.body);
  assert.equal(rawJson.includes('password_hash'), false, 'No debe incluir password_hash');
  assert.equal(rawJson.includes('$argon2'), false, 'No debe filtrar hashes Argon2');
  assert.equal(rawJson.includes('hashed_token'), false, 'No debe incluir hashed_token');
  assert.equal(rawJson.includes('refresh_token'), false, 'No debe incluir refresh_token');
  assert.equal(rawJson.includes('secret-role-id'), false, 'No debe incluir campos internos no contratados en roles');

  for (const item of usersRes.body.items) {
    assert.deepEqual(
      Object.keys(item).sort(),
      ['email', 'id', 'name', 'nombre_completo', 'persona_id', 'roles', 'status', 'unidad_medica', 'unidad_medica_id']
    );
    for (const r of item.roles) {
      assert.deepEqual(Object.keys(r).sort(), ['code', 'scope_id', 'scope_type']);
    }
  }

  // Verificar que el SQL generado nunca selecciona password_hash ni refresh_tokens
  assert.equal(capturedQueries.length, 2);
  for (const q of capturedQueries) {
    assert.equal(/password_hash/i.test(q.sql), false, 'SQL no debe mencionar password_hash');
    assert.equal(/refresh_tokens/i.test(q.sql), false, 'SQL no debe consultar refresh_tokens');
    assert.equal(/SELECT\s+\*/i.test(q.sql), false, 'SQL no debe usar SELECT *');
  }
});

test('6. Paginación y filtros q / status con SQL parametrizado y límite máximo pageSize = 100', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  const res = await requestJson(
    'GET',
    '/api/ti/usuarios?q=carlos&status=active&page=2&pageSize=250',
    { token }
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.pageSize, 100, 'pageSize debe toparse en 100');

  assert.equal(capturedQueries.length, 1);
  const { sql, params } = capturedQueries[0];
  assert.match(sql, /LOWER\(COALESCE\(u\.email, ''\)\) LIKE '%' \|\| \$1 \|\| '%'/);
  assert.match(sql, /LOWER\(COALESCE\(u\.name, ''\)\) LIKE '%' \|\| \$1 \|\| '%'/);
  assert.match(sql, /LOWER\(COALESCE\(p\.nombre_completo, ''\)\) LIKE '%' \|\| \$1 \|\| '%'/);
  assert.match(sql, /UPPER\(TRIM\(u\.status\)\) = \$2/);
  assert.match(sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(params, ['carlos', 'ACTIVE', 100, 100]);
});

test('7. Usuarios sin persona vinculada y personas sin unidad médica se preservan mediante LEFT JOIN', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  const res = await requestJson('GET', '/api/ti/usuarios', { token });
  assert.equal(res.status, 200);

  const { sql } = capturedQueries[0];
  assert.match(sql, /LEFT JOIN public\.persona p ON p\.id = u\.persona_id/i);
  assert.match(sql, /LEFT JOIN public\.unidad_medica um ON um\.id = p\.unidad_medica_id/i);

  // Usuario con persona pero sin unidad médica
  const userSinUnidad = res.body.items.find((u) => u.id === '22222222-2222-2222-2222-222222222222');
  assert.ok(userSinUnidad);
  assert.equal(userSinUnidad.persona_id, 102);
  assert.equal(userSinUnidad.nombre_completo, 'María Multi Rol');
  assert.equal(userSinUnidad.unidad_medica_id, null);
  assert.equal(userSinUnidad.unidad_medica, null);

  // Usuario sin persona vinculada
  const userSinPersona = res.body.items.find((u) => u.id === '33333333-3333-3333-3333-333333333333');
  assert.ok(userSinPersona);
  assert.equal(userSinPersona.persona_id, null);
  assert.equal(userSinPersona.nombre_completo, null);
  assert.equal(userSinPersona.unidad_medica_id, null);
  assert.equal(userSinPersona.unidad_medica, null);
  assert.deepEqual(userSinPersona.roles, []);
});

test('8. Usuarios con múltiples roles y alcances no multiplican filas y devuelven roles ordenados determinísticamente', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  const res = await requestJson('GET', '/api/ti/usuarios?q=multirole', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1, 'Un usuario con 3 roles debe contarse como 1 solo registro');
  assert.equal(res.body.items.length, 1, 'No debe multiplicar filas por cada rol');

  const multiRoleUser = res.body.items[0];
  assert.equal(multiRoleUser.id, '22222222-2222-2222-2222-222222222222');
  assert.deepEqual(multiRoleUser.roles, [
    { code: 'CONSULTA_TIC', scope_type: 'CLUES', scope_id: 'BCIMB000010' },
    { code: 'OPER_TIC', scope_type: 'CLUES', scope_id: 'BCIMB000020' },
    { code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' },
  ]);

  const { sql } = capturedQueries[0];
  assert.match(sql, /LEFT JOIN LATERAL/i);
  assert.match(sql, /ORDER BY r\.code ASC, ur\.scope_type::text ASC, ur\.scope_id ASC/i);
});

test('9. Manejo seguro de parámetros inválidos (400) y errores internos sin filtrar detalles de BD (500)', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  const invalidQueries = [
    '/api/ti/usuarios?page=0',
    '/api/ti/usuarios?page=-1',
    '/api/ti/usuarios?page=abc',
    '/api/ti/usuarios?page=1.5',
    '/api/ti/usuarios?pageSize=0',
    '/api/ti/usuarios?pageSize=-10',
    '/api/ti/usuarios?pageSize=xyz',
    '/api/ti/usuarios?q=a&q=b',
    '/api/ti/usuarios?status=ACTIVE&status=SUSPENDED',
    '/api/ti/usuarios?page=1&page=2',
    `/api/ti/usuarios?q=${'x'.repeat(201)}`,
    `/api/ti/usuarios?status=${'x'.repeat(51)}`,
  ];

  for (const url of invalidQueries) {
    const res = await requestJson('GET', url, { token });
    assert.equal(res.status, 400, `Query inválida ${url} debe devolver 400`);
    assert.equal(res.body.ok, false);
  }
  assert.equal(capturedQueries.length, 0, 'No debe ejecutar SQL cuando los parámetros son inválidos');

  // Simular fallo de base de datos y verificar que no se filtra el mensaje interno
  forceDbError = true;
  const errRoles = await requestJson('GET', '/api/ti/roles', { token });
  assert.equal(errRoles.status, 500);
  assert.deepEqual(errRoles.body, { ok: false, error: 'Error al consultar roles' });
  assert.equal(JSON.stringify(errRoles.body).includes('postgres_prod_secret'), false);

  const errUsers = await requestJson('GET', '/api/ti/usuarios', { token });
  assert.equal(errUsers.status, 500);
  assert.deepEqual(errUsers.body, { ok: false, error: 'Error al listar usuarios' });
  assert.equal(JSON.stringify(errUsers.body).includes('postgres_prod_secret'), false);
});

test('10 (TI-2D.2A). PATCH /api/ti/usuarios/:id/status cambia estado, revoca app_refresh_tokens, protege último ADMIN_TIC GLOBAL (409) y hace ROLLBACK ante error', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);
  const adminId = '11111111-1111-4111-8111-111111111111';
  const normalId = '22222222-2222-4222-8222-222222222222';

  mockTxUsers = new Map([
    [adminId, { id: adminId, status: 'ACTIVE' }],
    [normalId, { id: normalId, status: 'ACTIVE' }],
  ]);
  mockActiveGlobalAdminIds = [adminId];
  mockRevokedTokensCount = 3;
  failOnTxSqlMatch = null;
  txEvents = [];

  // 1) Suspender usuario normal (ACTIVE -> SUSPENDED) revoca refresh tokens
  const resSuspend = await requestJson('PATCH', `/api/ti/usuarios/${normalId}/status`, {
    token,
    body: { status: 'SUSPENDED' },
  });
  assert.equal(resSuspend.status, 200);
  assert.deepEqual(resSuspend.body, { ok: true, id: normalId, status: 'SUSPENDED', revoked_sessions: 3 });
  assert.equal(mockTxUsers.get(normalId).status, 'SUSPENDED');

  // 2) Reactivar usuario (SUSPENDED -> ACTIVE) no revoca ni reactiva sesiones
  const resActivate = await requestJson('PATCH', `/api/ti/usuarios/${normalId}/status`, {
    token,
    body: { status: 'ACTIVE' },
  });
  assert.equal(resActivate.status, 200);
  assert.deepEqual(resActivate.body, { ok: true, id: normalId, status: 'ACTIVE', revoked_sessions: 0 });

  // 3) Bloqueo del último ADMIN_TIC GLOBAL activo (HTTP 409)
  txEvents = [];
  const resLastAdmin = await requestJson('PATCH', `/api/ti/usuarios/${adminId}/status`, {
    token,
    body: { status: 'SUSPENDED' },
  });
  assert.equal(resLastAdmin.status, 409);
  assert.equal(resLastAdmin.body.ok, false);
  assert.equal(mockTxUsers.get(adminId).status, 'ACTIVE');
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));

  // 4) Estado inválido (400), payload con propiedades extra (400), cuenta inexistente (404)
  const resBadStatus = await requestJson('PATCH', `/api/ti/usuarios/${normalId}/status`, {
    token,
    body: { status: 'DELETED' },
  });
  assert.equal(resBadStatus.status, 400);

  const resMassAssign = await requestJson('PATCH', `/api/ti/usuarios/${normalId}/status`, {
    token,
    body: { status: 'ACTIVE', persona_id: 999 },
  });
  assert.equal(resMassAssign.status, 400);

  const resNotFound = await requestJson('PATCH', '/api/ti/usuarios/99999999-9999-4999-8999-999999999999/status', {
    token,
    body: { status: 'SUSPENDED' },
  });
  assert.equal(resNotFound.status, 404);
});

test('11 (TI-2D.2A). PUT /api/ti/usuarios/:id/password genera hash argon2 compatible, revoca sesiones y no expone secretos', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);
  const normalId = '22222222-2222-4222-8222-222222222222';

  mockTxUsers = new Map([[normalId, { id: normalId, status: 'ACTIVE' }]]);
  mockRevokedTokensCount = 2;
  failOnTxSqlMatch = null;
  lastUpdatedPasswordHash = null;
  txEvents = [];

  const newPass = 'ClaveSeguraTI#2026';
  const res = await requestJson('PUT', `/api/ti/usuarios/${normalId}/password`, {
    token,
    body: { password: newPass },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, id: normalId, revoked_sessions: 2 });
  assert.ok(lastUpdatedPasswordHash, 'Debe persistir password_hash');
  assert.equal(await argon2.verify(lastUpdatedPasswordHash, newPass), true, 'El hash debe ser verificable por argon2');
  assert.equal(JSON.stringify(res.body).includes(newPass), false);
  assert.equal(JSON.stringify(res.body).includes('argon2'), false);

  // Contraseña corta (400) y ROLLBACK ante error SQL (500)
  const resShort = await requestJson('PUT', `/api/ti/usuarios/${normalId}/password`, {
    token,
    body: { password: '123' },
  });
  assert.equal(resShort.status, 400);

  failOnTxSqlMatch = 'UPDATE public.app_refresh_tokens';
  txEvents = [];
  const resDbErr = await requestJson('PUT', `/api/ti/usuarios/${normalId}/password`, {
    token,
    body: { password: newPass },
  });
  assert.equal(resDbErr.status, 500);
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
  failOnTxSqlMatch = null;
});

test('15 (TI-2D.3B). POST /api/ti/usuarios NO está registrado en Express y el controlador/servicio crea cuentas SSO válidas', async () => {
  const adminToken = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  // 18. Confirmar que POST /api/ti/usuarios NO está registrado en las rutas de Express (404)
  const resRouteNotMounted = await requestJson('POST', '/api/ti/usuarios', {
    token: adminToken,
    body: { persona_id: 101, email: 'nuevo@ejemplo.gob.mx', password: 'ClaveSeguraTI#2026' },
  });
  assert.equal(resRouteNotMounted.status, 404);

  // Invocar el controlador directamente en aislamiento
  const TiUsuariosController = require('../dist/controllers/tiUsuarios.controller').default;
  const controller = new TiUsuariosController();
  const invokeCreate = async (body) => {
    let statusCode = 200;
    let jsonBody = null;
    const req = { body };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonBody = payload;
        return this;
      },
    };
    await controller.createUsuario(req, res);
    return { status: statusCode, body: jsonBody };
  };

  mockTxPersonas = new Map([
    [101, { id: 101, nombre_completo: 'María Pérez', activo: true }],
    [102, { id: 102, nombre_completo: 'Juan Inactivo', activo: false }],
  ]);
  mockTxUsers = new Map();
  lastInsertedAppUser = null;
  simulateInsertUniqueViolation = false;
  txEvents = [];

  // 1, 8, 9, 10, 12, 13, 14, 17: Alta correcta con nombre derivado y status ACTIVE por defecto
  const pass = 'ClaveSeguraTI#2026';
  const resOk = await invokeCreate({
    persona_id: 101,
    email: '  Maria.Perez@Ejemplo.GOB.MX  ',
    password: pass,
  });
  assert.equal(resOk.status, 201);
  assert.deepEqual(resOk.body, {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'maria.perez@ejemplo.gob.mx',
    name: 'María Pérez',
    status: 'ACTIVE',
    persona_id: 101,
  });
  assert.equal('password' in resOk.body, false);
  assert.equal('password_hash' in resOk.body, false);
  assert.ok(lastInsertedAppUser);
  assert.equal(await argon2.verify(lastInsertedAppUser.password_hash, pass), true);
  assert.equal(txEvents.some((e) => e.sql.includes('INSERT INTO public.persona')), false);
  assert.equal(txEvents.some((e) => e.sql.includes('app_user_roles')), false);
  assert.ok(txEvents.some((e) => e.sql === 'COMMIT'));

  // 2. Persona inexistente (404)
  assert.equal((await invokeCreate({ persona_id: 999, email: 'a@b.mx', password: pass })).status, 404);
  // 3. Persona inactiva (404)
  assert.equal((await invokeCreate({ persona_id: 102, email: 'a@b.mx', password: pass })).status, 404);
  // 4. Persona con cuenta SSO existente (409)
  assert.equal((await invokeCreate({ persona_id: 101, email: 'otro@b.mx', password: pass })).status, 409);
  // 5. Correo duplicado (409)
  mockTxPersonas.set(103, { id: 103, nombre_completo: 'Otra Persona', activo: true });
  assert.equal((await invokeCreate({ persona_id: 103, email: 'MARIA.PEREZ@ejemplo.gob.mx', password: pass })).status, 409);
  // 6. Correo inválido (400)
  assert.equal((await invokeCreate({ persona_id: 103, email: 'correo-invalido', password: pass })).status, 400);
  // 7. Contraseña inválida (400)
  assert.equal((await invokeCreate({ persona_id: 103, email: 'ok@b.mx', password: '123' })).status, 400);
  // 11. Rechazo de propiedades adicionales (400)
  assert.equal((await invokeCreate({ persona_id: 103, email: 'ok@b.mx', password: pass, roles: [] })).status, 400);

  // 16. Conflicto de unicidad concurrente (23505 -> 409) y ROLLBACK
  simulateInsertUniqueViolation = true;
  txEvents = [];
  const resConcurrent = await invokeCreate({ persona_id: 103, email: 'ok@b.mx', password: pass });
  assert.equal(resConcurrent.status, 409);
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
  simulateInsertUniqueViolation = false;
});

test('12 (TI-2D.2A.1). Protección del último ADMIN_TIC GLOBAL usa scope_id = \'*\' y nunca scope_id IS NULL', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);
  const admin1 = '11111111-1111-4111-8111-111111111111';
  const admin2 = '22222222-2222-4222-8222-222222222222';
  const admin3 = '33333333-3333-4333-8333-333333333333';
  const cluesAdmin = '44444444-4444-4444-8444-444444444444';

  const assertGlobalAdminQueryContract = (events) => {
    const adminQuery = events.find(
      (e) => e.sql.includes('FROM public.app_users u') && e.sql.includes("r.code = 'ADMIN_TIC'")
    );
    assert.ok(adminQuery, 'Debe ejecutar consulta de administradores globales activos');
    assert.ok(
      /ur\.scope_id\s*=\s*'\*'/.test(adminQuery.sql),
      "La consulta SQL debe usar literalmente ur.scope_id = '*'"
    );
    assert.equal(
      /scope_id\s+IS\s+NULL/i.test(adminQuery.sql),
      false,
      'No debe usar scope_id IS NULL para localizar roles globales en PostgreSQL'
    );
    assert.ok(adminQuery.sql.includes('FOR UPDATE OF u'), 'Debe bloquear filas dentro de la transacción');
    assert.ok(events[0].sql === 'BEGIN', 'El bloqueo y verificación deben iniciar dentro de una transacción');
  };

  // Caso 1: Único ADMIN_TIC GLOBAL activo -> HTTP 409, sin UPDATE ni revocación de sesiones
  mockTxUsers = new Map([[admin1, { id: admin1, status: 'ACTIVE' }]]);
  mockActiveGlobalAdminIds = [admin1];
  txEvents = [];
  const resSingle = await requestJson('PATCH', `/api/ti/usuarios/${admin1}/status`, {
    token,
    body: { status: 'SUSPENDED' },
  });
  assert.equal(resSingle.status, 409);
  assert.equal(mockTxUsers.get(admin1).status, 'ACTIVE');
  assertGlobalAdminQueryContract(txEvents);
  assert.equal(txEvents.some((e) => e.sql.startsWith('UPDATE public.app_users')), false);
  assert.equal(txEvents.some((e) => e.sql.startsWith('UPDATE public.app_refresh_tokens')), false);
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));

  // Caso 2: Tres ADMIN_TIC GLOBAL activos -> permite suspender uno
  mockTxUsers = new Map([
    [admin1, { id: admin1, status: 'ACTIVE' }],
    [admin2, { id: admin2, status: 'ACTIVE' }],
    [admin3, { id: admin3, status: 'ACTIVE' }],
  ]);
  mockActiveGlobalAdminIds = [admin1, admin2, admin3];
  txEvents = [];
  const resThree = await requestJson('PATCH', `/api/ti/usuarios/${admin1}/status`, {
    token,
    body: { status: 'SUSPENDED' },
  });
  assert.equal(resThree.status, 200);
  assert.equal(mockTxUsers.get(admin1).status, 'SUSPENDED');
  assertGlobalAdminQueryContract(txEvents);
  assert.ok(txEvents.some((e) => e.sql === 'COMMIT'));

  // Caso 3: Un único ADMIN_TIC GLOBAL activo y otros suspendidos (y uno con scope CLUES) -> bloquea al último activo con 409
  mockTxUsers = new Map([
    [admin1, { id: admin1, status: 'SUSPENDED' }],
    [admin2, { id: admin2, status: 'ACTIVE' }],
    [cluesAdmin, { id: cluesAdmin, status: 'ACTIVE' }],
  ]);
  // Solo admin2 tiene scope_type = 'GLOBAL' y scope_id = '*' con status = 'ACTIVE'
  mockActiveGlobalAdminIds = [admin2];
  txEvents = [];
  const resLastWithSuspendedAndClues = await requestJson('PATCH', `/api/ti/usuarios/${admin2}/status`, {
    token,
    body: { status: 'SUSPENDED' },
  });
  assert.equal(resLastWithSuspendedAndClues.status, 409);
  assert.equal(mockTxUsers.get(admin2).status, 'ACTIVE');
  assertGlobalAdminQueryContract(txEvents);
  assert.equal(txEvents.some((e) => e.sql.startsWith('UPDATE public.app_users')), false);
  assert.equal(txEvents.some((e) => e.sql.startsWith('UPDATE public.app_refresh_tokens')), false);
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
});

test('13 (TI-2D.2B). PUT /api/ti/usuarios/:id/roles asigna roles válidos, persiste scope_id = \'*\', revoca refresh tokens y protege último ADMIN_TIC GLOBAL', async () => {
  const adminToken = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);
  const normalId = '22222222-2222-4222-8222-222222222222';
  const lastAdminId = '11111111-1111-4111-8111-111111111111';

  // 1. Asignación de RECURSOS_HUMANOS GLOBAL (scope_id = '*')
  mockTxUsers = new Map([
    [normalId, { id: normalId, status: 'ACTIVE' }],
    [lastAdminId, { id: lastAdminId, status: 'ACTIVE' }],
  ]);
  mockActiveGlobalAdminIds = [lastAdminId];
  mockTxUserRoles = new Map();
  txEvents = [];

  const resGlobal = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: { roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' }] },
  });
  assert.equal(resGlobal.status, 200);
  assert.deepEqual(resGlobal.body, {
    ok: true,
    id: normalId,
    roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' }],
  });
  assert.ok(txEvents.some((e) => e.sql.startsWith('UPDATE public.app_refresh_tokens')));
  assert.ok(txEvents.some((e) => e.sql === 'COMMIT'));

  // 2. Asignación de RECURSOS_HUMANOS CLUES válida (normalizada) y reemplazo atómico múltiple
  txEvents = [];
  const resMulti = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: {
      roles: [
        { code: 'RECURSOS_HUMANOS', scope_type: 'CLUES', scope_id: 'bcimb00002' },
        { code: 'ADMIN_TIC', scope_type: 'CLUES', scope_id: 'BCIMB00001' },
      ],
    },
  });
  assert.equal(resMulti.status, 200);
  assert.deepEqual(resMulti.body, {
    ok: true,
    id: normalId,
    roles: [
      { code: 'ADMIN_TIC', scope_type: 'CLUES', scope_id: 'BCIMB00001' },
      { code: 'RECURSOS_HUMANOS', scope_type: 'CLUES', scope_id: 'BCIMB00002' },
    ],
  });

  // 3. roles: [] para retirar roles cuando está permitido
  const resEmpty = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: { roles: [] },
  });
  assert.equal(resEmpty.status, 200);
  assert.deepEqual(resEmpty.body, { ok: true, id: normalId, roles: [] });

  // 4. Protección del último ADMIN_TIC GLOBAL (409)
  txEvents = [];
  const resLastAdmin = await requestJson('PUT', `/api/ti/usuarios/${lastAdminId}/roles`, {
    token: adminToken,
    body: { roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' }] },
  });
  assert.equal(resLastAdmin.status, 409);
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
});

test('14 (TI-2D.2B). PUT /api/ti/usuarios/:id/roles rechaza CLUES/rol inexistente, duplicados, GLOBAL != *, DEPTO, 404, 403 y hace ROLLBACK', async () => {
  const adminToken = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);
  const rhToken = await issueTokenForRoles([{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }]);
  const normalId = '22222222-2222-4222-8222-222222222222';
  const missingId = '99999999-9999-4999-8999-999999999999';

  mockTxUsers = new Map([[normalId, { id: normalId, status: 'ACTIVE' }]]);
  mockActiveGlobalAdminIds = [];
  mockTxUserRoles = new Map();

  // Sin autorización (403)
  const resForbidden = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: rhToken,
    body: { roles: [] },
  });
  assert.equal(resForbidden.status, 403);

  // Usuario inexistente (404)
  const resNotFound = await requestJson('PUT', `/api/ti/usuarios/${missingId}/roles`, {
    token: adminToken,
    body: { roles: [] },
  });
  assert.equal(resNotFound.status, 404);

  // CLUES inexistente (400)
  const resBadClues = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: { roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'CLUES', scope_id: 'NO_EXISTE' }] },
  });
  assert.equal(resBadClues.status, 400);

  // Rol inexistente (400)
  const resBadRole = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: { roles: [{ code: 'ROL_FICTICIO', scope_type: 'GLOBAL', scope_id: '*' }] },
  });
  assert.equal(resBadRole.status, 400);

  // Duplicados (400)
  const resDup = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: {
      roles: [
        { code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' },
        { code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' },
      ],
    },
  });
  assert.equal(resDup.status, 400);

  // GLOBAL con scope_id != '*' (400)
  const resBadGlobal = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: { roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: 'null' }] },
  });
  assert.equal(resBadGlobal.status, 400);

  // DEPTO bloqueado por falta de catálogo verificable (400)
  const resDepto = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: { roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'DEPTO', scope_id: 'TI' }] },
  });
  assert.equal(resDepto.status, 400);

  // ROLLBACK ante error SQL (500)
  failOnTxSqlMatch = 'DELETE FROM public.app_user_roles';
  txEvents = [];
  const resDbErr = await requestJson('PUT', `/api/ti/usuarios/${normalId}/roles`, {
    token: adminToken,
    body: { roles: [{ code: 'RECURSOS_HUMANOS', scope_type: 'GLOBAL', scope_id: '*' }] },
  });
  assert.equal(resDbErr.status, 500);
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
  failOnTxSqlMatch = null;
});

test('15 (TI-2D.3B). POST /api/ti/usuarios NO está registrado en Express y el controlador/servicio crea cuentas SSO válidas', async () => {
  const adminToken = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  // 18. Confirmar que POST /api/ti/usuarios NO está registrado en las rutas de Express (404)
  const resRouteNotMounted = await requestJson('POST', '/api/ti/usuarios', {
    token: adminToken,
    body: { persona_id: 101, email: 'nuevo@ejemplo.gob.mx', password: 'ClaveSeguraTI#2026' },
  });
  assert.equal(resRouteNotMounted.status, 404);

  // Invocar el controlador directamente en aislamiento
  const TiUsuariosController = require('../dist/controllers/tiUsuarios.controller').default;
  const controller = new TiUsuariosController();
  const invokeCreate = async (body) => {
    let statusCode = 200;
    let jsonBody = null;
    const req = { body };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonBody = payload;
        return this;
      },
    };
    await controller.createUsuario(req, res);
    return { status: statusCode, body: jsonBody };
  };

  mockTxPersonas = new Map([
    [101, { id: 101, nombre_completo: 'María Pérez', activo: true }],
    [102, { id: 102, nombre_completo: 'Juan Inactivo', activo: false }],
  ]);
  mockTxUsers = new Map();
  lastInsertedAppUser = null;
  simulateInsertUniqueViolation = false;
  txEvents = [];

  // 1, 8, 9, 10, 12, 13, 14, 17: Alta correcta con nombre derivado y status ACTIVE por defecto
  const pass = 'ClaveSeguraTI#2026';
  const resOk = await invokeCreate({
    persona_id: 101,
    email: '  Maria.Perez@Ejemplo.GOB.MX  ',
    password: pass,
  });
  assert.equal(resOk.status, 201);
  assert.deepEqual(resOk.body, {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'maria.perez@ejemplo.gob.mx',
    name: 'María Pérez',
    status: 'ACTIVE',
    persona_id: 101,
  });
  assert.equal('password' in resOk.body, false);
  assert.equal('password_hash' in resOk.body, false);
  assert.ok(lastInsertedAppUser);
  assert.equal(await argon2.verify(lastInsertedAppUser.password_hash, pass), true);
  assert.equal(txEvents.some((e) => e.sql.includes('INSERT INTO public.persona')), false);
  assert.equal(txEvents.some((e) => e.sql.includes('app_user_roles')), false);
  assert.ok(txEvents.some((e) => e.sql === 'COMMIT'));

  // 2. Persona inexistente (404)
  assert.equal((await invokeCreate({ persona_id: 999, email: 'a@b.mx', password: pass })).status, 404);
  // 3. Persona inactiva (404)
  assert.equal((await invokeCreate({ persona_id: 102, email: 'a@b.mx', password: pass })).status, 404);
  // 4. Persona con cuenta SSO existente (409)
  assert.equal((await invokeCreate({ persona_id: 101, email: 'otro@b.mx', password: pass })).status, 409);
  // 5. Correo duplicado (409)
  mockTxPersonas.set(103, { id: 103, nombre_completo: 'Otra Persona', activo: true });
  assert.equal((await invokeCreate({ persona_id: 103, email: 'MARIA.PEREZ@ejemplo.gob.mx', password: pass })).status, 409);
  // 6. Correo inválido (400)
  assert.equal((await invokeCreate({ persona_id: 103, email: 'correo-invalido', password: pass })).status, 400);
  // 7. Contraseña inválida (400)
  assert.equal((await invokeCreate({ persona_id: 103, email: 'ok@b.mx', password: '123' })).status, 400);
  // 11. Rechazo de propiedades adicionales (400)
  assert.equal((await invokeCreate({ persona_id: 103, email: 'ok@b.mx', password: pass, roles: [] })).status, 400);

  // 16. Conflicto de unicidad concurrente (23505 -> 409) y ROLLBACK
  simulateInsertUniqueViolation = true;
  txEvents = [];
  const resConcurrent = await invokeCreate({ persona_id: 103, email: 'ok@b.mx', password: pass });
  assert.equal(resConcurrent.status, 409);
  assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
  simulateInsertUniqueViolation = false;
});
