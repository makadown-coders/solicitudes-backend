const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
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
  };
}

function buildXlsxBase64(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return {
    base64: buf.toString('base64'),
    hash: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

async function run() {
  const controller = new RhAsistenciaController();
  const originalConnect = pool.connect;

  const rhGlobalUserId = '11111111-1111-4111-8111-111111111111';
  const rhGlobalAccess = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };
  const rhCluesAccess = { scope: 'CLUES', clues: ['BCIMB00001'], grantedBy: 'RECURSOS_HUMANOS' };

  const validXlsx = buildXlsxBase64([
    ['PUESTO', 'NOMBRE', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'],
    ['DEPTO PERSONAL', 'ACEVEDO JOSE LUIS', 'X', 'X', '', '', '', '', '', '', '', '', '', ''],
    ['OFICINA', 'AGUILAR BETZAIDA', 'X', '', '', '', '', '', '', '', '', '', '', ''],
  ]);

  let dbRows = [];
  let nextId = 1;
  let auditLogs = [];
  let failAuditNext = false;
  const existingPersonaIds = new Set([1, 2]);

  pool.connect = async () => {
    let snapRows = null;
    let snapAudits = null;
    return {
      async query(sql, params = []) {
        const s = String(sql).trim();
        if (s === 'BEGIN') {
          snapRows = JSON.parse(JSON.stringify(dbRows));
          snapAudits = JSON.parse(JSON.stringify(auditLogs));
          return { rows: [] };
        }
        if (s === 'COMMIT') {
          snapRows = null;
          snapAudits = null;
          return { rows: [] };
        }
        if (s === 'ROLLBACK') {
          if (snapRows !== null) dbRows = snapRows;
          if (snapAudits !== null) auditLogs = snapAudits;
          return { rows: [] };
        }
        if (s.includes('pg_advisory_xact_lock')) return { rows: [{}] };
        if (s.includes('FROM public.persona WHERE id = ANY')) {
          const ids = (params[0] || []).filter((id) => existingPersonaIds.has(id));
          return { rows: ids.map((id) => ({ id })) };
        }
        if (s.includes('FROM public.rh_asistencia_entrega_mensual') && s.includes('FOR UPDATE')) {
          const ids = new Set(params[0] || []);
          return { rows: dbRows.filter((r) => r.anio === 2026 && ids.has(r.persona_id)) };
        }
        if (s.startsWith('INSERT INTO public.rh_asistencia_entrega_mensual')) {
          const row = {
            id: nextId++,
            persona_id: params[0],
            anio: 2026,
            mes: params[1],
            unidad_medica_id: params[2],
            estado: 'RECIBIDA',
            fecha_recepcion: null,
            recibido_por: null,
            origen_registro: 'MIGRACION_HISTORICA_EXCEL',
            referencia_migracion: JSON.parse(params[3]),
            importado_por: params[4],
          };
          dbRows.push(row);
          return { rows: [{ id: row.id }] };
        }
        if (s.startsWith('INSERT INTO public.app_audit_logs')) {
          if (failAuditNext) {
            failAuditNext = false;
            throw new Error('Simulated audit failure');
          }
          auditLogs.push({ user_id: params[0], resource: params[1], payload: JSON.parse(params[4]) });
          return { rows: [] };
        }
        return { rows: [] };
      },
      release() {},
    };
  };

  let passed = 0;
  try {
    const validPayload = {
      archivo_nombre: 'CONTROL LISTA DE ASISTENCIA - 2026.xlsx',
      archivo_base64: validXlsx.base64,
      archivo_hash_esperado: validXlsx.hash,
      anio: 2026,
      registros: [
        { persona_id: 1, mes: 1, unidad_medica_id: 10, hoja: 'Hoja1', fila: 2, columna: 'C', nombre_excel: 'ACEVEDO JOSE LUIS', confirmado_por_rh: true },
        { persona_id: 1, mes: 2, unidad_medica_id: 10, hoja: 'Hoja1', fila: 2, columna: 'D', nombre_excel: 'ACEVEDO JOSE LUIS', confirmado_por_rh: true },
      ],
    };

    // 1. Usuario sin RH GLOBAL -> 403
    {
      const res = createMockRes();
      await controller.importarHistorico2026({ rhAccess: rhCluesAccess, user: { sub: rhGlobalUserId }, body: validPayload }, res);
      assert.equal(res.statusCode, 403);
      passed++;
    }

    // 2. Huella incorrecta, identidad sin confirmación, marca X inexistente, duplicados internos -> 400
    {
      const resHash = createMockRes();
      await controller.importarHistorico2026({ rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, body: { ...validPayload, archivo_hash_esperado: 'deadbeef' } }, resHash);
      assert.equal(resHash.statusCode, 400);

      const resNoConfirm = createMockRes();
      await controller.importarHistorico2026({
        rhAccess: rhGlobalAccess,
        user: { sub: rhGlobalUserId },
        body: { ...validPayload, registros: [{ ...validPayload.registros[0], confirmado_por_rh: false }] },
      }, resNoConfirm);
      assert.equal(resNoConfirm.statusCode, 400);

      const resNoX = createMockRes();
      await controller.importarHistorico2026({
        rhAccess: rhGlobalAccess,
        user: { sub: rhGlobalUserId },
        body: { ...validPayload, registros: [{ ...validPayload.registros[0], mes: 3, columna: 'E' }] },
      }, resNoX);
      assert.equal(resNoX.statusCode, 400);

      const resDup = createMockRes();
      await controller.importarHistorico2026({
        rhAccess: rhGlobalAccess,
        user: { sub: rhGlobalUserId },
        body: { ...validPayload, registros: [validPayload.registros[0], validPayload.registros[0]] },
      }, resDup);
      assert.equal(resDup.statusCode, 400);
      passed++;
    }

    // 3. Persona inexistente -> 400 con ROLLBACK
    {
      const res = createMockRes();
      await controller.importarHistorico2026({
        rhAccess: rhGlobalAccess,
        user: { sub: rhGlobalUserId },
        body: { ...validPayload, registros: [{ ...validPayload.registros[0], persona_id: 999 }] },
      }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(dbRows.length, 0);
      passed++;
    }

    // 4. Fallo de auditoría -> 500 con ROLLBACK completo
    {
      failAuditNext = true;
      const res = createMockRes();
      await controller.importarHistorico2026({ rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, body: validPayload }, res);
      assert.equal(res.statusCode, 500);
      assert.equal(dbRows.length, 0);
      assert.equal(auditLogs.length, 0);
      passed++;
    }

    // 5. Importación válida -> 200, procedencia histórica sin fecha original, auditoría registrada
    {
      const res = createMockRes();
      await controller.importarHistorico2026({ rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, body: validPayload }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.idempotente, false);
      assert.equal(res.body.importados, 2);
      assert.equal(dbRows.length, 2);
      assert.equal(dbRows[0].fecha_recepcion, null);
      assert.equal(dbRows[0].recibido_por, null);
      assert.equal(dbRows[0].origen_registro, 'MIGRACION_HISTORICA_EXCEL');
      assert.equal(auditLogs.length, 1);
      passed++;
    }

    // 6. Reimportación exacta del mismo lote -> idempotente (sin duplicar registros ni auditoría)
    {
      const res = createMockRes();
      await controller.importarHistorico2026({ rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, body: validPayload }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.idempotente, true);
      assert.equal(res.body.importados, 0);
      assert.equal(res.body.ya_existentes, 2);
      assert.equal(auditLogs.length, 1);
      passed++;
    }

    // 7. Lote parcialmente existente -> 409 con ROLLBACK (no inserta parcialmente)
    {
      const partialPayload = {
        ...validPayload,
        registros: [
          validPayload.registros[0],
          { persona_id: 2, mes: 1, unidad_medica_id: 10, hoja: 'Hoja1', fila: 3, columna: 'C', nombre_excel: 'AGUILAR BETZAIDA', confirmado_por_rh: true },
        ],
      };
      const res = createMockRes();
      await controller.importarHistorico2026({ rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, body: partialPayload }, res);
      assert.equal(res.statusCode, 409);
      assert.equal(dbRows.length, 2); // sin inserción parcial
      passed++;
    }
  } finally {
    pool.connect = originalConnect;
  }

  console.log(`RH-ASIS-05B2 MIGRACION TESTS PASSED: ${passed}/7 suites`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
