const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const XLSX = require('xlsx');
const fs = require('node:fs/promises');
const Service = require('../dist/services/reporteRadarSemanal.service').default;
const Controller = require('../dist/controllers/reporteRadarSemanal.controller').default;

const row = require('./fixtures/radar-reporte.cjs');

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
  const buffer = await leerExcel(service, report.versionDatos);
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
  const buffer = await leerExcel(service, report.versionDatos);
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


test('version estable ante evidencia reordenada con caracteres invisibles distintos', async () => {
  const { service, evidencia } = fixture();
  evidencia.ordenes = [
    { ...evidencia.ordenes[0], proveedor: 'AB' },
    { ...evidencia.ordenes[0], proveedor: 'A\u200bB' }
  ];
  const original = await service.obtenerReporte(3);
  evidencia.ordenes.reverse();
  assert.equal((await service.obtenerReporte(3)).versionDatos, original.versionDatos);
  const buffer = await leerExcel(service, original.versionDatos);
  assert.equal(XLSX.read(buffer, { type: 'buffer' }).SheetNames.length, 6);
  evidencia.ordenes[0].piezas_pendientes++;
  await assert.rejects(service.generarExcel(3, original.versionDatos), error => error.status === 409);
});

test('version estable ante filas y propiedades reordenadas; no ignora cambios de texto', async () => {
  const { service, out } = fixture([row(), row({ clave: '010.000.0002.00' })]);
  const original = await service.obtenerReporte(3);
  out.data = out.data.reverse().map(item => Object.fromEntries(Object.entries(item).reverse()));
  assert.equal((await service.obtenerReporte(3)).versionDatos, original.versionDatos);
  out.data[0].descripcion += '\u200b';
  await assert.rejects(service.generarExcel(3, original.versionDatos), error => error.status === 409);
});


async function leerExcel(service, version) {
  const result = await service.generarExcel(3, version);
  try { return await fs.readFile(result.archivo); }
  finally {
    await result.limpiar();
    await assert.rejects(fs.access(result.archivo), error => error.code === 'ENOENT');
  }
}

test('limita concurrencia entre servicios y libera el cupo después de errores', async () => {
  let liberar;
  const pendiente = new Promise(resolve => { liberar = resolve; });
  const { out } = fixture([]);
  const lento = new Service({
    async listarGlobalV2() { await pendiente; throw new Error('Fallo de prueba'); },
    async exportarGlobalV2Detalles() { return { salidas: [], ordenes: [] }; }
  });
  const primero = lento.obtenerReporte(3);
  const rechazo = assert.rejects(primero, /Fallo de prueba/);
  const { service } = fixture([]);
  try {
    await assert.rejects(service.obtenerReporte(3), error => error.status === 503);
    await assert.rejects(service.generarExcel(3), error => error.status === 503);
  } finally { liberar(); }
  await rechazo;
  assert.equal((await service.obtenerReporte(3)).resumen.registrosUnidadClave, 0);
});

test('version conserva multiplicidad, null, tipos y diferencias invisibles', async () => {
  const { versionReporte } = require('../dist/services/reporteRadarVersion');
  assert.equal(await versionReporte([{ a: 1, b: null }, 2]), await versionReporte([2, { b: null, a: 1 }]));
  assert.notEqual(await versionReporte([1]), await versionReporte([1, 1]));
  assert.notEqual(await versionReporte([1]), await versionReporte(['1']));
  assert.notEqual(await versionReporte({ a: null }), await versionReporte({}));
  assert.notEqual(await versionReporte(['AB']), await versionReporte(['A\u200bB']));
});


test('escritura incremental conserva filas posteriores a la muestra y formato numérico', async () => {
  const rows = Array.from({ length: 501 }, (_, n) => row({ clave: String(n).padStart(12, '0') }));
  const { service } = fixture(rows);
  const report = await service.obtenerReporte(3);
  const book = XLSX.read(await leerExcel(service, report.versionDatos), { type: 'buffer', cellNF: true });
  const values = XLSX.utils.sheet_to_json(book.Sheets.Radar);
  assert.equal(values.length, 501);
  assert.equal(values[0].Clave, '000000000000');
  assert.equal(values[500].Clave, '000000000500');
  assert.equal(values[500]['Frecuencia de solicitud'], .5);
  assert.equal(book.Sheets.Radar['!autofilter'].ref.endsWith('502'), true);
});

test('elimina el temporal cuando falla la escritura del libro', async () => {
  const { escribirArchivoReporte } = require('../dist/services/reporteXlsxStream');
  const { tmpdir } = require('node:os');
  const listado = async () => (await fs.readdir(tmpdir())).filter(name => name.startsWith('radar-reporte-')).sort();
  const before = await listado();
  await assert.rejects(escribirArchivoReporte(async libro => {
    await libro.tabla('Prueba', [{ Clave: '001' }], 'Sin filas');
    throw new Error('Fallo intencional de escritura');
  }), /Fallo intencional/);
  assert.deepEqual(await listado(), before);
});

test('el hash por lotes permite atender el event loop mientras procesa filas', async () => {
  const { versionReporte } = require('../dist/services/reporteRadarVersion');
  let atendido = false;
  setImmediate(() => { atendido = true; });
  await versionReporte({ data: Array.from({ length: 1000 }, (_, n) => ({ clave: String(n) })) });
  assert.equal(atendido, true);
});


test('mapeo del radar conserva conteos y convierte numeric sin duplicar el resultado', async () => {
  const { pool } = require('../dist/db/pool');
  const Radar = require('../dist/services/radar-abasto.service').default;
  const query = pool.query;
  pool.query = async () => ({ rows: [{ ...row(), cpm: '10.5', existencia_actual: '2', total_rows: 1,
    total_criticas: 1, total_atencion: 0, total_sin_cpm: 0, total_sin_solicitud: 0, total_cubiertas: 0 }] });
  try {
    const result = await new Radar().listarGlobalV2({ months: 3, export: true });
    assert.equal(result.total, 1);
    assert.equal(result.summary.criticas_cpm, 1);
    assert.equal(result.data[0].cpm, 10.5);
    assert.equal(result.data[0].existencia_actual, 2);
    assert.equal('total_rows' in result.data[0], false);
  } finally { pool.query = query; }
});

test('controlador responde 503 con Retry-After sin iniciar otra generación', async () => {
  const { ReporteRadarError } = require('../dist/services/reporteRadarSemanal.service');
  const controller = new Controller({ async obtenerReporte() {
    throw new ReporteRadarError(503, 'reporte_radar_ocupado', 'En proceso');
  } });
  const headers = {}, res = {
    setHeader(key, value) { headers[key] = value; }, removeHeader(key) { delete headers[key]; },
    status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; }
  };
  await controller.reporte({ query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(headers['Retry-After'], '30');
  assert.equal(res.body.error, 'reporte_radar_ocupado');
});


test('Excel directo consulta una vez y no calcula hash ni prepara el correo JSON', async () => {
  const versionModule = require('../dist/services/reporteRadarVersion');
  const versionOriginal = versionModule.versionReporte;
  versionModule.versionReporte = async () => { throw new Error('No debe calcular hash'); };
  const { service, calls } = fixture();
  service.obtenerReporte = async () => { throw new Error('No debe consultar JSON'); };
  try {
    const book = XLSX.read(await leerExcel(service), { type: 'buffer' });
    assert.equal(book.SheetNames.length, 6);
    assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Radar).length, 1);
    assert.deepEqual(calls.map(call => call[0]), ['radar', 'detalle']);
  } finally { versionModule.versionReporte = versionOriginal; }
});

test('HTTP Excel directo funciona sin JSON previo y devuelve el nombre del archivo', async () => {
  const { service, calls } = fixture();
  const app = express();
  app.get('/reporte-excel', new Controller(service).reporteExcel);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/reporte-excel?months=3`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.has('x-reporte-version'), false);
    assert.match(response.headers.get('x-reporte-nombre-archivo'), /^radar_demanda_cobertura_\d{8}\.xlsx$/);
    const book = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
    assert.equal(book.SheetNames.length, 6);
    assert.deepEqual(calls.map(call => call[0]), ['radar', 'detalle']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('reporte fijo de tres meses consulta únicamente las vistas materializadas por lotes', async () => {
  const { pool } = require('../dist/db/pool');
  const TresMeses = require('../dist/services/reporteRadarSemanalTresMeses.service').default;
  const query = pool.query, connect = pool.connect;
  const queries = [];
  pool.query = async sql => {
    queries.push(sql);
    if (sql.includes('GROUP BY cluesimb')) return { rows: [{ unidad: 'Unidad de prueba · BC001', claves_solicitadas: 1, sin_existencia: 1 }] };
    return { rows: [{ total: 1, criticas_cpm: 1, atencion_cpm: 0, demanda_sin_cpm: 0,
      cpm_sin_solicitud: 0, cubiertas: 0, vigente_en_proceso: 0, vigente_con_salida: 0,
      fuera_umbral_sin_salida: 0, historica_con_salida: 1, sin_solicitud_observada: 0,
      con_ordenes_vencidas: 1, con_salida_posterior: 1 }] };
  };
  pool.connect = async () => {
    let cursor = '', entregado = false;
    return { async query(sql) {
      queries.push(sql);
      if (sql.startsWith('DECLARE')) cursor = sql;
      if (!sql.startsWith('FETCH') || entregado) return { rows: [] };
      entregado = true;
      if (cursor.includes('_salidas')) return { rows: [{ cluesimb: 'BC001', clave: '010.000.0001.00',
        nombre_de_unidad: 'Unidad de prueba', descripcion: 'Insumo', ultima_solicitud: '2026-09-01',
        id: 1, fecha_entregado: '2026-09-21', cantidad: '2', folio: 'SAL-1' }] };
      if (cursor.includes('_ordenes')) return { rows: [{ cluesimb: 'BC001', clave: '010.000.0001.00',
        nombre_de_unidad: 'Unidad de prueba', descripcion: 'Insumo', orden_de_suministro: 'ORD-1',
        estado_radar: 'VENCIDA', piezas_emitidas: '5', piezas_recibidas: '2', piezas_pendientes: '3' }] };
      return { rows: [row()] };
    }, release() {} };
  };
  try {
    const result = await new TresMeses().generarExcel();
    try {
      const consultasDatos = queries.filter(sql => sql.includes('SELECT') || sql.startsWith('DECLARE'));
      assert.ok(consultasDatos.every(sql => sql.includes('mv_reporte_radar_semanal_3m')));
      assert.ok(queries.every(sql => !sql.includes('solicitud_bitacora')));
      assert.match(result.reporte.nombreArchivo, /^radar_demanda_cobertura_\d{8}\.xlsx$/);
      const book = XLSX.read(await fs.readFile(result.archivo), { type: 'buffer' });
      assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Radar).length, 1);
      assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Detalle salidas']).length, 1);
      assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Órdenes contexto']).length, 1);
    } finally { await result.limpiar(); }
  } finally { pool.query = query; pool.connect = connect; }
});
