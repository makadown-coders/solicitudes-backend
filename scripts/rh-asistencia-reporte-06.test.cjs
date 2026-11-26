const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const RhAsistenciaController = require('../dist/controllers/rh-asistencia.controller').default;
const { pool } = require('../dist/db/pool');

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    set(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function run() {
  const controller = new RhAsistenciaController();
  const originalQuery = pool.query;
  const rhGlobalAccess = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };
  const rhCluesAccess = { scope: 'CLUES', clues: ['BCIMB00001'], grantedBy: 'RECURSOS_HUMANOS' };

  const rows = [
    {
      persona_id: 1,
      nombre_completo: 'ACEVEDO JOSE LUIS',
      activo_actual: true,
      fecha_ingreso: '2024-01-01',
      fecha_baja: null,
      control_id: 10,
      control_unidad_id: 177,
      control_unidad_nombre: 'OFICINA CENTRAL',
      control_adscripcion_id: null,
      estado_control: 'RECIBIDA',
      fecha_recepcion: null,
      recibido_por: null,
      excepcion_administrativa: false,
      motivo_excepcion: null,
      observaciones: null,
      generado_docx_en: null,
      generaciones_docx_count: 0,
      entrega_declarada_en: null,
      origen_registro: 'MIGRACION_HISTORICA_EXCEL',
      actualizado_en: '2026-11-24T00:00:00Z',
      adscripcion_ref_id: 101,
      adscripcion_ref_unidad_id: 177,
      adscripcion_ref_unidad_nombre: 'OFICINA CENTRAL',
      adscripcion_ref_puesto: 'PERSONAL',
      directorio_unidad_id: 177,
      directorio_unidad_nombre: 'OFICINA CENTRAL',
      cargo_directorio: 'PERSONAL',
    },
    {
      persona_id: 2,
      nombre_completo: 'BAJA SIN FECHA',
      activo_actual: false,
      fecha_ingreso: '2024-01-01',
      fecha_baja: null,
      control_id: null,
      control_unidad_id: null,
      control_unidad_nombre: null,
      control_adscripcion_id: null,
      estado_control: null,
      fecha_recepcion: null,
      recibido_por: null,
      excepcion_administrativa: null,
      motivo_excepcion: null,
      observaciones: null,
      generado_docx_en: null,
      generaciones_docx_count: 0,
      entrega_declarada_en: null,
      origen_registro: null,
      actualizado_en: null,
      adscripcion_ref_id: null,
      adscripcion_ref_unidad_id: null,
      adscripcion_ref_unidad_nombre: null,
      adscripcion_ref_puesto: null,
      directorio_unidad_id: 177,
      directorio_unidad_nombre: 'OFICINA CENTRAL',
      cargo_directorio: 'OFICINA',
    },
  ];

  pool.query = async (sql) => {
    const s = String(sql);
    if (s.includes('p.activo IS TRUE AND p.fecha_baja IS NULL')) {
      return { rows: rows.filter((r) => r.activo_actual && !r.fecha_baja) };
    }
    if (s.includes('p.activo IS FALSE OR p.fecha_baja IS NOT NULL')) {
      return { rows: rows.filter((r) => !r.activo_actual || r.fecha_baja) };
    }
    return { rows };
  };

  let passed = 0;
  try {
    // 1. Permisos: RH CLUES rechazado (403)
    const res403 = createMockRes();
    await controller.exportarReporteAnualXlsx({ rhAccess: rhCluesAccess, query: { anio: '2026' } }, res403);
    assert.equal(res403.statusCode, 403);
    passed++;

    // 2. Filtro situacion ACTIVOS vs BAJAS vs TODOS
    const resAct = createMockRes();
    await controller.seguimientoMensual({ rhAccess: rhGlobalAccess, query: { anio: '2026', mes: '1', situacion: 'ACTIVOS' } }, resAct);
    assert.equal(resAct.statusCode, 200);
    assert.equal(resAct.body.total, 1);

    const resBaj = createMockRes();
    await controller.seguimientoMensual({ rhAccess: rhGlobalAccess, query: { anio: '2026', mes: '1', situacion: 'BAJAS' } }, resBaj);
    assert.equal(resBaj.statusCode, 200);
    assert.equal(resBaj.body.total, 1);
    assert.equal(resBaj.body.items[0].persona_id, 2);
    passed++;

    // 3. Reporte XLSX anual: 2 hojas, estados históricos, sin datos sensibles
    const resXlsx = createMockRes();
    await controller.exportarReporteAnualXlsx({ rhAccess: rhGlobalAccess, query: { anio: '2026', situacion: 'TODOS' } }, resXlsx);
    assert.equal(resXlsx.statusCode, 200);
    assert.equal(resXlsx.headers['cache-control'], 'no-store');
    assert.ok(Buffer.isBuffer(resXlsx.body));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(resXlsx.body);
    assert.equal(wb.worksheets.length, 2);
    assert.equal(wb.worksheets[0].name, 'Control anual');
    assert.equal(wb.worksheets[1].name, 'Resumen mensual');
    const row6 = wb.worksheets[0].getRow(6).values;
    assert.equal(row6[2], 'ACEVEDO JOSE LUIS');
    assert.equal(row6[6], 'RECIBIDA (Histórica)');
    passed++;
  } finally {
    pool.query = originalQuery;
  }

  console.log(`RH-ASIS-06 REPORTE TESTS PASSED: ${passed}/3 suites`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
