const assert = require('node:assert/strict');
const { detectarSustituciones } = require('../dist/services/surtimiento-calculo');

const filaPedido = (clues, clave, pendiente, extra = {}) => ({
  tieneMovimiento: true, solicitudIds: ['SOL-1'], clues, nombre: `Unidad ${clues}`,
  municipio: 'Municipio', clave, descripcion: `Pedido ${clave}`, solicitado: 100,
  surtido: 100 - pendiente, pendiente, excedente: 0, cobertura: 100 - pendiente,
  relacion: 100 - pendiente, estado: 'Parcial', ...extra,
});
const filaSalida = (clues, clave, surtido) => ({
  tieneMovimiento: true, solicitudIds: [], clues, nombre: `Unidad ${clues}`,
  municipio: 'Municipio', clave, descripcion: `SAS ${clave}`, solicitado: null,
  surtido, pendiente: null, excedente: null, cobertura: null, relacion: null,
  estado: 'Salida sin solicitud identificada',
});
const informe = (filas, sinSolicitud) => ({
  corte: '2026-11-19', almacenes: [], filas, sinSolicitud, incidencias: [], ventanas: [], sustituciones: [],
});
const edge = (claveConsultada, candidato, factor, direccion = 'FORWARD') => ({
  claveConsultada, candidato, factor: String(factor), direccion,
});

// Factores 0.5 y 2: equivalente = cantidad sustituta / factor.
{
  const resultado = detectarSustituciones(
    informe([filaPedido('U1', 'A', 100), filaPedido('U1', 'C', 100)],
      [filaSalida('U1', 'B', 50), filaSalida('U1', 'D', 50)]),
    [edge('A', 'B', 0.5), edge('C', 'D', 2)],
  );
  assert.equal(resultado.find(x => x.claveSolicitada === 'A').cantidadEquivalente, 100);
  assert.equal(resultado.find(x => x.claveSolicitada === 'A').potencialAplicable, 100);
  assert.equal(resultado.find(x => x.claveSolicitada === 'C').cantidadEquivalente, 25);
}

// Una relación solamente inversa no participa y una salida de otra CLUES se ignora.
{
  const base = informe([filaPedido('U1', 'A', 80)], [filaSalida('U2', 'B', 80)]);
  assert.equal(detectarSustituciones(base, [edge('A', 'B', 1)]).length, 0);
  base.sinSolicitud = [filaSalida('U1', 'B', 80)];
  assert.equal(detectarSustituciones(base, [edge('A', 'B', 1, 'REVERSE')]).length, 0);
}

// Una sustituta para dos faltantes queda ambigua; no se reparte ni se suma.
{
  const resultado = detectarSustituciones(
    informe([filaPedido('U1', 'A', 80), filaPedido('U1', 'C', 60)], [filaSalida('U1', 'B', 100)]),
    [edge('A', 'B', 1), edge('C', 'B', 2)],
  );
  assert.equal(resultado.length, 2);
  assert.ok(resultado.every(x => x.ambigua && x.estado === 'Sustituta para varios faltantes'));
}

// Dos sustitutas para el mismo faltante se muestran por separado y se marcan como candidatos múltiples.
{
  const resultado = detectarSustituciones(
    informe([filaPedido('U1', 'A', 80)], [filaSalida('U1', 'B', 20), filaSalida('U1', 'C', 30)]),
    [edge('A', 'B', 1), edge('A', 'C', 1)],
  );
  assert.equal(resultado.length, 2);
  assert.ok(resultado.every(x => x.ambigua && x.estado === 'Múltiples candidatos'));
}

// Saldos cero/negativos, factores inválidos y ausencia de relaciones no generan candidatos.
{
  const base = informe([filaPedido('U1', 'A', 80)], [filaSalida('U1', 'B', 0), filaSalida('U1', 'C', -5)]);
  assert.equal(detectarSustituciones(base, [edge('A', 'B', 1), edge('A', 'C', 1)]).length, 0);
  base.sinSolicitud = [filaSalida('U1', 'B', 50)];
  assert.equal(detectarSustituciones(base, [edge('A', 'B', 0), edge('A', 'B', -1)]).length, 0);
  assert.equal(detectarSustituciones(base, []).length, 0);
}

// La detección no muta la conciliación directa.
{
  const base = informe([filaPedido('U1', 'A', 80)], [filaSalida('U1', 'B', 50)]);
  const antes = structuredClone(base.filas);
  detectarSustituciones(base, [edge('A', 'B', 1)]);
  assert.deepEqual(base.filas, antes);
}

console.log('surtimiento-sustituciones: 8 escenarios correctos');
