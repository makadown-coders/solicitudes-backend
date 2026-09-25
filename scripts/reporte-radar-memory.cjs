const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const count = Number(process.argv[2] || 50000);
const backend = path.resolve(__dirname, '..');
const row = require('./fixtures/radar-reporte.cjs');
const before = performance.now();
let peakHeap = 0, peakRss = 0;
const sample = () => {
  const usage = process.memoryUsage();
  peakHeap = Math.max(peakHeap, usage.heapUsed);
  peakRss = Math.max(peakRss, usage.rss);
};
const timer = setInterval(sample, 10);
const rows = Array.from({ length: count }, (_, n) => row({
  cluesimb: `BC${String(n % 100).padStart(3, '0')}`, clave: `010.${String(n).padStart(8, '0')}`,
  descripcion: `Insumo ${n} de prueba para medir memoria. `.repeat(5),
  nombre_de_unidad: `Unidad ${n % 100}`
}));
const out = { mode: 'radar-global-v2', window: { months: 3 }, page: 1, pageSize: 50000,
  total: count, truncated: false, data: rows,
  summary: { criticas_cpm: count, atencion_cpm: 0, demanda_sin_cpm: 0, cpm_sin_solicitud: 0, cubiertas: 0 } };
const evidencia = {
  salidas: rows.map((r, n) => ({ cluesimb: r.cluesimb, clave: r.clave, ultima_solicitud: r.ultima_solicitud,
    fecha_entregado: '2026-09-21', cantidad: 2, folio: `SAL-${n}`, unidad_origen: 'Almacén', unidad_destino: r.nombre_de_unidad })),
  ordenes: rows.map((r, n) => ({ cluesimb: r.cluesimb, clave: r.clave, orden_de_suministro: `ORD-${n}`,
    proveedor: `Proveedor ${n % 40}`, estado_radar: 'VENCIDA', piezas_emitidas: 5, piezas_recibidas: 2, piezas_pendientes: 3 }))
};
async function run() {
  sample();
  const Service = require(path.join(backend, 'dist/services/reporteRadarSemanal.service')).default;
  const service = new Service({ async listarGlobalV2() { return out; }, async exportarGlobalV2Detalles() { return evidencia; } });
  const report = await service.obtenerReporte(3);
  sample();
  const result = await service.generarExcel(3, report.versionDatos);
  try {
    sample();
    const stat = await fs.stat(result.archivo);
    assert.ok(stat.size > 0);
    console.log(JSON.stringify({ tipo: 'optimizado', registros: count, salidas: count, ordenes: count, bytes: stat.size,
      peakHeapMiB: Math.round(peakHeap / 2**20), peakRssMiB: Math.round(Math.max(peakRss / 2**20, process.resourceUsage().maxRSS / 1024)), segundos: Math.round((performance.now() - before) / 1000) }));
  } finally { await result.limpiar(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearInterval(timer));
