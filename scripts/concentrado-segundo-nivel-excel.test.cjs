const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectarCandidatos, clasificarGrupos } = require('../dist/services/concentrado-segundo-nivel-excel');

test('las alternativas dirigidas se conservan separadas y los factores conflictivos quedan sin cálculo', () => {
  const fila = (clave, cantidad, surtido, solicitudIds = [], clues = 'U') => ({
    clave, cantidad, surtido, pendiente: Math.max(cantidad - surtido, 0), solicitudIds, clues,
  });
  const filas = [fila('A', 20, 5, ['1']), fila('B', 10, 0, ['2']), fila('X', 0, 60),
    fila('Y', 0, 12), fila('Z', 0, 10, ['3']), fila('NEG', 0, -10), fila('OTRA', 0, 20, [], 'V'),
    fila('NEG-PROPIA', -2, 20, ['4']), fila('POSITIVA', 2, 20, ['5'])];
  const relacion = (claveConsultada, candidato, factor, direccion = 'FORWARD') => ({ claveConsultada, candidato, factor, direccion });
  const relaciones = [relacion('A', 'X', '4.0'), relacion('A', 'X', '4.00'), relacion('B', 'X', '5'),
    relacion('A', 'Y', '2'), relacion('A', 'Y', '3'), relacion('A', 'Z', '1'),
    relacion('A', 'NEG', '1'), relacion('A', 'OTRA', '1'), relacion('A', 'NEG-PROPIA', '1'),
    relacion('A', 'POSITIVA', '1'), relacion('A', 'Y', '1', 'REVERSE')];
  const original = structuredClone(filas);
  const [a, conflicto, b] = detectarCandidatos(filas, relaciones);
  assert.deepEqual(filas, original);
  assert.equal(detectarCandidatos(filas, relaciones).length, 3);
  assert.equal(a.potencial, 15);
  for (const aviso of ['Par repetido', 'Múltiples alternativas', 'Sustituta compartida']) assert.ok(a.estado.includes(aviso));
  assert.equal(conflicto.factor, null);
  assert.equal(conflicto.equivalente, null);
  assert.equal(conflicto.potencial, null);
  assert.match(conflicto.estado, /Factores contradictorios/);
  assert.equal(b.potencial, 10);
  assert.deepEqual(detectarCandidatos(filas, []), []);
  assert.equal(detectarCandidatos(filas, [relacion('A', 'X', '0')])[0].potencial, null);
});

test('conserva pertenencias reales, medicamentos sin grupo y correspondencias ambiguas', () => {
  const g1 = { numero: 1, nombre: 'Uno' };
  const g2 = { numero: 2, nombre: 'Dos' };
  assert.deepEqual(clasificarGrupos([
    { clave: 'A', medicamento: true, grupos: [g1] },
    { clave: 'B', medicamento: true, grupos: [g1, g2] },
    { clave: 'B', medicamento: true, grupos: [g2, g1] },
    { clave: 'C', medicamento: true, grupos: [] },
    { clave: 'D', medicamento: false, grupos: [g1] },
    { clave: 'E', medicamento: true, grupos: [g1] },
    { clave: 'E', medicamento: true, grupos: [g2] },
  ]), [
    { clave: 'A', ambigua: false, grupos: [g1] },
    { clave: 'B', ambigua: false, grupos: [g1, g2] },
    { clave: 'C', ambigua: false, grupos: [] },
    { clave: 'E', ambigua: true, grupos: [] },
  ]);
});
