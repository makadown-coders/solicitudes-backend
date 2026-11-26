const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pool } = require('../dist/db/pool');
const Controller = require('../dist/controllers/rh.controller').default;
const router = require('../dist/routes/rh').default;

const sub = '12345678-1234-4234-9234-123456789abc';
const julio = { anio: '2026', mes: '7' };
async function request(query, user = { sub }) {
  const res = {
    set(name, value) { this[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
  await new Controller().miVacacionesFechas({ query, user }, res);
  assert.equal(res['Cache-Control'], 'no-store');
  return res;
}

test('ruta personal con parámetros exclusivos y validación previa a consultar', async (t) => {
  const query = t.mock.method(pool, 'query', () => assert.fail('Consulta inesperada'));
  const route = router.stack.find(({ route }) => route?.path === '/mi-vacaciones/fechas').route;
  assert.ok(route.methods.get);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].name, 'requireAuth');
  assert.equal((await request(julio, {})).code, 401);
  assert.equal((await request(julio, { sub: 'inválido' })).code, 401);
  for (const invalida of [
    {}, { anio: '2026' }, { mes: '7' }, { ...julio, anio: '2019' }, { ...julio, anio: '2101' },
    { ...julio, anio: ['2026', '2024'] }, { ...julio, mes: ['7', '8'] },
    { ...julio, mes: '0' }, { ...julio, mes: '13' }, { ...julio, mes: '7.5' },
    ...['persona_id', 'personaId', 'unidadId', 'periodoId', 'otro'].map((key) => ({ ...julio, [key]: '42' })),
  ]) {
    assert.equal((await request(invalida)).code, 400);
  }
  assert.equal(query.mock.callCount(), 0);
});

test('aplica la política de cuenta y persona activas', async (t) => {
  const query = t.mock.method(pool, 'query');
  for (const row of [
    { cuenta_activa: false, persona_activa: true },
    { cuenta_activa: true, persona_activa: false },
    { cuenta_activa: true, persona_activa: null },
  ]) {
    query.mock.mockImplementation(async () => ({ rows: [row] }));
    const result = await request(julio);
    assert.equal(result.code, 403);
    assert.deepEqual(Object.keys(result.body), ['error']);
  }
  query.mock.mockImplementation(async () => ({ rows: [] }));
  assert.equal((await request(julio)).code, 401);
});

test('consulta un mes por fecha efectiva, cruza bolsas y devuelve solo fechas calendario', async (t) => {
  const registros = [
    ['2026-07-09', 2026],
    ['2026-07-07', 2024],
    ['2026-07-08', 2025],
    ['2026-07-08', 2024],
    ['2026-07-10', 2026, { estado: 'ANULADO' }],
    ['2026-07-11', 2026, { activo: false }],
    ['2026-07-12', 2026, { computable: false }],
    [null, 2024, { modo: 'RANGO_HISTORICO' }],
    ['2026-07-15', 2026, { propia: false }],
    ['2026-12-31', 2024],
    ['2027-01-01', 2024],
  ];
  const client = t.mock.method(pool, 'connect', () => assert.fail('Conexión directa inesperada'));
  const query = t.mock.method(pool, 'query', async (_sql, [, anio, mes]) => {
    const prefijo = `${anio}-${String(mes).padStart(2, '0')}-`;
    // Simula la proyección que entregaría PostgreSQL. Los predicados SQL se verifican por separado.
    const fechas = registros.filter(([fecha, , opciones = {}]) =>
      fecha?.startsWith(prefijo) && opciones.propia !== false && opciones.activo !== false &&
      opciones.computable !== false && opciones.estado !== 'ANULADO'
    ).map(([fecha]) => fecha);
    return { rows: [{ cuenta_activa: true, persona_activa: true, fechas: [...new Set(fechas)].sort() }] };
  });
  for (const [anio, mes, fechas] of [
    [2026, 7, ['2026-07-07', '2026-07-08', '2026-07-09']],
    [2026, 8, []],
    [2026, 12, ['2026-12-31']],
    [2027, 1, ['2027-01-01']],
  ]) {
    const { code, body } = await request({ anio: String(anio), mes: String(mes) });
    assert.equal(code, 200);
    assert.deepEqual(body, { anio, mes, fechas });
    assert.deepEqual(query.mock.calls.at(-1).arguments[1], [sub, anio, mes]);
  }
  assert.equal(query.mock.callCount(), 4);
  assert.equal(client.mock.callCount(), 0);
  const [sql] = query.mock.calls[0].arguments;
  assert.match(sql, /^\s*SELECT/);
  assert.match(sql, /p\.id = u\.persona_id[\s\S]+WHERE u\.id = \$1::uuid/);
  assert.match(sql, /r\.id = f\.registro_id AND r\.persona_id = f\.persona_id/);
  assert.match(sql, /f\.persona_id = p\.id\s+AND identidad\.cuenta_activa\s+AND p\.activo IS TRUE/);
  assert.match(sql, /r\.estado = 'REGISTRADO'/);
  assert.match(sql, /f\.activo IS TRUE AND f\.computable IS TRUE/);
  assert.match(sql, /f\.fecha >= limite\.inicio[\s\S]+f\.fecha < \(limite\.inicio \+ interval '1 month'\)::date/);
  assert.match(sql, /make_date\(\$2::int, \$3::int, 1\)/);
  assert.match(sql, /SELECT DISTINCT f\.fecha/);
  assert.match(sql, /ORDER BY dia\.fecha/);
  assert.match(sql, /to_char\(dia\.fecha, 'YYYY-MM-DD'\)/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|MERGE|periodo_id|anio_ciclo|fecha_inicio|fecha_fin|timestamptz)\b/i);
});
