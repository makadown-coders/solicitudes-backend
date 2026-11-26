const assert = require('node:assert/strict');
const RhAsistenciaController = require('../dist/controllers/rh-asistencia.controller').default;
const rhRouter = require('../dist/routes/rh').default;
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

async function run() {
  const controller = new RhAsistenciaController();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  const rhGlobalUserId = '11111111-1111-4111-8111-111111111111';
  const rhGlobalAccess = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };
  const rhCluesAccess = { scope: 'CLUES', clues: ['BCIMB00001'], grantedBy: 'RECURSOS_HUMANOS' };
  const adminTicAccess = { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' };

  // Synthetic dataset
  const personas = [
    { id: 1, nombre_completo: 'ACEVEDO JOSE LUIS', activo: true, fecha_ingreso: '2024-01-01', fecha_baja: null, unidad_medica_id: 10, unidad_nombre: 'OFICINA CENTRAL', adscripcion_id: 101, puesto: 'DEPARTAMENTO DE PERSONAL' },
    { id: 2, nombre_completo: 'AGUILAR BETZAIDA', activo: true, fecha_ingreso: '2024-12-16', fecha_baja: null, unidad_medica_id: 10, unidad_nombre: 'OFICINA CENTRAL', adscripcion_id: 102, puesto: 'SALUD REPRODUCTIVA' },
    { id: 3, nombre_completo: 'SIN FECHA INGRESO', activo: true, fecha_ingreso: null, fecha_baja: null, unidad_medica_id: 10, unidad_nombre: 'OFICINA CENTRAL', adscripcion_id: 103, puesto: 'OFICINA' },
    { id: 4, nombre_completo: 'SIN ADSCRIPCION FORMAL', activo: true, fecha_ingreso: '2024-03-01', fecha_baja: null, unidad_medica_id: 20, unidad_nombre: 'HOSPITAL GENERAL TIJUANA', adscripcion_id: null, puesto: null },
    { id: 5, nombre_completo: 'BAJA HISTORICA', activo: false, fecha_ingreso: '2024-01-01', fecha_baja: '2026-06-30', unidad_medica_id: 10, unidad_nombre: 'OFICINA CENTRAL', adscripcion_id: null, puesto: null },
  ];

  let controls = [];
  let nextControlId = 1;
  let auditLogs = [];
  let failAuditNext = false;
  let writeCountOnGet = 0;

  function buildSeguimientoRows(params) {
    const [anio, mes] = params;
    const qParam = params.find((p) => typeof p === 'string' && p.startsWith('%') && p.endsWith('%'));
    const qNorm = qParam ? qParam.slice(1, -1).toUpperCase() : null;
    const unidadParam = params.length >= 5 && typeof params[params.length - 1] === 'number' ? params[params.length - 1] : null;

    return personas
      .filter((p) => (!qNorm || p.nombre_completo.toUpperCase().includes(qNorm)))
      .filter((p) => (unidadParam === null || p.unidad_medica_id === unidadParam))
      .map((p) => {
        const ctrl = controls.find((c) => c.persona_id === p.id && c.anio === anio && c.mes === mes) || null;
        return {
          persona_id: p.id,
          nombre_completo: p.nombre_completo,
          activo_actual: p.activo,
          fecha_ingreso: p.fecha_ingreso,
          fecha_baja: p.fecha_baja,
          control_id: ctrl ? ctrl.id : null,
          control_unidad_id: ctrl ? ctrl.unidad_medica_id : null,
          control_unidad_nombre: ctrl ? p.unidad_nombre : null,
          control_adscripcion_id: ctrl ? ctrl.adscripcion_laboral_id : null,
          estado_control: ctrl ? ctrl.estado : null,
          fecha_recepcion: ctrl ? ctrl.fecha_recepcion : null,
          recibido_por: ctrl ? ctrl.recibido_por : null,
          excepcion_administrativa: ctrl ? ctrl.excepcion_administrativa : null,
          motivo_excepcion: ctrl ? ctrl.motivo_excepcion : null,
          observaciones: ctrl ? ctrl.observaciones : null,
          generado_docx_en: ctrl ? ctrl.generado_docx_en : null,
          generaciones_docx_count: ctrl ? ctrl.generaciones_docx_count : 0,
          entrega_declarada_en: ctrl ? ctrl.entrega_declarada_en : null,
          actualizado_en: ctrl ? ctrl.actualizado_en : null,
          adscripcion_ref_id: p.adscripcion_id,
          adscripcion_ref_unidad_id: p.adscripcion_id ? p.unidad_medica_id : null,
          adscripcion_ref_unidad_nombre: p.adscripcion_id ? p.unidad_nombre : null,
          adscripcion_ref_puesto: p.puesto,
          directorio_unidad_id: p.unidad_medica_id,
          directorio_unidad_nombre: p.unidad_nombre,
          cargo_directorio: p.puesto,
        };
      });
  }

  pool.query = async (sql, params = []) => {
    const normalized = String(sql).trim().toUpperCase();
    if (normalized.startsWith('INSERT') || normalized.startsWith('UPDATE') || normalized.startsWith('DELETE')) {
      writeCountOnGet++;
    }
    return { rows: buildSeguimientoRows(params) };
  };

  let txLockChain = Promise.resolve();

  pool.connect = async () => {
    let txControlsSnapshot = null;
    let txAuditSnapshot = null;
    let releaseLock = null;
    return {
      async query(sql, params = []) {
        const s = String(sql).trim();
        if (s === 'BEGIN') {
          txControlsSnapshot = JSON.parse(JSON.stringify(controls));
          txAuditSnapshot = JSON.parse(JSON.stringify(auditLogs));
          return { rows: [] };
        }
        if (s === 'COMMIT') {
          txControlsSnapshot = null;
          txAuditSnapshot = null;
          if (releaseLock) { releaseLock(); releaseLock = null; }
          return { rows: [] };
        }
        if (s === 'ROLLBACK') {
          if (txControlsSnapshot !== null) controls = txControlsSnapshot;
          if (txAuditSnapshot !== null) auditLogs = txAuditSnapshot;
          if (releaseLock) { releaseLock(); releaseLock = null; }
          return { rows: [] };
        }
        if (s.includes('pg_advisory_xact_lock')) {
          const prev = txLockChain;
          txLockChain = new Promise((resolve) => { releaseLock = resolve; });
          await prev;
          return { rows: [{ pg_advisory_xact_lock: '' }] };
        }
        if (s.includes('FROM public.persona WHERE id = $1')) {
          const p = personas.find((x) => x.id === params[0]);
          return { rows: p ? [{ id: p.id, unidad_medica_id: p.unidad_medica_id }] : [] };
        }
        if (s.includes('FROM public.rh_asistencia_entrega_mensual') && s.includes('FOR UPDATE')) {
          const found = controls.find(
            (c) => c.persona_id === params[0] && c.anio === params[1] && c.mes === params[2]
          );
          return { rows: found ? [{ ...found }] : [] };
        }
        if (s.startsWith('INSERT INTO public.rh_asistencia_entrega_mensual')) {
          const isRecepcion = s.includes("'RECIBIDA'");
          const row = isRecepcion
            ? {
                id: nextControlId++,
                persona_id: params[0],
                anio: params[1],
                mes: params[2],
                unidad_medica_id: params[3],
                adscripcion_laboral_id: params[4],
                estado: 'RECIBIDA',
                fecha_recepcion: params[5],
                recibido_por: params[6],
                observaciones: params[7],
                excepcion_administrativa: false,
                motivo_excepcion: null,
                generado_docx_en: null,
                generaciones_docx_count: 0,
                entrega_declarada_en: null,
                actualizado_en: new Date().toISOString(),
              }
            : {
                id: nextControlId++,
                persona_id: params[0],
                anio: params[1],
                mes: params[2],
                unidad_medica_id: params[3],
                adscripcion_laboral_id: params[4],
                estado: params[5],
                fecha_recepcion: null,
                recibido_por: null,
                observaciones: params[6],
                excepcion_administrativa: params[7],
                motivo_excepcion: params[8],
                generado_docx_en: null,
                generaciones_docx_count: 0,
                entrega_declarada_en: null,
                actualizado_en: new Date().toISOString(),
              };
          controls.push(row);
          return { rows: [{ ...row }] };
        }
        if (s.startsWith('UPDATE public.rh_asistencia_entrega_mensual')) {
          const idx = controls.findIndex((c) => c.id === params[0]);
          const isRecepcion = s.includes("estado = 'RECIBIDA'");
          if (isRecepcion) {
            controls[idx] = {
              ...controls[idx],
              unidad_medica_id: params[1],
              adscripcion_laboral_id: params[2],
              estado: 'RECIBIDA',
              fecha_recepcion: params[3],
              recibido_por: params[4],
              observaciones: params[5],
              excepcion_administrativa: false,
              motivo_excepcion: null,
              actualizado_en: new Date().toISOString(),
            };
          } else {
            controls[idx] = {
              ...controls[idx],
              unidad_medica_id: params[1],
              adscripcion_laboral_id: params[2],
              estado: params[3],
              fecha_recepcion: null,
              recibido_por: null,
              observaciones: params[4],
              excepcion_administrativa: params[5],
              motivo_excepcion: params[6],
              actualizado_en: new Date().toISOString(),
            };
          }
          return { rows: [{ ...controls[idx] }] };
        }
        if (s.startsWith('INSERT INTO public.app_audit_logs')) {
          if (failAuditNext) {
            failAuditNext = false;
            throw new Error('Simulated audit log failure');
          }
          auditLogs.push({
            user_id: params[0],
            action: params[1],
            resource: params[2],
            payload: JSON.parse(params[5]),
          });
          return { rows: [] };
        }
        return { rows: [] };
      },
      release() {},
    };
  };

  let passed = 0;
  try {
    // 1. Verificar rutas registradas en rhRouter
    const routePaths = rhRouter.stack.filter((l) => l.route).map((l) => l.route.path);
    assert.equal(routePaths.includes('/asistencia/seguimiento'), true);
    assert.equal(routePaths.includes('/asistencia/resumen'), true);
    assert.equal(routePaths.includes('/asistencia/personas/:personaId/periodos/:anio/:mes/recepcion'), true);
    assert.equal(routePaths.includes('/asistencia/personas/:personaId/periodos/:anio/:mes/estado'), true);
    passed++;

    // 2. Permisos: RH CLUES y ADMIN_TIC GLOBAL rechazados (403)
    {
      const resClues = createMockRes();
      await controller.seguimientoMensual({ rhAccess: rhCluesAccess, query: { anio: '2026', mes: '10' } }, resClues);
      assert.equal(resClues.statusCode, 403);
      assert.equal(resClues.headers['cache-control'], 'no-store');

      const resTic = createMockRes();
      await controller.confirmarRecepcion(
        { rhAccess: adminTicAccess, user: { sub: rhGlobalUserId }, params: { personaId: '1', anio: '2026', mes: '10' }, body: {} },
        resTic
      );
      assert.equal(resTic.statusCode, 403);
      passed++;
    }

    // 3. GET mes sin registros + sin fecha ingreso + sin adscripción + baja histórica + sin escrituras
    {
      writeCountOnGet = 0;
      const res = createMockRes();
      await controller.seguimientoMensual({ rhAccess: rhGlobalAccess, query: { anio: '2026', mes: '10' } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(writeCountOnGet, 0);
      assert.equal(res.body.total, 5);
      assert.equal(res.body.resumen.recepciones_confirmadas, 0);
      assert.equal(res.body.resumen.sin_registro_control, 2);
      assert.equal(res.body.resumen.elegibilidad_incierta, 3);
      const p3 = res.body.items.find((i) => i.persona_id === 3);
      const p4 = res.body.items.find((i) => i.persona_id === 4);
      const p5 = res.body.items.find((i) => i.persona_id === 5);
      assert.equal(p3.situacion_seguimiento, 'ELEGIBILIDAD_INCIERTA');
      assert.match(p3.motivo_incertidumbre, /SIN_FECHA_INGRESO/);
      assert.equal(p4.situacion_seguimiento, 'ELEGIBILIDAD_INCIERTA');
      assert.match(p4.motivo_incertidumbre, /SIN_ADSCRIPCION_FORMAL/);
      assert.equal(p5.situacion_seguimiento, 'ELEGIBILIDAD_INCIERTA');
      assert.match(p5.motivo_incertidumbre, /BAJA_PREVIA_REFERENCIA/);
      passed++;
    }

    // 4. Filtrado por unidad, búsqueda por nombre y paginación real
    {
      const resUnidad = createMockRes();
      await controller.seguimientoMensual({ rhAccess: rhGlobalAccess, query: { anio: '2026', mes: '10', unidadId: '20' } }, resUnidad);
      assert.equal(resUnidad.statusCode, 200);
      assert.equal(resUnidad.body.total, 1);
      assert.equal(resUnidad.body.items[0].persona_id, 4);

      const resSearch = createMockRes();
      await controller.seguimientoMensual({ rhAccess: rhGlobalAccess, query: { anio: '2026', mes: '10', q: 'ACEVEDO' } }, resSearch);
      assert.equal(resSearch.statusCode, 200);
      assert.equal(resSearch.body.total, 1);

      const resPage = createMockRes();
      await controller.seguimientoMensual({ rhAccess: rhGlobalAccess, query: { anio: '2026', mes: '10', page: '2', pageSize: '2' } }, resPage);
      assert.equal(resPage.statusCode, 200);
      assert.equal(resPage.body.total, 5);
      assert.equal(resPage.body.items.length, 2);
      assert.equal(resPage.body.page, 2);
      passed++;
    }

    // 5. Confirmar recepción + auditoría + confirmación repetida idempotente
    {
      const res1 = createMockRes();
      await controller.confirmarRecepcion(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '1', anio: '2026', mes: '10' }, body: { observaciones: 'Recibida firmada' } },
        res1
      );
      assert.equal(res1.statusCode, 200);
      assert.equal(res1.body.registro.estado, 'RECIBIDA');
      assert.equal(res1.body.idempotente, false);
      assert.equal(res1.body.evento_auditoria, 'RH_ASISTENCIA_RECEPCION_CONFIRMADA');
      assert.equal(auditLogs.length, 1);
      assert.equal('rfc' in auditLogs[0].payload, false);
      assert.equal('curp' in auditLogs[0].payload, false);

      // Repetida (idempotente, sin auditoría duplicada)
      const res2 = createMockRes();
      await controller.confirmarRecepcion(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '1', anio: '2026', mes: '10' }, body: {} },
        res2
      );
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.body.idempotente, true);
      assert.equal(auditLogs.length, 1);
      passed++;
    }

    // 6. Recepción concurrente (dos llamadas simultáneas sobre el mismo persona/periodo)
    {
      const [rA, rB] = await Promise.all([
        (async () => {
          const r = createMockRes();
          await controller.confirmarRecepcion(
            { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '2', anio: '2026', mes: '10' }, body: {} },
            r
          );
          return r;
        })(),
        (async () => {
          const r = createMockRes();
          await controller.confirmarRecepcion(
            { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '2', anio: '2026', mes: '10' }, body: {} },
            r
          );
          return r;
        })(),
      ]);
      assert.equal(rA.statusCode, 200);
      assert.equal(rB.statusCode, 200);
      assert.equal(controls.filter((c) => c.persona_id === 2 && c.anio === 2026 && c.mes === 10).length, 1);
      passed++;
    }

    // 7. OBSERVADA requiere observaciones obligatorias; NO_APLICA requiere motivo válido
    {
      const resObsBad = createMockRes();
      await controller.actualizarEstado(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '3', anio: '2026', mes: '10' }, body: { estado: 'OBSERVADA' } },
        resObsBad
      );
      assert.equal(resObsBad.statusCode, 400);

      const resObsOk = createMockRes();
      await controller.actualizarEstado(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '3', anio: '2026', mes: '10' }, body: { estado: 'OBSERVADA', observaciones: 'Falta firma de jefe inmediato' } },
        resObsOk
      );
      assert.equal(resObsOk.statusCode, 200);
      assert.equal(resObsOk.body.registro.estado, 'OBSERVADA');
      assert.equal(resObsOk.body.evento_auditoria, 'RH_ASISTENCIA_OBSERVADA');

      const resNoAplicaOk = createMockRes();
      await controller.actualizarEstado(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '5', anio: '2026', mes: '10' }, body: { estado: 'NO_APLICA', motivo_excepcion: 'BAJA_PREVIA', observaciones: 'Baja en junio 2026' } },
        resNoAplicaOk
      );
      assert.equal(resNoAplicaOk.statusCode, 200);
      assert.equal(resNoAplicaOk.body.registro.estado, 'NO_APLICA');
      assert.equal(resNoAplicaOk.body.registro.excepcion_administrativa, true);
      assert.equal(resNoAplicaOk.body.evento_auditoria, 'RH_ASISTENCIA_EXCEPCION_REGISTRADA');
      passed++;
    }

    // 8. Reversión de recepción exige motivo_administrativo y limpia fecha_recepcion/recibido_por
    {
      const resRevBad = createMockRes();
      await controller.actualizarEstado(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '1', anio: '2026', mes: '10' }, body: { estado: 'PENDIENTE' } },
        resRevBad
      );
      assert.equal(resRevBad.statusCode, 400);

      const resRevOk = createMockRes();
      await controller.actualizarEstado(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '1', anio: '2026', mes: '10' }, body: { estado: 'PENDIENTE', motivo_administrativo: 'Captura en mes equivocado' } },
        resRevOk
      );
      assert.equal(resRevOk.statusCode, 200);
      assert.equal(resRevOk.body.registro.estado, 'PENDIENTE');
      assert.equal(resRevOk.body.registro.fecha_recepcion, null);
      assert.equal(resRevOk.body.registro.recibido_por, null);
      assert.equal(resRevOk.body.evento_auditoria, 'RH_ASISTENCIA_RECEPCION_CORREGIDA');
      passed++;
    }

    // 9. ROLLBACK ante error de auditoría
    {
      failAuditNext = true;
      const beforeCount = controls.length;
      const resFail = createMockRes();
      await controller.confirmarRecepcion(
        { rhAccess: rhGlobalAccess, user: { sub: rhGlobalUserId }, params: { personaId: '4', anio: '2026', mes: '10' }, body: {} },
        resFail
      );
      assert.equal(resFail.statusCode, 500);
      assert.equal(controls.length, beforeCount);
      passed++;
    }
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }

  console.log(`RH-ASIS-03 TESTS PASSED: ${passed}/9 suites (all 22 scenarios covered)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
