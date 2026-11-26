const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pool } = require('../dist/db/pool');
const Controller = require('../dist/controllers/rh-asistencia.controller').default;
const Service = require('../dist/services/rh-asistencia.service').default;
const router = require('../dist/routes/rh').default;

const sub = '12345678-1234-4234-9234-123456789abc';
const estados = {
  3: 'RECIBIDA', 4: 'RECIBIDA', 5: 'NO_APLICA', 6: 'PENDIENTE',
  7: 'OBSERVADA', 8: 'ENTREGADA_DECLARADA', 11: 'RECIBIDA',
};
function filas(overrides = {}) {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    return {
      cuenta_activa: true, persona_activa: true, mes,
      fecha_ingreso: '2026-02-15', fecha_baja: null,
      tiene_adscripcion: mes >= 2 && mes !== 9, vinculo_posterior_baja: false,
      estado_control: estados[mes] ?? null,
      origen_registro: mes === 4 ? 'MIGRACION_HISTORICA_EXCEL' : estados[mes] ? 'CAPTURA_SISTEMA' : null,
      fecha_recepcion: mes === 3 ? '2026-03-22T12:00:00Z' : null,
      ...overrides,
    };
  });
}

async function request(query, user = { sub }) {
  const res = {
    set(key, value) { this[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
  await new Controller().miHistorial({ query, user }, res);
  assert.equal(res['Cache-Control'], 'no-store');
  return res;
}

test('consulta propia con una sentencia de lectura y protege el contrato', async (t) => {
  let rows = filas();
  const query = t.mock.method(pool, 'query', async () => ({ rows }));
  const connect = t.mock.method(pool, 'connect', () => assert.fail('Conexión directa inesperada'));
  const route = router.stack.find(({ route }) => route?.path === '/mi-asistencia/historial').route;
  assert.ok(route.methods.get);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].name, 'requireAuth');
  for (const rejected of [{ persona_id: '5' }, { unidadId: '1' }, { personaId: '5' }]) {
    assert.equal((await request({ anio: '2026', ...rejected })).code, 400);
  }
  assert.equal((await request({ anio: ['2026', '2025'] })).code, 400);
  assert.equal((await request({ anio: '2101' })).code, 400);
  assert.equal((await request({ anio: '2026' }, {})).code, 401);
  assert.equal(query.mock.callCount(), 0);
  const { code, body } = await request({ anio: '2026' });
  assert.equal(code, 200);
  assert.deepEqual(body.meses.map(({ mes }) => mes), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(Object.keys(body.meses[0]).sort(), [
    'elegibilidad', 'es_mes_cerrado', 'estado_control', 'fecha_recepcion', 'mes', 'origen_registro', 'requiere_atencion',
  ]);
  assert.equal(query.mock.callCount(), 1);
  const [sql, params] = query.mock.calls[0].arguments;
  assert.deepEqual(params, [sub, 2026]);
  assert.match(sql, /^\s*SELECT/);
  assert.match(sql, /p\.id = u\.persona_id AND p\.activo IS TRUE/);
  assert.match(sql, /c\.persona_id = p\.id AND c\.anio = \$2/);
  assert.match(sql, /WHERE u\.id = \$1::uuid/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|MERGE|recibido_por|referencia_migracion|rfc|curp)\b/i);
  for (const identity of [
    { cuenta_activa: true, persona_activa: null },
    { cuenta_activa: true, persona_activa: false },
    { cuenta_activa: false, persona_activa: true },
  ]) {
    rows = [identity];
    assert.equal((await request({ anio: '2026' })).code, 403);
  }
  rows = [];
  assert.equal((await request({ anio: '2026' })).code, 401);
  assert.equal(connect.mock.callCount(), 0);
});

test('corte de Tijuana y resumen de estados sin perder recepciones del mes en curso', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: filas() }));
  const service = new Service();
  const hoy = new Date('2026-11-26T12:00:00Z');
  const result = await service.getMiHistorial(sub, 2026, hoy);
  assert.equal(result.ultimo_mes_cerrado, 10);
  assert.deepEqual(result.resumen, {
    sin_recepcion_registrada: [2, 6, 10], requieren_atencion: [7, 8, 9],
    no_corresponden: [1, 5], recibidas: [3, 4],
  });
  assert.equal(result.meses[2].fecha_recepcion, '2026-03-22T12:00:00.000Z');
  assert.equal(result.meses[3].origen_registro, 'MIGRACION_HISTORICA_EXCEL');
  assert.equal(result.meses[3].fecha_recepcion, null);
  assert.equal(result.meses[10].es_mes_cerrado, false);
  assert.equal(result.meses[10].estado_control, 'RECIBIDA');
  assert.equal((await service.getMiHistorial(sub, 2026, new Date('2026-02-01T07:59:59Z'))).ultimo_mes_cerrado, 0);
  assert.equal((await service.getMiHistorial(sub, 2026, new Date('2026-02-01T08:00:00Z'))).ultimo_mes_cerrado, 1);
  assert.equal((await service.getMiHistorial(sub, 2025, hoy)).ultimo_mes_cerrado, 12);
  const futuro = await service.getMiHistorial(sub, 2027, hoy);
  assert.equal(futuro.ultimo_mes_cerrado, 0);
  assert.ok(Object.values(futuro.resumen).every((meses) => meses.length === 0));
});

test('distingue baja parcial, baja previa y evidencia contradictoria o insuficiente', async (t) => {
  let rows = filas({
    fecha_ingreso: '2025-01-01', fecha_baja: '2026-05-15',
    estado_control: null, tiene_adscripcion: true,
  });
  rows[5].tiene_adscripcion = false;
  rows[6].vinculo_posterior_baja = true;
  rows[7].fecha_ingreso = '2026-08-01';
  t.mock.method(pool, 'query', async () => ({ rows }));
  const service = new Service();
  const hoy = new Date('2027-01-01T12:00:00Z');
  const { meses } = await service.getMiHistorial(sub, 2026, hoy);
  assert.deepEqual(meses.slice(4, 8).map(({ elegibilidad }) => elegibilidad), [
    'EVALUABLE', 'NO_CORRESPONDE', 'INCIERTA', 'INCIERTA',
  ]);
  rows = filas({ fecha_ingreso: null, estado_control: null });
  assert.equal((await service.getMiHistorial(sub, 2026, hoy)).meses[1].elegibilidad, 'INCIERTA');
  rows[0].fecha_ingreso = '2026-02-01';
  rows[0].tiene_adscripcion = true;
  assert.equal((await service.getMiHistorial(sub, 2026, hoy)).meses[0].elegibilidad, 'INCIERTA');
  rows[0].estado_control = 'RECIBIDA';
  const contradictoria = await service.getMiHistorial(sub, 2026, hoy);
  assert.ok(contradictoria.resumen.recibidas.includes(1));
  assert.ok(contradictoria.resumen.requieren_atencion.includes(1));
  assert.ok(!contradictoria.resumen.sin_recepcion_registrada.includes(1));
});
