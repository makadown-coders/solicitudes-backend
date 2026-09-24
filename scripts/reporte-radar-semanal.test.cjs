const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const XLSX = require('xlsx');
const Service = require('../dist/services/reporteRadarSemanal.service').default;
const Controller = require('../dist/controllers/reporteRadarSemanal.controller').default;

function row(overrides = {}) {
  return {
    cluesimb: 'BC001', nombre_de_unidad: 'Unidad de prueba', clave: '010.000.0001.00', descripcion: 'Insumo',
    cpm: 10, en_cpm: true, existencia_actual: 0, snapshot_existencias: '2026-09-20T10:00:00Z',
    cobertura_cpm: 0, cobertura_dias: 0, solicitado_periodo: 20, ciclos_con_clave: 1, ciclos_unidad: 2,
    frecuencia_solicitud: .5, primera_solicitud: '2026-09-01', ultima_solicitud: '2026-09-01',
    solicitado_vigente: 0, ciclos_vigentes: 0, solicitud_vigente: false, dias_desde_ultima_solicitud: 23,
    fecha_fin_umbral: '2026-09-15', dias_restantes_umbral: 0, salida_posterior: true,
    piezas_salida_posterior: 2, ultima_salida_posterior: '2026-09-21', estado_operativo: 'HISTORICA_CON_SALIDA',
    homologos_disponibles: 0, existencia_homologos_equivalente: 0, mejor_homologo: null,
    ordenes_pendientes: 1, piezas_pendientes: 3, ordenes_por_vencer: 0, ordenes_vencidas: 1,
    recepciones_recientes: 0, piezas_recibidas_recientes: 0, proxima_entrega: null,
    cobertura_proyectada: 3, cobertura_proyectada_cpm: .3, segmento: 'CRITICA_CPM', prioridad: 100,
    razones: ['Sin existencia', 'Orden vencida'], ...overrides
  };
}

function fixture(rows = [row()]) {
  const out = { mode: 'radar-global-v2', window: { months: 3 }, page: 1, pageSize: 50000,
    total: rows.length, truncated: false, data: rows,
    summary: { criticas_cpm: rows.filter(r => r.segmento === 'CRITICA_CPM').length,
      atencion_cpm: 0, demanda_sin_cpm: 0, cpm_sin_solicitud: 0, cubiertas: 0 } };
  const evidencia = { salidas: [{ cluesimb: 'BC001', clave: '010.000.0001.00', ultima_solicitud: '2026-09-01',
    fecha_entregado: '2026-09-21', cantidad: 2, folio: 'SAL-1' }],
    ordenes: [{ cluesimb: 'BC001', clave: '010.000.0001.00', orden_de_suministro: 'ORD-1',
      estado_radar: 'VENCIDA', piezas_emitidas: 5, piezas_recibidas: 2, piezas_pendientes: 3 }] };
  const calls = [];
  const service = new Service({
    async listarGlobalV2(input) { calls.push(['radar', input]); return out; },
    async exportarGlobalV2Detalles(pares, months) { calls.push(['detalle', pares, months]); return evidencia; }
  });
  return { service, out, evidencia, calls };
}

test('resume por unidad, conserva origen y consulta evidencia relevante', async () => {
  const { service, calls } = fixture([row(), row({ clave: '010.000.0002.00', solicitado_periodo: 0,
    segmento: 'CPM_SIN_SOLICITUD', ordenes_vencidas: 0, ordenes_pendientes: 0, salida_posterior: false })]);
  const report = await service.obtenerReporte(3);
  assert.equal(report.resumen.registrosUnidadClave, 2);
  assert.equal(report.resumen.registrosConSeguimiento, 1);
  assert.equal(report.tablaCorreo[0]['Claves solicitadas'], 1);
  assert.equal(report.tablaCorreo[0]['Solicitadas sin existencia'], 1);
  assert.match(report.correo.encabezadoHtml, /LOS EXCELES GENERADOS CON LA HERRAMIENTA DE SOLICITUDES/);
  assert.match(report.nombreArchivo, /^radar_demanda_cobertura_\d{8}\.xlsx$/);
  assert.deepEqual(calls[0][1], { months: 3, page: 1, pageSize: 50000, export: true });
  assert.equal(calls[1][1].length, 1);
});

test('libro real contiene seis hojas, evidencia y formatos sin perder claves', async () => {
  const { service } = fixture();
  const report = await service.obtenerReporte(3);
  const { buffer } = await service.generarExcel(3, report.versionDatos);
  assert.ok(Buffer.isBuffer(buffer));
  const book = XLSX.read(buffer, { type: 'buffer', cellNF: true });
  assert.deepEqual(book.SheetNames, ['Guía y alcance', 'Resumen', 'Resumen por unidad', 'Radar', 'Detalle salidas', 'Órdenes contexto']);
  const radar = XLSX.utils.sheet_to_json(book.Sheets.Radar);
  assert.equal(radar[0].Clave, '010.000.0001.00');
  assert.equal(radar[0]['Requiere seguimiento'], 'Sí');
  assert.equal(radar[0]['Cobertura estimada en días'], 0);
  assert.equal(radar[0]['Frecuencia de solicitud'], .5);
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Detalle salidas'])[0].Cantidad, 2);
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Órdenes contexto'])[0].Estado, 'Vencida');
  assert.ok(Object.values(book.Sheets.Radar).some(cell => cell && cell.z === '0.00%'));
  assert.match(JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets['Guía y alcance'])), /LOS EXCELES/);
});

test('rechaza truncamiento y discordancia de conteos sin solicitar detalle', async () => {
  const { service, out, calls } = fixture();
  out.truncated = true;
  await assert.rejects(service.obtenerReporte(3), error => error.status === 422);
  out.truncated = false; out.total = 2;
  await assert.rejects(service.generarExcel(3), error => error.status === 422);
  assert.equal(calls.filter(call => call[0] === 'detalle').length, 0);
});

test('version ignora orden incidental pero detecta cambios en radar y evidencia', async () => {
  const { service, out, evidencia } = fixture();
  const original = await service.obtenerReporte(3);
  out.data[0].razones.reverse();
  assert.equal((await service.obtenerReporte(3)).versionDatos, original.versionDatos);
  evidencia.ordenes[0].piezas_pendientes++;
  await assert.rejects(service.generarExcel(3, original.versionDatos), error => error.status === 409);
  evidencia.ordenes[0].piezas_pendientes--;
  out.data[0].existencia_actual++;
  await assert.rejects(service.generarExcel(3, original.versionDatos), error => error.status === 409);
});

test('sin datos devuelve resumen vacío, advertencia y un Excel válido', async () => {
  const { service, calls } = fixture([]);
  const report = await service.obtenerReporte(3);
  assert.equal(report.resumen.registrosUnidadClave, 0);
  assert.deepEqual(report.tablaCorreo, []);
  assert.ok(report.advertencias.some(text => text.includes('No se encontraron registros')));
  const { buffer } = await service.generarExcel(3, report.versionDatos);
  assert.equal(XLSX.read(buffer, { type: 'buffer' }).SheetNames.length, 6);
  assert.equal(calls.filter(call => call[0] === 'detalle').length, 0);
});

test('contrato HTTP: JSON, XLSX binario, validación y conflicto', async () => {
  const { service, out } = fixture();
  const app = express();
  const controller = new Controller(service);
  app.get('/reporte', controller.reporte);
  app.get('/reporte-excel', controller.reporteExcel);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const query of ['months=0', 'months=13', 'months=3.5', 'months=3x', 'months=', 'months=3&months=6', 'versionDatos=incorrecta']) {
      assert.equal((await fetch(`${base}/reporte?${query}`)).status, 400);
    }
    const response = await fetch(`${base}/reporte`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const report = await response.json();
    assert.equal(report.months, 3);
    const excel = await fetch(`${base}/reporte-excel?months=3&versionDatos=${report.versionDatos}`);
    assert.equal(excel.status, 200);
    assert.match(excel.headers.get('content-type'), /spreadsheetml/);
    assert.match(excel.headers.get('content-disposition'), /radar_demanda_cobertura_/);
    assert.equal(XLSX.read(Buffer.from(await excel.arrayBuffer()), { type: 'buffer' }).SheetNames.length, 6);
    out.data[0].existencia_actual++;
    assert.equal((await fetch(`${base}/reporte-excel?versionDatos=${report.versionDatos}`)).status, 409);
    out.truncated = true;
    assert.equal((await fetch(`${base}/reporte`)).status, 422);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
