const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pool } = require('../dist/db/pool');
const Controller = require('../dist/controllers/rh-asistencia.controller').default;

test('protege la recepción histórica después del bloqueo y mantiene la confirmación equivalente', async (t) => {
  const registro = Object.freeze({
    id: 9, persona_id: 7, anio: 2026, mes: 5,
    estado: 'RECIBIDA', origen_registro: 'MIGRACION_HISTORICA_EXCEL',
    unidad_medica_id: 10, adscripcion_laboral_id: null,
    fecha_recepcion: null, recibido_por: null, observaciones: 'Importación sintética',
  });
  const operaciones = [];
  const directa = t.mock.method(pool, 'query', () => assert.fail('Consulta fuera de la transacción'));
  t.mock.method(pool, 'connect', async () => ({
    async query(sql, params) {
      const consulta = sql.trim();
      if (consulta.includes('pg_advisory_xact_lock')) {
        assert.deepEqual(params, [7, 202605]);
        operaciones.push('bloqueo-periodo');
      } else if (consulta.includes('FROM public.persona')) {
        assert.deepEqual(params, [7]);
        operaciones.push('persona');
        return { rows: [{ id: 7, unidad_medica_id: 10 }] };
      } else if (consulta.includes('FOR UPDATE')) {
        assert.deepEqual(params, [7, 2026, 5]);
        operaciones.push('bloqueo-fila');
        return { rows: [registro] };
      } else {
        operaciones.push(consulta);
        assert.match(consulta, /^(BEGIN|COMMIT|ROLLBACK)$/);
      }
      return { rows: [] };
    },
    release() { operaciones.push('release'); },
  }));

  async function ejecutar(metodo, body) {
    operaciones.length = 0;
    const res = {
      set() {},
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; },
    };
    await new Controller()[metodo]({
      rhAccess: { scope: 'GLOBAL', grantedBy: 'RECURSOS_HUMANOS' },
      user: { sub: '11111111-1111-4111-8111-111111111111' },
      params: { personaId: '7', anio: '2026', mes: '5' },
      body,
    }, res);
    return res;
  }

  const intentos = [
    ['actualizarEstado', { estado: 'PENDIENTE' }],
    ['actualizarEstado', { estado: 'OBSERVADA', observaciones: 'Observación sintética' }],
    ['actualizarEstado', { estado: 'NO_APLICA', motivo_excepcion: 'BAJA_PREVIA' }],
    ['confirmarRecepcion', { fecha_recepcion: '2026-05-30T10:00:00Z' }],
    ['confirmarRecepcion', { observaciones: 'Cambio sintético' }],
    ['confirmarRecepcion', { observaciones: null }],
    ['confirmarRecepcion', { unidad_medica_id: null }],
    ['confirmarRecepcion', { adscripcion_laboral_id: 22 }],
  ];
  for (const [metodo, body] of intentos) {
    const res = await ejecutar(metodo, { ...body, motivo_administrativo: 'Motivo sintético' });
    assert.equal(res.code, 409);
    assert.match(res.body.error, /Recepción histórica protegida/);
    assert.deepEqual(operaciones, ['BEGIN', 'bloqueo-periodo', 'persona', 'bloqueo-fila', 'ROLLBACK', 'release']);
  }
  for (const body of [{}, {
    fecha_recepcion: null, observaciones: registro.observaciones,
    unidad_medica_id: 10, adscripcion_laboral_id: null,
  }]) {
    const res = await ejecutar('confirmarRecepcion', body);
    assert.equal(res.code, 200);
    assert.equal(res.body.idempotente, true);
    assert.equal(res.body.evento_auditoria, null);
    assert.equal(res.body.registro.fecha_recepcion, null);
    assert.deepEqual(operaciones, ['BEGIN', 'bloqueo-periodo', 'persona', 'bloqueo-fila', 'COMMIT', 'release']);
  }
  assert.equal(directa.mock.callCount(), 0);
});
