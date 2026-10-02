const fs = require('node:fs/promises');
const path = require('node:path');
const row = require('./fixtures/radar-reporte.cjs');
const count = Number(process.argv[2] || 50000);
const backend = path.resolve(__dirname, '..');
const { pool } = require(path.join(backend, 'dist/db/pool'));
const Service = require(path.join(backend, 'dist/services/reporteRadarSemanalTresMeses.service')).default;
const originalQuery = pool.query, originalConnect = pool.connect;
let peakHeap = 0, peakRss = 0;
const sample = () => {
  const usage = process.memoryUsage();
  peakHeap = Math.max(peakHeap, usage.heapUsed); peakRss = Math.max(peakRss, usage.rss);
};
const timer = setInterval(sample, 10);
const started = performance.now();

pool.query = async sql => sql.includes('GROUP BY cluesimb') ? { rows: [] } : { rows: [{
  total: count, criticas_cpm: count, atencion_cpm: 0, demanda_sin_cpm: 0, cpm_sin_solicitud: 0,
  cubiertas: 0, vigente_en_proceso: 0, vigente_con_salida: 0, fuera_umbral_sin_salida: 0,
  historica_con_salida: count, sin_solicitud_observada: 0, con_ordenes_vencidas: count,
  con_salida_posterior: count
}] };
pool.connect = async () => {
  let cursor = '', offset = 0;
  return { async query(sql) {
    if (sql.startsWith('DECLARE')) { cursor = sql; return { rows: [] }; }
    if (!sql.startsWith('FETCH') || offset >= count) return { rows: [] };
    const size = Math.min(500, count - offset);
    const rows = Array.from({ length: size }, (_, index) => {
      const n = offset + index, cluesimb = `BC${String(n % 100).padStart(3, '0')}`;
      const clave = `010.${String(n).padStart(8, '0')}`;
      if (cursor.includes('_salidas')) return { cluesimb, clave, nombre_de_unidad: `Unidad ${n % 100}`,
        descripcion: `Insumo ${n}`, ultima_solicitud: '2026-09-01', id: n,
        fecha_entregado: '2026-09-21', cantidad: '2', folio: `SAL-${n}` };
      if (cursor.includes('_ordenes')) return { cluesimb, clave, nombre_de_unidad: `Unidad ${n % 100}`,
        descripcion: `Insumo ${n}`, orden_de_suministro: `ORD-${n}`, estado_radar: 'VENCIDA',
        piezas_emitidas: '5', piezas_recibidas: '2', piezas_pendientes: '3' };
      return row({ cluesimb, clave, nombre_de_unidad: `Unidad ${n % 100}`,
        descripcion: `Insumo ${n} de prueba para medir memoria. `.repeat(5) });
    });
    offset += size;
    return { rows };
  }, release() {} };
};

(async () => {
  try {
    const result = await new Service().generarExcel();
    try {
      sample();
      const stat = await fs.stat(result.archivo);
      console.log(JSON.stringify({ tipo: 'excel-paginado', radar: count, salidas: count, ordenes: count,
        bytes: stat.size, peakHeapMiB: Math.round(peakHeap / 2 ** 20), peakRssMiB: Math.round(peakRss / 2 ** 20),
        segundos: Math.round((performance.now() - started) / 1000) }));
    } finally { await result.limpiar(); }
  } finally {
    clearInterval(timer); pool.query = originalQuery; pool.connect = originalConnect;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
