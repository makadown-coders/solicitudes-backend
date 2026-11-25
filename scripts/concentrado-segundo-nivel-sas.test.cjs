const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolverIdentidades, conciliarSalidas, ventanasEfectivas } = require('../dist/services/concentrado-segundo-nivel-sas');

const identidad = (id, clues, cambios = {}) => ({
  id, clues, almacen: false, hospital: false, aliasSas: [], aliasDash: [], ...cambios,
});
const catalogo = [
  identidad(1, 'BCIMB001405', { almacen: true }),
  identidad(2, 'BCIMB001335', { almacen: true }),
  identidad(3, 'BCIMB001340', { almacen: true }),
  identidad(72, 'BCIMB000355', { hospital: true, aliasSas: ['AMB'] }),
  identidad(75, 'BCIMB000734', { hospital: true, aliasSas: ['AMB'] }),
  identidad(71, 'BCIMB000010', { hospital: true }),
  identidad(126, 'BCIMB001726', { hospital: true, aliasSas: ['ONCO', 'onco'] }),
  identidad(70, 'BCIMB000623', { hospital: true }),
  identidad(99, 'EXTERNA', { hospital: true, aliasSas: ['EXTERNA'] }),
  identidad(88, 'OTRA', { aliasSas: ['NO HOSPITAL'] }),
];
const unidades = catalogo.slice(3, 8).map(u => ({ clues: u.clues, municipio: '', jurisdiccion: '', nombre: u.clues }));
const identidades = resolverIdentidades(catalogo, unidades);
const ventanas = ventanasEfectivas([
  { fuente: 'AZM', desde: '2026-11-01', hasta: '2026-11-05' },
  { fuente: 'AZT', desde: '2026-11-06', hasta: '2026-11-10' },
  { fuente: 'AZE', desde: '2026-11-11', hasta: '2026-11-15' },
  { fuente: 'HOSPITAL', desde: '2026-11-16', hasta: '2026-11-30' },
], '', '', '2026-11-25');
let id = 0;
const mov = (origen, destino, dia, cantidad, cambios = {}) => ({
  id: ++id, origen, destino, dia: '2026-11-' + dia, cantidad: String(cantidad),
  clave: ' k ', lote: 'X', folio: 'F', folioExtra: null, origenTexto: null, destinoTexto: null, ...cambios,
});
const necesidad = (indice, cantidad, clave = 'K') => ({
  ...unidades[indice], cantidad, clave, descripcion: 'Insumo', solicitudIds: ['A', 'B'],
});

test('agrupa cada movimiento por fecha, IDs y CNIS y separa almacenes de transferencias', () => {
  const necesidades = [necesidad(0, 80), necesidad(1, 50), necesidad(2, 10), necesidad(3, 10), necesidad(4, 10)];
  const original = structuredClone(necesidades);
  const resultado = conciliarSalidas(necesidades, unidades, [
    mov(1, 72, '05', 60), mov(1, 72, '05', 40, { lote: 'Y' }),
    mov(2, 75, '10', 20), mov(3, 71, '15', 10),
    mov(72, 75, '16', 30), mov(99, null, '17', 5, { destinoTexto: ' onco ' }),
    mov(75, 70, '25', 7),
    mov(1, 72, '06', 999), mov(2, 75, '05', 999), mov(3, 71, '16', 999),
    mov(72, 75, '15', 999), mov(72, 75, '26', 999),
    mov(72, 99, '17', 999), mov(72, 72, '17', 999), mov(88, 72, '17', 999),
    mov(null, 72, '17', 999), mov(null, 72, '17', 999, { origenTexto: 'AMB' }),
    mov(99, null, '17', 999, { destinoTexto: 'AMB' }),
    mov(99, 88, '17', 999, { destinoTexto: 'ONCO' }),
  ], identidades, ventanas);
  const [mexicali, tijuana, ensenada, onco, sanFelipe] = resultado.filas;
  assert.deepEqual(necesidades, original);
  assert.deepEqual(resultado.filas.map(f => [f.cantidad, f.solicitudIds]),
    original.map(f => [f.cantidad, f.solicitudIds]));
  assert.deepEqual(resultado.filas.map(f => f.surtido), [100, 50, 10, 5, 7]);
  assert.equal(mexicali.cobertura, 100);
  assert.equal(mexicali.relacion, 125);
  assert.equal(mexicali.excedente, 20);
  assert.equal(tijuana.surtidoHospitales, 30);
  assert.deepEqual(tijuana.origenes.map(o => [o.fuente, o.nombre, o.surtido, o.ultimaSalida]), [
    ['AZT', 'BCIMB001335', 20, '2026-11-10'],
    ['HOSPITAL', 'BCIMB000355', 30, '2026-11-16'],
  ]);
  for (const fila of resultado.filas) {
    assert.equal(fila.origenes.reduce((suma, o) => suma + o.surtido, 0), fila.surtido);
  }
  assert.deepEqual([tijuana.primeraSalida, tijuana.ultimaSalida, tijuana.fechasConSalida],
    ['2026-11-10', '2026-11-16', 2]);
  assert.deepEqual([mexicali.ultimaSalida, mexicali.fechasConSalida], ['2026-11-05', 1]);
  assert.equal(ensenada.surtidoAlmacenes, 10);
  assert.equal(onco.pendiente, 5);
  assert.equal(sanFelipe.pendiente, 3);
  assert.equal(resultado.filas.reduce((sum, f) => sum + f.surtidoAlmacenes, 0), 130);
  assert.equal(resultado.filas.reduce((sum, f) => sum + f.surtidoHospitales, 0), 42);
  assert.deepEqual([...resultado.diarios.values()][0].movimientos.map(m => m.lote), ['X', 'Y']);
  assert.deepEqual(resultado.incidencias, { origenNoElegible: 3, destinoNoElegible: 3, mismaUnidad: 1, datosInvalidos: 0 });
});

test('conserva las tres zonas y excluye transferencias cuando la fuente se desactiva', () => {
  const r = conciliarSalidas([], unidades, [
    mov(1, 72, '03', 18), mov(1, 72, '03', -3), mov(2, 75, '07', 20), mov(3, 71, '12', 30),
    mov(72, 75, '17', 500), mov(99, 126, '17', 500), mov(1, 99, '03', 500),
    mov(1, 72, '06', 500),
  ], identidades, ventanas, false);
  assert.deepEqual(r.filas.map(f => [f.surtido, f.origenes.map(o => o.fuente)]),
    [[15, ['AZM']], [20, ['AZT']], [30, ['AZE']]]);
  for (const fila of r.filas) assert.equal(fila.origenes.reduce((n, o) => n + o.surtido, 0), fila.surtido);
});

test('conserva neto negativo, neto cero y porcentajes N/D sin compensar claves', () => {
  const r = conciliarSalidas([necesidad(0, 10), necesidad(0, 10, 'CERO'), necesidad(0, 0, 'SIN'), necesidad(0, 4, 'SIN-SALIDA')], unidades, [
    mov(1, 72, '03', -3), mov(1, 72, '03', 9, { clave: 'CERO' }), mov(1, 72, '03', -9, { clave: 'CERO' }),
    mov(1, 72, '03', 15, { clave: 'SIN' }), mov(1, 72, '03', 2, { clave: 'SIN-PEDIDO' }),
  ], identidades, ventanas);
  assert.deepEqual(r.filas.map(f => [f.surtido, f.pendiente, f.cobertura, f.relacion]),
    [[-3, 10, 0, -30], [0, 10, 0, 0], [15, 0, null, null], [0, 4, 0, 0], [2, 0, null, null]]);
  assert.deepEqual(r.filas.map(f => f.ultimaSalida),
    ['2026-11-03', '2026-11-03', '2026-11-03', null, '2026-11-03']);
  assert.equal(r.filas[1].origenes[0].surtido, 0);
  assert.equal(r.filas[0].origenes[0].surtido, -3);
  assert.equal(r.filas.reduce((sum, f) => sum + f.pendiente, 0), 24);
  assert.equal(ventanas[3].hasta, '2026-11-25');
  assert.throws(() => ventanasEfectivas([ventanas[0]], '', '', '2026-11-25'), RangeError);
});
