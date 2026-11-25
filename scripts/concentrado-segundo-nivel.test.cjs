const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cluesAutorizadas, consolidar, seleccionarPeriodo } = require('../dist/services/concentrado-segundo-nivel-calculo');

const unidades = cluesAutorizadas.map(clues => ({ clues, nombre: clues, municipio: '', jurisdiccion: '' }));
const cab = (id, cambios = {}) => ({
  id, clues: 'BCIMB000734', fecha: '2026-11-20', creada: '2026-11-20 16:00:00',
  periodo: '01-31 DICIEMBRE 2026', tipo: 'Ordinario', insumos: ['Medicamento'],
  hash: 'a'.repeat(64), clase: 'raw', ...cambios,
});
const det = (id, clave = 'CNIS1', cantidad = '10') => ({ id, clave, cantidad });

test('incluye las diez unidades autorizadas, entre ellas San Felipe y UNEME Oncología', () => {
  assert.deepEqual([...cluesAutorizadas].sort(), [
    'BCIMB000010', 'BCIMB000355', 'BCIMB001702', 'BCIMB001726', 'BCIMB001422',
    'BCIMB000623', 'BCIMB000676', 'BCIMB000734', 'BCIMB001796', 'BCIMB001352',
  ].sort());
  const cabeceras = [...unidades, { clues: 'FUERA' }].map(u => cab(u.clues, { clues: u.clues }));
  const resultado = consolidar(unidades, cabeceras, cabeceras.map(c => det(c.id)));
  assert.deepEqual(resultado.filas.map(f => f.clues).sort(), [...cluesAutorizadas].sort());
});

test('solo excluye snapshots completos equivalentes y un ID repetido no aumenta el total', () => {
  const cabeceras = [
    cab('original'), cab('original'),
    cab('reimpresion', { fecha: '2026-11-21', creada: '2026-11-21 17:00:00' }),
    cab('extra', { tipo: 'Extraordinario' }),
    cab('adicional'),
    cab('correccion', { hash: 'b'.repeat(64) }),
    cab('otro-periodo', { periodo: 'NOVIEMBRE 2026' }),
    cab('sin-hash', { hash: '' }), cab('sin-hash2', { hash: '' }),
    cab('sin-detalle'),
  ];
  const detalle = [
    det('original'), det('reimpresion'), det('extra'),
    det('adicional'), det('adicional', 'CNIS2', '7'), det('correccion', 'CNIS1', '15'),
    det('otro-periodo'), det('sin-hash'), det('sin-hash2'),
  ];
  const resultado = consolidar(unidades, cabeceras, detalle);
  assert.deepEqual(resultado.excluidas.map(c => [c.id, c.equivalenteA]), [['reimpresion', 'original']]);
  assert.deepEqual(resultado.incluidas.map(c => c.id).sort(),
    ['original', 'extra', 'adicional', 'correccion', 'otro-periodo', 'sin-hash', 'sin-hash2'].sort());
  assert.deepEqual(resultado.sinDetalle.map(c => c.id), ['sin-detalle']);
  const principal = resultado.filas.find(f => f.clave === 'CNIS1');
  assert.equal(principal.cantidad, 75);
  assert.equal(new Set(principal.solicitudIds).size, 7);
});

test('el mes depende del periodo declarado y la ventana móvil de la fecha local inclusiva', () => {
  const mensual = seleccionarPeriodo({ modalidad: 'MES_CALENDARIO', mes: '2026-12' }, '2026-11-25');
  assert.equal(mensual.hasta, '2026-12-31');
  assert.equal(mensual.incluye(cab('a')), true);
  assert.equal(mensual.incluye(cab('b', { periodo: 'NOVIEMBRE 2026' })), false);
  const base = seleccionarPeriodo({ modalidad: 'ULTIMOS_30_DIAS' }, '2026-11-25');
  assert.equal(base.desde, '2026-10-27');
  const movil = seleccionarPeriodo({ modalidad: 'ULTIMOS_30_DIAS', desde: '2026-10-21' }, '2026-11-25');
  for (const fecha of ['2026-10-21', '2026-11-25']) assert.ok(movil.incluye(cab('m', { fecha })));
  for (const fecha of ['2026-10-20', '2026-11-26']) assert.equal(movil.incluye(cab('m', { fecha })), false);
  assert.throws(() => seleccionarPeriodo({ modalidad: 'ULTIMOS_30_DIAS', desde: '2026-10-28' }, '2026-11-25'), RangeError);
});
