const assert = require('node:assert/strict');
const { test } = require('node:test');
const Controller = require('../dist/controllers/rh-asistencia.controller').default;
const { pool } = require('../dist/db/pool');

const globalRh = { scope: 'GLOBAL', grantedBy: 'RECURSOS_HUMANOS' };
async function request(query, rhAccess = globalRh) {
  const res = {
    headers: {},
    set(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
  await new Controller().matrizAnual({ rhAccess, query }, res);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  return res;
}

test('matriz anual de lectura: filtros, paginación, celdas y procedencia', async (t) => {
  let calls = 0;
  const expected = [
    [2026, 7, '%Sintética%', 'ACTIVOS', 1, 1],
    [2026, 7, null, 'BAJAS', 100, 2],
    [2026, null, null, 'TODOS', 20, 1],
  ];
  let mockFailure;
  t.mock.method(pool, 'connect', () => assert.fail('Conexión no prevista'));
  t.mock.method(pool, 'query', async (sql, params) => {
    try {
      assert.match(sql, /^\s*WITH universo AS/);
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER)\b/i);
      assert.deepEqual(params, expected[calls++]);
      assert.match(sql, /p\.nombre_completo ILIKE \$3[\s\S]+CASE \$4[\s\S]+LIMIT \$5/);
      assert.match(sql, /p\.activo IS TRUE AND p\.fecha_baja IS NULL/);
      assert.match(sql, /p\.activo IS FALSE OR p\.fecha_baja IS NOT NULL/);
      assert.match(sql, /c\.anio = \$1::int AND c\.unidad_medica_id = \$2/);
      assert.match(sql, /al\.vigente_desde < make_date[\s\S]+al\.vigente_hasta >= make_date/);
      assert.match(sql, /ORDER BY nombre_completo, persona_id/);
      assert.match(sql, /COUNT\(\*\) AS total FROM universo/);
      assert.match(sql, /LEFT JOIN generate_series\(1, 12\)/);
    } catch (error) {
      mockFailure = error;
      return { rows: [] };
    }
    if (calls === 2) return { rows: [{ total: '1', persona_id: null }] };
    const rows = [];
    for (const id of calls === 1 ? [51] : [51, 52]) {
      for (let mes = 1; mes <= 12; mes++) {
        const estado = id === 51
          ? ({ 2: 'RECIBIDA', 3: 'OBSERVADA', 4: 'NO_APLICA', 6: 'RECIBIDA',
               8: 'PENDIENTE', 9: 'ENTREGADA_DECLARADA' })[mes] ?? null : null;
        rows.push({
          total: '2', persona_id: id, nombre_completo: `Persona Sintética ${id}`,
          activo_actual: id === 51, fecha_baja: id === 52 ? '2026-03-01' : null,
          fecha_ingreso: id === 51 ? '2025-01-01' : null, cargo_directorio: 'Puesto sintético',
          directorio_unidad_id: 8, directorio_unidad_nombre: 'Unidad actual',
          mes, adscripcion_ref_id: mes === 12 ? null : 127,
          adscripcion_ref_unidad_id: mes === 12 ? null : mes < 7 ? 7 : 8,
          estado_control: estado, control_id: estado ? 100 + mes : null,
          control_unidad_id: estado ? 7 : null,
          origen_registro: mes === 2 && estado ? 'MIGRACION_HISTORICA_EXCEL' : estado ? 'CAPTURA_SISTEMA' : null,
          fecha_recepcion: mes === 6 && estado ? '2026-06-20T12:00:00.000Z' : null,
          excepcion_administrativa: estado === 'NO_APLICA',
          motivo_excepcion: estado === 'NO_APLICA' ? 'TRANSFERENCIA' : null,
        });
      }
    }
    return { rows };
  });

  const { code, body } = await request({
    anio: '2026', unidadId: '7', q: ' Sintética ', situacion: 'activos', pageSize: '1',
  });
  if (mockFailure) throw mockFailure;
  assert.equal(code, 200);
  assert.equal(body.total, 2);
  assert.equal(body.situacion, 'ACTIVOS');
  assert.equal(body.items.length, 1);
  const [persona] = body.items;
  assert.equal(persona.situacion_actual, 'ACTIVO');
  assert.equal(persona.fecha_ingreso, '2025-01-01');
  const { meses } = persona;
  assert.deepEqual(meses.map(({ mes }) => mes), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(meses[0].situacion_seguimiento, 'SIN_REGISTRO_CONTROL');
  assert.equal(meses[1].estado_control, 'RECIBIDA');
  assert.equal(meses[1].origen_registro, 'MIGRACION_HISTORICA_EXCEL');
  assert.equal(meses[1].fecha_recepcion, null);
  assert.equal(meses[2].estado_control, 'OBSERVADA');
  assert.equal(meses[3].motivo_excepcion, 'TRANSFERENCIA');
  assert.equal(meses[5].estado_control, 'RECIBIDA');
  assert.equal(meses[5].control_id, 106);
  assert.equal(meses[5].fecha_recepcion, '2026-06-20T12:00:00.000Z');
  assert.equal(meses[6].unidad_medica_id, 8);
  assert.equal(meses[7].unidad_medica_id, 7);
  assert.equal(meses[8].estado_control, 'ENTREGADA_DECLARADA');
  assert.equal(meses[11].unidad_medica_id, null);
  assert.equal(meses[11].situacion_seguimiento, 'ELEGIBILIDAD_INCIERTA');

  const bajas = await request({ anio: '2026', unidadId: '7', situacion: 'BAJAS', page: '2', pageSize: '101' });
  assert.equal(bajas.body.total, 1);
  assert.deepEqual(bajas.body.items, []);
  const todos = await request({ anio: '2026' });
  if (mockFailure) throw mockFailure;
  assert.deepEqual(todos.body.items.map((p) => p.persona_id), [51, 52]);
  assert.equal(todos.body.items[1].situacion_actual, 'BAJA');
  assert.equal(todos.body.items[1].fecha_ingreso, null);
  assert.ok(todos.body.items[1].meses.every((celda) => celda.control_id === null));
  assert.equal(calls, 3);
});

test('rechaza perfiles y parámetros inválidos antes de consultar', async (t) => {
  const query = t.mock.method(pool, 'query', () => assert.fail('Consulta no prevista'));
  for (const rhAccess of [
    { scope: 'CLUES', grantedBy: 'RECURSOS_HUMANOS' },
    { scope: 'GLOBAL', grantedBy: 'ADMIN_TIC' },
  ]) {
    assert.equal((await request({ anio: '2026' }, rhAccess)).code, 403);
  }
  for (const params of [
    {}, { anio: '2019' }, { anio: '2026', unidadId: '-1' },
    { anio: '2026', situacion: 'OTRA' }, { anio: '2026', q: ['a', 'b'] },
    { anio: '2026', page: '0' }, { anio: '2026', pageSize: '0' },
  ]) {
    assert.equal((await request(params)).code, 400);
  }
  assert.equal(query.mock.callCount(), 0);
});
