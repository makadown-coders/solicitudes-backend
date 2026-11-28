const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pool } = require('../dist/db/pool');
const Controller = require('../dist/controllers/rh.controller').default;
const router = require('../dist/routes/rh').default;

const sub = '12345678-1234-4234-9234-123456789abc';
const rhAccess = { scope: 'GLOBAL', grantedBy: 'RECURSOS_HUMANOS' };
const ruta = '/organigrama/puestos/:puestoId/ocupacion';
const sinVincular = { estado: 'SIN_VINCULAR', persona_id: null, actualizado_en: null };

async function request(method, overrides = {}) {
  const req = { rhAccess, user: { sub }, params: { puestoId: '12' }, query: {}, get() {}, ...overrides };
  const res = {
    set(name, value) { assert.equal(name, 'Cache-Control'); assert.equal(value, 'no-store'); },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; },
  };
  await new Controller()[method](req, res);
  return res;
}

const get = (options) => request('getOrganigramaOcupacion', options);
const patch = (body, options) => request('patchOrganigramaOcupacion', { ...options, body });
const cambio = (estado = 'OCUPADO', persona_id = 20, revision_esperada = null) =>
  ({ estado, persona_id, revision_esperada, motivo: ' Validación RH ' });

function mockDb(t, options = {}) {
  let fila = sinVincular;
  let revision = 0;
  let turno = Promise.resolve();
  const eventos = [];
  const auditorias = [];
  const lectura = (actual) => options.ausente ? [] : [{
    puesto_id: 12, denominacion: 'Oficina', puesto_padre_id: 4, unidad_medica_id: 177,
    ...actual, nombre_ocupante: actual.persona_id ? 'Persona sintética' : null,
    puesto_laboral_referencia: actual.persona_id ? 'Analista' : null,
  }];
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /^SELECT/);
    assert.match(sql, /LEFT JOIN public.rh_org_ocupacion/);
    assert.deepEqual(params, [12, 177]);
    return { rows: lectura(fila) };
  });
  t.mock.method(pool, 'connect', async () => {
    let liberar, borrador, auditoria;
    return {
      async query(sql, params) {
        if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') eventos.push('begin');
        else if (sql.includes('FOR UPDATE OF p FOR SHARE OF v')) {
          assert.deepEqual(params, [12, 177]);
          assert.match(sql, /v.estado = 'VIGENTE'/);
          const anterior = turno;
          turno = new Promise((resolve) => { liberar = resolve; });
          await anterior;
          eventos.push('bloqueo');
          return { rows: options.ausente ? [] : [{ activo: !options.inactivo }] };
        } else if (sql.includes('AS puesto_laboral_referencia')) {
          assert.ok(liberar);
          return { rows: lectura(borrador ?? fila) };
        } else if (sql.includes('FOR NO KEY UPDATE')) {
          return { rows: options.sinPersona ? [] : [{ activo: !options.personaInactiva }] };
        } else if (sql.includes('SELECT al.id')) {
          assert.equal(params[1], 177);
          assert.match(sql, /al.activo IS TRUE AND al.vigente_desde <= CURRENT_DATE/);
          assert.match(sql, /al.vigente_hasta >= CURRENT_DATE/);
          return { rows: Array.from({ length: options.adscripciones ?? 1 }, () => ({})) };
        } else if (sql.includes('SELECT o.puesto_id')) {
          return { rows: options.duplicada ? [{ puesto_id: 55 }] : [] };
        } else if (sql.startsWith('INSERT INTO public.rh_org_ocupacion')) {
          eventos.push('ocupación');
          const [, persona_id, estado] = params;
          borrador = { persona_id, estado, actualizado_en: '2026-11-27T00:00:00.' + String(++revision).padStart(6, '0') + 'Z' };
        } else if (sql.startsWith('INSERT INTO public.app_audit_logs')) {
          eventos.push('auditoría');
          assert.equal(params[0], sub);
          assert.equal(params[1], 'RH_ORG_UPDATE_OCUPACION');
          if (options.fallaAuditoria) throw new Error('Auditoría indisponible');
          auditoria = JSON.parse(params[5]);
        } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
          eventos.push(sql);
          if (sql === 'COMMIT' && borrador) {
            fila = borrador;
            auditorias.push(auditoria);
          }
          liberar?.();
        } else assert.fail(sql);
        return { rows: [] };
      },
      release() { eventos.push('release'); },
    };
  });
  return { eventos, auditorias };
}

test('GET calculado sin escritura, asignación, sustitución, vacancia y desvinculación con auditoría', async (t) => {
  const { auditorias, eventos } = mockDb(t);
  assert.equal((await get()).body.estado, 'SIN_VINCULAR');
  assert.deepEqual(eventos, []);
  let anterior = sinVincular;
  for (const [estado, id] of [['OCUPADO', 20], ['OCUPADO', 21], ['VACANTE', null], ['SIN_VINCULAR', null]]) {
    const result = await patch(cambio(estado, id, anterior.actualizado_en));
    assert.equal(result.code, 200);
    assert.equal(result.body.estado, estado);
    assert.equal(result.body.persona_id, id);
    assert.deepEqual((await get()).body, result.body);
    assert.deepEqual(auditorias.at(-1), {
      puesto_id: 12, motivo: 'Validación RH', actualizado_en: result.body.actualizado_en,
      anterior: { estado: anterior.estado, persona_id: anterior.persona_id },
      nuevo: { estado, persona_id: id },
    });
    anterior = result.body;
  }
  assert.deepEqual(eventos.slice(-4), ['ocupación', 'auditoría', 'COMMIT', 'release']);
  assert.deepEqual((await patch(cambio('SIN_VINCULAR', null, anterior.actualizado_en))).body, anterior);
  assert.equal(auditorias.length, 4);
});

for (const [nombre, opciones, code, mensaje] of [
  ['persona inexistente', { sinPersona: true }, 404, /persona no existe/],
  ['persona inactiva', { personaInactiva: true }, 409, /persona está inactiva/],
  ['ausencia de adscripción', { adscripciones: 0 }, 409, /no tiene adscripción/],
  ['adscripciones ambiguas', { adscripciones: 2 }, 409, /varias adscripciones/],
  ['ocupante duplicado', { duplicada: true }, 409, /puesto estructural 55/],
  ['puesto inactivo', { inactivo: true }, 409, /puesto estructural está inactivo/],
  ['puesto inexistente o fuera de alcance', { ausente: true }, 404, /fuera del organigrama/],
]) {
  test(nombre, async (t) => {
    const { eventos } = mockDb(t, opciones);
    const response = await patch(cambio());
    assert.equal(response.code, code);
    assert.match(response.body.error, mensaje);
    assert.deepEqual(eventos, ['begin', 'bloqueo', 'ROLLBACK', 'release']);
    if (opciones.ausente) assert.equal((await get()).code, 404);
  });
}

test('dos cambios simultáneos con la misma revisión: solo uno se guarda', async (t) => {
  const { auditorias } = mockDb(t);
  const results = await Promise.all([patch(cambio()), patch(cambio('VACANTE', null))]);
  assert.deepEqual(results.map((r) => r.code).sort(), [200, 409]);
  assert.match(results.find((r) => r.code === 409).body.error, /ocupación cambió/);
  assert.equal(auditorias.length, 1);
});

test('falla de auditoría revierte la ocupación', async (t) => {
  const { eventos, auditorias } = mockDb(t, { fallaAuditoria: true });
  t.mock.method(console, 'error', () => {});
  assert.equal((await patch(cambio())).code, 500);
  assert.deepEqual(eventos.slice(-4), ['ocupación', 'auditoría', 'ROLLBACK', 'release']);
  assert.deepEqual(auditorias, []);
  assert.equal((await get()).body.estado, 'SIN_VINCULAR');
});

test('rutas, autorización y validación previa al acceso a datos', async (t) => {
  t.mock.method(pool, 'connect', () => assert.fail('Conexión inesperada'));
  t.mock.method(pool, 'query', () => assert.fail('Consulta inesperada'));
  for (const method of ['get', 'patch']) {
    const route = router.stack.find(({ route }) => route?.path === ruta && route.methods[method]).route;
    assert.equal(route.stack.length, 3);
    assert.equal(route.stack[0].name, 'requireAuth');
  }
  for (const acceso of [undefined, { ...rhAccess, scope: 'CLUES' }, { ...rhAccess, grantedBy: 'ADMIN_TIC' }]) {
    assert.equal((await get({ rhAccess: acceso })).code, 403);
    assert.equal((await patch(cambio(), { rhAccess: acceso })).code, 403);
  }
  assert.equal((await get({ user: undefined })).code, 401);
  assert.equal((await get({ params: { puestoId: '12.5' } })).code, 400);
  for (const body of [null, {}, { ...cambio(), otro: true }, cambio('OCUPADO', '20'),
    cambio('VACANTE', 20), cambio('SIN_VINCULAR', 20), cambio('OTRO', null),
    cambio('OCUPADO', 20, ''), { ...cambio(), motivo: '  ' }]) {
    assert.equal((await patch(body)).code, 400);
  }
});

test('árbol compatible por defecto y ampliado en dos consultas sin N+1', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /^SELECT/);
    if (sql.includes('SELECT id, clave')) return { rowCount: 1, rows: [{ id: 9, estado: 'VIGENTE' }] };
    return { rows: [{ id: 12, version_id: 9, estado_ocupacion: 'OCUPADO', persona_id: 20, nombre_ocupante: 'Persona sintética' }] };
  });
  const base = await request('listOrganigramaPuestos');
  assert.equal(base.code, 200);
  assert.equal(Object.hasOwn(base.body.items[0], 'estado_ocupacion'), false);
  assert.doesNotMatch(query.mock.calls[1].arguments[0], /rh_org_ocupacion/);
  const ampliado = await request('listOrganigramaPuestos', { query: { incluirOcupacion: 'true' } });
  assert.equal(ampliado.code, 200);
  assert.equal(ampliado.body.items[0].estado_ocupacion, 'OCUPADO');
  assert.equal(ampliado.body.items[0].persona_id, 20);
  assert.equal(ampliado.body.items[0].nombre_ocupante, 'Persona sintética');
  assert.match(query.mock.calls[2].arguments[0], /unidad_medica_id = 177 AND estado = 'VIGENTE'/);
  assert.match(query.mock.calls[3].arguments[0], /LEFT JOIN public.rh_org_ocupacion/);
  assert.equal(query.mock.callCount(), 4);
});
