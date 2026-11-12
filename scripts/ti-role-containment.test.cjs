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
const { requireRole, scopeUnidadQuery, requireTiAdminGlobal } = require('../dist/auth/requireRole');

// Servicios TI cuyos métodos serán reemplazados por mocks en memoria (sin conexión a PostgreSQL)
const PersonasService = require('../dist/services/personas.service').default;
const DispositivosService = require('../dist/services/dispositivos.service').default;
const AsignacionesService = require('../dist/services/asignaciones.service').default;
const UnidadMedicaService = require('../dist/services/unidadMedica.service').default;
const TipoDispositivoService = require('../dist/services/tipoDispositivo.service').default;
const TipoPerifericoService = require('../dist/services/tipoPeriferico.service').default;
const EstadoDispositivoService = require('../dist/services/estadoDispositivo.service').default;

// Rutas reales compiladas de TI
const personasRoutes = require('../dist/routes/personas').default;
const dispositivosRoutes = require('../dist/routes/dispositivos').default;
const asignacionesRoutes = require('../dist/routes/asignaciones').default;
const unidadMedicaTIRoutes = require('../dist/routes/unidadMedica-ti').default;
const tipoDispositivoRoutes = require('../dist/routes/tipoDispositivo').default;
const tipoPerifericoRoutes = require('../dist/routes/tipoPeriferico').default;
const estadoDispositivoRoutes = require('../dist/routes/estadoDispositivo').default;

// Rutas públicas operativas de Abasto y Solicitudes para verificar que no recibieron middlewares
const articulosRoutes = require('../dist/routes/articulos').default;
const solicitudesRoutes = require('../dist/routes/solicitudes').default;
const radarAbastoRoutes = require('../dist/routes/radar-abasto').default;
const universosAbastoRoutes = require('../dist/routes/universos-abasto').default;

// Configuración efímera RSA-2048 en directorio temporal aislado (no lee keys/ del repositorio)
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-ti-admin-global-test-'));
const privPath = path.join(tmpRoot, 'priv.jwk.json');
const pubPath = path.join(tmpRoot, 'pub.jwk.json');
const kidPath = path.join(tmpRoot, 'ACTIVE_KID');
const TEST_KID = 'test_kid_6_3b_1';
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

// Mocks deterministas de servicios TI (cero conexiones a PostgreSQL)
const MOCK_RESPONSES = {
  personasList: {
    items: [{ id: 11, nombre_completo: 'Juan Pérez', unidad_medica_id: 10, unidad_medica: 'HG Tijuana', email_principal: 'juan@imssb.bc', n_correos: 1 }],
    page: 1,
    pageSize: 20,
    total: 1,
  },
  personaById: {
    id: 11,
    nombre_completo: 'Juan Pérez',
    unidad_medica_id: 10,
    unidad_medica: 'HG Tijuana',
    correos: [{ id: 1, correo: 'juan@imssb.bc', es_principal: true }],
  },
  unidadesTiSearch: {
    items: [{ id: 10, cluessa: 'BCSSA000010', cluesimb: 'BCIMB000010', nombre: 'HG Tijuana' }],
    page: 1,
    pageSize: 20,
    total: 1,
  },
  dispositivosList: {
    items: [{ id: 101, serial: 'SN-101', marca: 'Dell', modelo: 'OptiPlex', unidad_medica_id: 10 }],
    page: 1,
    pageSize: 20,
    total: 1,
  },
  dispositivoById: {
    id: 101,
    serial: 'SN-101',
    unidad_medica_id: 10,
    nics: [],
    monitores: [],
    perifericos: [],
    asignacion_actual: null,
  },
  asignacionesHistorial: {
    items: [{ id: 501, dispositivo_id: 101, estado_dispositivo: 'En resguardo' }],
    total: 1,
    page: 1,
    pageSize: 10,
  },
  tiposDispositivo: [{ id: 1, nombre: 'Desktop' }],
  tiposPeriferico: [{ id: 2, nombre: 'Teclado' }],
  estadosDispositivo: [{ id: 3, nombre: 'En resguardo' }],
};

PersonasService.prototype.listPaged = async () => MOCK_RESPONSES.personasList;
PersonasService.prototype.byId = async (id) => (id === 11 ? MOCK_RESPONSES.personaById : null);
PersonasService.prototype.create = async () => ({ id: 12 });
PersonasService.prototype.update = async (id) => ({ id });
PersonasService.prototype.softDelete = async () => ({ ok: true });

UnidadMedicaService.prototype.searchForTI = async () => MOCK_RESPONSES.unidadesTiSearch;

DispositivosService.prototype.listPaged = async () => MOCK_RESPONSES.dispositivosList;
DispositivosService.prototype.byId = async (id) => (id === 101 ? MOCK_RESPONSES.dispositivoById : null);
DispositivosService.prototype.create = async () => ({ id: 202 });
DispositivosService.prototype.updateBasic = async ({ id }) => ({ ok: true, id });
DispositivosService.prototype.changeAssignment = async () => ({ id: 601 });
DispositivosService.prototype.addMonitor = async () => ({ id: 701 });
DispositivosService.prototype.updateMonitor = async ({ id }) => ({ id });
DispositivosService.prototype.deleteMonitor = async () => ({ ok: true });
DispositivosService.prototype.addPeriferico = async () => ({ id: 801 });
DispositivosService.prototype.updatePeriferico = async ({ id }) => ({ id });
DispositivosService.prototype.deletePeriferico = async () => ({ ok: true });

AsignacionesService.prototype.historialPorDispositivoPaged = async () => MOCK_RESPONSES.asignacionesHistorial;
AsignacionesService.prototype.crear = async () => ({ id: 901 });
AsignacionesService.prototype.revertir = async () => ({ ok: true, asignacion_id: 902 });

TipoDispositivoService.prototype.getAll = async () => MOCK_RESPONSES.tiposDispositivo;
TipoPerifericoService.prototype.getAll = async () => MOCK_RESPONSES.tiposPeriferico;
EstadoDispositivoService.prototype.getAll = async () => MOCK_RESPONSES.estadosDispositivo;

// Construcción de app Express 5 real con los mismos montajes que src/app.ts
const app = express();
app.use(express.json());
app.use('/api/ti/unidades', unidadMedicaTIRoutes);
app.use('/api/ti/personas', personasRoutes);
app.use('/api/catalogos/tipos-dispositivo', tipoDispositivoRoutes);
app.use('/api/catalogos/tipos-periferico', tipoPerifericoRoutes);
app.use('/api/catalogos/estados-dispositivo', estadoDispositivoRoutes);
app.use('/api/dispositivos', dispositivosRoutes);
app.use('/api', asignacionesRoutes);

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
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

async function issueTokenForRoles(roles, sub = '11111111-2222-3333-4444-555555555555') {
  configureTestJwtEnv();
  return await signAccessToken({
    sub,
    email: 'admin.ti@imssb.bc',
    name: 'Admin TI',
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

const ALL_TI_GET_ENDPOINTS = [
  { path: '/api/ti/personas', expectedBody: MOCK_RESPONSES.personasList },
  { path: '/api/ti/personas/11', expectedBody: MOCK_RESPONSES.personaById },
  { path: '/api/ti/unidades', expectedBody: MOCK_RESPONSES.unidadesTiSearch },
  { path: '/api/dispositivos', expectedBody: MOCK_RESPONSES.dispositivosList },
  { path: '/api/dispositivos/101', expectedBody: MOCK_RESPONSES.dispositivoById },
  { path: '/api/dispositivos/101/asignaciones', expectedBody: MOCK_RESPONSES.asignacionesHistorial },
  { path: '/api/catalogos/tipos-dispositivo', expectedBody: MOCK_RESPONSES.tiposDispositivo },
  { path: '/api/catalogos/tipos-periferico', expectedBody: MOCK_RESPONSES.tiposPeriferico },
  { path: '/api/catalogos/estados-dispositivo', expectedBody: MOCK_RESPONSES.estadosDispositivo },
];

const ALL_TI_WRITE_ENDPOINTS = [
  {
    method: 'POST',
    path: '/api/ti/personas',
    body: { nombre_completo: 'María López', unidad_medica_id: 10, correos: ['maria@imssb.bc'] },
    expectedSuccessStatus: 201,
    expectedBody: { id: 12 },
  },
  {
    method: 'PUT',
    path: '/api/ti/personas/11',
    body: { nombre_completo: 'Juan Pérez Actualizado', unidad_medica_id: 10 },
    expectedSuccessStatus: 200,
    expectedBody: { id: 11 },
  },
  {
    method: 'DELETE',
    path: '/api/ti/personas/11',
    body: undefined,
    expectedSuccessStatus: 200,
    expectedBody: { ok: true },
  },
  {
    method: 'POST',
    path: '/api/dispositivos',
    body: { unidad_medica_id: 10, tipo_dispositivo_id: 1, serial: 'SN-NEW' },
    expectedSuccessStatus: 201,
    expectedBody: { id: 202 },
  },
  {
    method: 'PUT',
    path: '/api/dispositivos/101',
    body: { serial: 'SN-UPD', nics: [] },
    expectedSuccessStatus: 200,
    expectedBody: { ok: true, id: 101 },
  },
  {
    method: 'POST',
    path: '/api/dispositivos/101/asignacion',
    body: { unidad_medica_id: 10, lugar_especifico: 'Consultorio 1', estado_dispositivo_id: 1 },
    expectedSuccessStatus: 200,
    expectedBody: { ok: true, asignacion_id: 601 },
  },
  {
    method: 'POST',
    path: '/api/dispositivos/101/monitores',
    body: { serial: 'MON-1', marca: 'Dell', modelo: 'P24', es_principal: true },
    expectedSuccessStatus: 200,
    expectedBody: { ok: true, id: 701 },
  },
  {
    method: 'PUT',
    path: '/api/dispositivos/101/monitores/1',
    body: { serial: 'MON-1-UPD' },
    expectedSuccessStatus: 200,
    expectedBody: { ok: true, id: 1 },
  },
  {
    method: 'DELETE',
    path: '/api/dispositivos/101/monitores/1',
    body: undefined,
    expectedSuccessStatus: 200,
    expectedBody: { ok: true },
  },
  {
    method: 'POST',
    path: '/api/dispositivos/101/perifericos',
    body: { tipo_id: 2, serial: 'PER-1' },
    expectedSuccessStatus: 200,
    expectedBody: { ok: true, id: 801 },
  },
  {
    method: 'PUT',
    path: '/api/dispositivos/101/perifericos/1',
    body: { serial: 'PER-1-UPD' },
    expectedSuccessStatus: 200,
    expectedBody: { ok: true, id: 1 },
  },
  {
    method: 'DELETE',
    path: '/api/dispositivos/101/perifericos/1',
    body: undefined,
    expectedSuccessStatus: 200,
    expectedBody: { ok: true },
  },
  {
    method: 'POST',
    path: '/api/dispositivos/101/asignaciones',
    body: { lugar_especifico: 'Dirección', estado_dispositivo_id: 1 },
    expectedSuccessStatus: 201,
    expectedBody: { id: 901 },
  },
  {
    method: 'POST',
    path: '/api/dispositivos/101/asignaciones/501/revert',
    body: {},
    expectedSuccessStatus: 201,
    expectedBody: { ok: true, asignacion_id: 902 },
  },
];

const ALL_TI_ENDPOINTS = [
  ...ALL_TI_GET_ENDPOINTS.map((ep) => ({
    method: 'GET',
    path: ep.path,
    body: undefined,
    expectedSuccessStatus: 200,
    expectedBody: ep.expectedBody,
  })),
  ...ALL_TI_WRITE_ENDPOINTS,
];

test('1 y 2. Usuario sin token y usuario con token inválido reciben 401 en todas las rutas TI (GET, POST, PUT, DELETE)', async () => {
  for (const ep of ALL_TI_ENDPOINTS) {
    const noTokenRes = await requestJson(ep.method, ep.path, { body: ep.body });
    assert.equal(noTokenRes.status, 401, `Fallo sin token en ${ep.method} ${ep.path}`);
    assert.deepEqual(noTokenRes.body, { error: 'Missing Bearer token' });

    const invalidTokenRes = await requestJson(ep.method, ep.path, {
      token: 'invalid.jwt.token',
      body: ep.body,
    });
    assert.equal(invalidTokenRes.status, 401, `Fallo con token inválido en ${ep.method} ${ep.path}`);
  }
});

test('3, 11, 12 y 14. Usuario ADMIN_TIC GLOBAL con id: null está autorizado en todas las rutas TI GET, POST, PUT y DELETE y conserva contratos HTTP', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);

  for (const ep of ALL_TI_ENDPOINTS) {
    const res = await requestJson(ep.method, ep.path, { token, body: ep.body });
    assert.equal(
      res.status,
      ep.expectedSuccessStatus,
      `ADMIN_TIC GLOBAL debe recibir ${ep.expectedSuccessStatus} en ${ep.method} ${ep.path}`
    );
    assert.deepEqual(
      res.body,
      ep.expectedBody,
      `El contrato de respuesta cambió en ${ep.method} ${ep.path}`
    );
  }
});

test('4. Usuario ADMIN_TIC con scope = CLUES recibe 403 en todas las rutas TI', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'CLUES', id: 'BCIMB000010' }]);

  for (const ep of ALL_TI_ENDPOINTS) {
    const res = await requestJson(ep.method, ep.path, { token, body: ep.body });
    assert.equal(res.status, 403, `ADMIN_TIC CLUES debe ser denegado en ${ep.method} ${ep.path}`);
    assert.deepEqual(res.body, { error: 'Permiso insuficiente' });
  }
});

test('5. Usuario ADMIN_TIC con scope = DEPTO recibe 403 en todas las rutas TI', async () => {
  const token = await issueTokenForRoles([{ code: 'ADMIN_TIC', scope: 'DEPTO', id: 'SISTEMAS' }]);

  for (const ep of ALL_TI_ENDPOINTS) {
    const res = await requestJson(ep.method, ep.path, { token, body: ep.body });
    assert.equal(res.status, 403, `ADMIN_TIC DEPTO debe ser denegado en ${ep.method} ${ep.path}`);
    assert.deepEqual(res.body, { error: 'Permiso insuficiente' });
  }
});

test('6. Usuario ADMIN_TIC GLOBAL con identificador inválido (distinto de null, o ausente, o rol como string) recibe 403', async () => {
  const invalidGlobalVariants = [
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: '*' }],
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: '' }],
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: '10' }],
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: 0 }],
    [{ code: 'ADMIN_TIC', scope: 'GLOBAL' }], // id === undefined
    ['ADMIN_TIC'], // string sin scope ni id
  ];

  for (const roles of invalidGlobalVariants) {
    const token = await issueTokenForRoles(roles);
    for (const ep of ALL_TI_ENDPOINTS) {
      const res = await requestJson(ep.method, ep.path, { token, body: ep.body });
      assert.equal(
        res.status,
        403,
        `Variante inválida ${JSON.stringify(roles)} debe recibir 403 en ${ep.method} ${ep.path}`
      );
      assert.deepEqual(res.body, { error: 'Permiso insuficiente' });
    }
  }
});

test('7, 8 y 9. Usuarios con rol exclusivamente RECURSOS_HUMANOS, SOLICITUDES_ABASTO, FINANZAS, OPER_TIC, LECTOR_TIC, CONSULTA_TIC o sin roles reciben 403', async () => {
  const nonAdminRoleSets = [
    [{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }],
    [{ code: 'ADMIN_RH', scope: 'GLOBAL', id: null }],
    [{ code: 'SOLICITUDES_ABASTO', scope: 'GLOBAL', id: null }],
    [{ code: 'ABASTO', scope: 'GLOBAL', id: null }],
    [{ code: 'FINANZAS', scope: 'GLOBAL', id: null }],
    [{ code: 'OPER_TIC', scope: 'GLOBAL', id: null }],
    [{ code: 'OPER_TIC', scope: 'CLUES', id: '10' }],
    [{ code: 'LECTOR_TIC', scope: 'GLOBAL', id: null }],
    [{ code: 'CONSULTA_TIC', scope: 'GLOBAL', id: null }],
    [],
  ];

  for (const roles of nonAdminRoleSets) {
    const token = await issueTokenForRoles(roles);
    for (const ep of ALL_TI_ENDPOINTS) {
      const res = await requestJson(ep.method, ep.path, { token, body: ep.body });
      assert.equal(
        res.status,
        403,
        `Perfil ${JSON.stringify(roles)} debe recibir 403 en ${ep.method} ${ep.path}`
      );
      assert.deepEqual(res.body, { error: 'Permiso insuficiente' });
    }
  }
});

test('10. Usuario con ADMIN_TIC GLOBAL (id: null) combinado con otros roles (RECURSOS_HUMANOS, SOLICITUDES_ABASTO, o asignaciones parciales) está autorizado', async () => {
  const multiRoleToken = await issueTokenForRoles([
    { code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null },
    { code: 'SOLICITUDES_ABASTO', scope: 'CLUES', id: 'BCIMB000010' },
    { code: 'ADMIN_TIC', scope: 'CLUES', id: 'BCIMB000010' },
    { code: 'ADMIN_TIC', scope: 'GLOBAL', id: null },
  ]);

  for (const ep of ALL_TI_ENDPOINTS) {
    const res = await requestJson(ep.method, ep.path, { token: multiRoleToken, body: ep.body });
    assert.equal(
      res.status,
      ep.expectedSuccessStatus,
      `Usuario multi-rol con ADMIN_TIC GLOBAL válido debe recibir ${ep.expectedSuccessStatus} en ${ep.method} ${ep.path}`
    );
  }
});

test('13. No se modifican las rutas públicas de Abasto y Solicitudes, se conserva la exportación de requireRole/scopeUnidadQuery, y GET /api/dispositivos ya no usa scopeUnidadQuery()', () => {
  // Confirmar que requireRole y scopeUnidadQuery siguen exportados por compatibilidad
  assert.equal(typeof requireRole, 'function');
  assert.equal(typeof scopeUnidadQuery, 'function');
  assert.equal(typeof requireTiAdminGlobal, 'function');

  // Confirmar que GET /api/dispositivos usa únicamente requireAuth + requireTiAdminGlobal + handler (3 capas, sin scopeUnidadQuery)
  const getDispositivosLayer = dispositivosRoutes.stack.find(
    (l) => l.route && l.route.path === '/' && l.route.methods.get
  );
  assert.ok(getDispositivosLayer, 'Debe existir GET / en dispositivosRoutes');
  assert.equal(
    getDispositivosLayer.route.stack.length,
    3,
    'GET /api/dispositivos debe tener exactamente 3 handlers (requireAuth, requireTiAdminGlobal y controlador), habiéndose retirado scopeUnidadQuery()'
  );

  // Confirmar que las rutas públicas de Abasto y Solicitudes permanecen intactas sin middlewares de autenticación
  const publicRouters = [
    { name: 'articulos', router: articulosRoutes },
    { name: 'solicitudes', router: solicitudesRoutes },
    { name: 'radar-abasto', router: radarAbastoRoutes },
    { name: 'universos-abasto', router: universosAbastoRoutes },
  ];

  for (const { name, router } of publicRouters) {
    assert.ok(Array.isArray(router.stack), `El router ${name} debe tener stack`);
    for (const layer of router.stack) {
      if (layer.route && Array.isArray(layer.route.stack)) {
        assert.equal(
          layer.route.stack.length,
          1,
          `La ruta ${layer.route.path} en ${name} no debe tener middlewares de autenticación adicionales`
        );
        const handlerName = layer.route.stack[0].name || '';
        assert.notEqual(handlerName, 'requireAuth', `Ruta en ${name} no debe tener requireAuth`);
      }
    }
  }
});
