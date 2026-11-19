const test = require('node:test');
const assert = require('node:assert/strict');
const { clasificarNecesidadesProgramaticas } = require('../dist/services/abasto-programas-clasificacion');

const catalogos = {
  clavesAps: new Set(['APS-1', 'COMPARTIDA']),
  programasPorClave: new Map([
    ['PP-1', [{ codigo: 'VACUNACION', nombre: 'Vacunación' }]],
    ['COMPARTIDA', [{ codigo: 'DENTAL', nombre: 'Dental' }]],
    ['MULTI', [
      { codigo: 'DENTAL', nombre: 'Dental' },
      { codigo: 'VACUNACION', nombre: 'Vacunación' },
    ]],
  ]),
  nombresProgramas: new Map([
    ['VACUNACION', 'Vacunación'],
    ['DENTAL', 'Dental'],
  ]),
};

test('clasifica contexto registrado, históricos únicos y conserva ambiguos sin duplicar', () => {
  const detalles = [
    { solicitudId: 'aps', clave: 'APS-1', cantidad: 10 },
    { solicitudId: 'pp', clave: 'PP-1', cantidad: 20 },
    { solicitudId: 'inferida-aps', clave: 'APS-1', cantidad: 30 },
    { solicitudId: 'inferida-pp', clave: 'PP-1', cantidad: 40 },
    { solicitudId: 'compartida', clave: 'COMPARTIDA', cantidad: 50 },
    { solicitudId: 'multi', clave: 'MULTI', cantidad: 60 },
    { solicitudId: 'indeterminada', clave: 'OTRA', cantidad: 70 },
    { solicitudId: 'clave', clave: 'APS-1', cantidad: 80 },
    { solicitudId: 'origenes', clave: 'MIXTA', cantidad: 90 },
  ];
  const contextos = [
    { solicitudId: 'aps', clave: 'APS-1', cantidad: 10, origen: 'APS', referencia: 'APS-X' },
    { solicitudId: 'pp', clave: 'PP-1', cantidad: 20, origen: 'PROGRAMA_PREVENTIVO', referencia: 'VACUNACION' },
    { solicitudId: 'clave', clave: 'APS-1', cantidad: 80, origen: 'CLAVE', referencia: null },
    { solicitudId: 'origenes', clave: 'MIXTA', cantidad: 35, origen: 'APS', referencia: 'APS-X' },
    { solicitudId: 'origenes', clave: 'MIXTA', cantidad: 55, origen: 'PROGRAMA_PREVENTIVO', referencia: 'DENTAL' },
  ];

  const result = clasificarNecesidadesProgramaticas(detalles, contextos, catalogos);
  assert.equal(result.totalGeneral, 450);
  assert.equal(result.cantidadProgramatica, 190);
  assert.equal(result.cantidadClaveRegistrada, 80);
  assert.equal(result.cantidadAmbigua, 110);
  assert.equal(result.cantidadSinCoincidencia, 70);
  assert.equal(result.diferenciasContexto, 0);
  assert.equal(result.clasificadas.length, 6);
  assert.equal(result.clasificadas.filter(item => item.evidencia === 'REGISTRADA').length, 4);
  assert.equal(result.clasificadas.filter(item => item.evidencia === 'INFERIDA').length, 2);
  assert.equal(result.clasificadas.filter(item => item.solicitudId === 'origenes').length, 2);
  assert.equal(result.clasificadas.some(item => item.solicitudId === 'clave'), false);
});
