const assert = require('node:assert/strict');
const { test } = require('node:test');
const { conciliar } = require('../dist/services/surtimiento-calculo');
const { construirDesglose } = require('../dist/services/surtimiento-programatico');

const cnis311 = '311.000.1234.01';
const detalle = [];
const contextos = [];
const agregar = (id, clave, cantidad, origen, referencia = null, cantidadCapturada = cantidad) => {
  detalle.push({ id, clave, cantidad, descripcion: clave, invalido: false });
  if (origen) contextos.push({ solicitudId: id, clave, cantidad: cantidadCapturada, origen, referencia, invalido: false });
};
agregar('a', 'APS', 10, 'APS');
agregar('b', 'PP', 10, 'PROGRAMA_PREVENTIVO', 'VAC');
agregar('c', 'DOBLE', 10, 'APS');
agregar('d', 'DOBLE', 10, 'PROGRAMA_PREVENTIVO', 'VAC');
agregar('e', 'CLAVE', 10, 'APS');
agregar('f', 'CLAVE', 10, 'CLAVE');
agregar('g', 'UNICA', 10);
agregar('h', 'AMBIGUA', 10);
agregar('i', 'ERROR', 10, 'APS', null, 11);
agregar('i', 'PARCIAL', 10);
agregar('j', cnis311, 10);
agregar('k', 'NO-FUSIONAR', 10);
agregar('l', 'ERROR-CON-COMPETENCIA', 10, 'APS', null, 9);
agregar('m', 'ERROR-CON-COMPETENCIA', 10, 'APS');
agregar('n', '311.000.9999.01', 10);

test('clasifica Wishlist y conserva identidad, cantidades y neto del informe general', () => {
  const claves = [...new Set(detalle.map(d => d.clave))];
  const cabeceras = [...new Set(detalle.map(d => d.id))].map(id => ({
    id, clues: 'BCIMB1', periodo: '2026-11', fecha: '2026-11-10', tipo: 'ORDINARIO', contexto: contextos.some(c => c.solicitudId === id),
  }));
  const centro = { id: 2, clues: 'BCIMB1', nombre: 'Centro', municipio: 'Tijuana', jurisdiccion: 'TIJUANA', unico: true };
  const almacen = { id: 1, nombre: 'Almacén', zonas: ['AZT'] };
  const dia = '2026-11-19';
  const consulta = {
    mes: '2026-11', solicitudesDesde: '2026-11-01', solicitudesHasta: dia,
    ventanas: [{ zona: 'AZT', almacenId: 1, desde: '2026-11-01', hasta: dia }],
  };
  const salidas = claves.map(clave => ({
    dia, origen: 1, destino: 2, clave, cantidad: clave === 'APS' ? 15 : clave === 'PP' ? -2 : 10,
    invalidas: 0, descripcion: '', centro: true, identificado: true,
  }));
  const informe = conciliar(consulta, dia, [centro], [almacen], cabeceras, detalle, salidas);
  const original = structuredClone(informe);
  const catalogo = ['UNICA', 'AMBIGUA', 'ERROR', 'PARCIAL', cnis311, '311.000.9999'].map(clave => ({
    clave, codigo: null, nombre: 'APS', seccion: 'Consulta',
  }));
  catalogo.push(
    { clave: 'APS', codigo: null, nombre: 'APS', seccion: 'Consulta' },
    { clave: 'APS', codigo: null, nombre: 'APS', seccion: 'Crónicas' },
    { clave: 'PP', codigo: 'VAC', nombre: 'Vacunación', seccion: 'Niñez' },
    { clave: 'AMBIGUA', codigo: 'VAC', nombre: 'Vacunación', seccion: null },
  );
  const filas = construirDesglose(informe.filas, cabeceras, detalle, contextos, catalogo);
  const buscar = clave => filas.filter(f => f.clave === clave);
  assert.deepEqual(informe, original);
  assert.equal(buscar('APS').length, 1);
  assert.deepEqual(buscar('APS')[0].ramificaciones, ['Consulta', 'Crónicas']);
  assert.equal(buscar('APS')[0].surtido, 15);
  assert.equal(buscar('APS')[0].relacion, 150);
  assert.equal(buscar('APS')[0].cobertura, 100);
  assert.equal(buscar('PP')[0].surtido, -2);
  assert.equal(buscar('PP')[0].pendiente, 12);
  assert.equal(buscar('PP')[0].programaNombre, 'Vacunación');
  assert.equal(buscar('UNICA')[0].evidencia, 'INFERIDA');
  assert.equal(buscar(cnis311)[0].clave, cnis311);
  for (const clave of ['AMBIGUA', 'ERROR', 'PARCIAL', 'NO-FUSIONAR', '311.000.9999.01']) {
    assert.equal(buscar(clave).length, 0);
  }
  assert.equal(buscar('DOBLE').length, 2);
  for (const clave of ['DOBLE', 'CLAVE', 'ERROR-CON-COMPETENCIA']) {
    assert.ok(buscar(clave).every(f => f.condicion === 'COMPARTIDO' && f.surtido === null && f.cobertura === null));
  }
  assert.equal(buscar('ERROR-CON-COMPETENCIA')[0].cantidad, 10);
  assert.equal(filas.reduce((n, f) => n + (f.surtido ?? 0), 0), 33);
});
