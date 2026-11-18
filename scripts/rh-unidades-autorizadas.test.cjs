const assert = require('node:assert/strict');
const { resolveRhAccess, requireRhAccess } = require('../dist/auth/requireRhAccess');
const RhService = require('../dist/services/rh.service').default;
const RhController = require('../dist/controllers/rh.controller').default;
const rhRouter = require('../dist/routes/rh').default;
const { pool } = require('../dist/db/pool');
const { requireAuth } = require('../dist/auth/requireAuth');

function createMockRes() {
  const res = {
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
  return res;
}

async function run() {
  let passed = 0;

  // =========================================================================
  // SUITE BASE RH-API.1 (Unidades autorizadas y resolución de alcance)
  // =========================================================================

  // 1. 401 sin autenticación (requireAuth sin Authorization header)
  {
    const req = { headers: {}, get: () => undefined };
    const res = createMockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    passed++;
  }

  // 2. 403 sin rol autorizado
  {
    const req = { user: { roles: [] } };
    const res = createMockRes();
    let nextCalled = false;
    requireRhAccess()(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    passed++;
  }

  // 3. RH GLOBAL
  {
    const access = resolveRhAccess([{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }]);
    assert.deepEqual(access, { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' });
    passed++;
  }

  // 4. RH CLUES
  {
    const access = resolveRhAccess([{ code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'bcimb00001' }]);
    assert.deepEqual(access, { scope: 'CLUES', clues: ['BCIMB00001'], grantedBy: 'RECURSOS_HUMANOS' });
    passed++;
  }

  // 5. RH con varias CLUES
  {
    const access = resolveRhAccess([
      { code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB00002' },
      { code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB00001' },
      { code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'bcimb00001' },
    ]);
    assert.deepEqual(access, {
      scope: 'CLUES',
      clues: ['BCIMB00001', 'BCIMB00002'],
      grantedBy: 'RECURSOS_HUMANOS',
    });
    passed++;
  }

  // 6. RH GLOBAL combinado con CLUES (GLOBAL prevalece)
  {
    const access = resolveRhAccess([
      { code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB00001' },
      { code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null },
    ]);
    assert.deepEqual(access, { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' });
    passed++;
  }

  // 7. ADMIN_TIC GLOBAL
  {
    const access = resolveRhAccess([{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }]);
    assert.deepEqual(access, { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' });
    passed++;
  }

  // 8. ADMIN_TIC CLUES sin privilegios
  {
    const access = resolveRhAccess([{ code: 'ADMIN_TIC', scope: 'CLUES', id: 'BCIMB00001' }]);
    assert.equal(access, null);
    passed++;
  }

  // 9. Wishlist GLOBAL sin acceso RH
  {
    const access = resolveRhAccess([{ code: 'WISHLIST', scope: 'GLOBAL', id: null }]);
    assert.equal(access, null);
    passed++;
  }

  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);
  const service = new RhService();
  const controller = new RhController();

  try {
    // 10. CLUES inexistente -> devuelve []
    pool.query = async () => ({ rows: [] });
    {
      const out = await service.getUnidadesAutorizadas({
        scope: 'CLUES',
        clues: ['NO_EXISTE'],
        grantedBy: 'RECURSOS_HUMANOS',
      });
      assert.deepEqual(out, { scope: 'CLUES', unidades: [] });
      passed++;
    }

    // 11. CLUES ambigua -> SQL filtra coincidencias = 1, mock devuelve []
    pool.query = async (sql, params) => {
      assert.match(sql, /coincidencias\s*=\s*1/i);
      assert.deepEqual(params, [['AMBIGUA01']]);
      return { rows: [] };
    };
    {
      const out = await service.getUnidadesAutorizadas({
        scope: 'CLUES',
        clues: ['AMBIGUA01'],
        grantedBy: 'RECURSOS_HUMANOS',
      });
      assert.deepEqual(out, { scope: 'CLUES', unidades: [] });
      passed++;
    }

    // 12. OFICINA CENTRAL con N/A -> no consulta BD y devuelve []
    let queryCalled = false;
    pool.query = async () => {
      queryCalled = true;
      return { rows: [] };
    };
    {
      const out = await service.getUnidadesAutorizadas({
        scope: 'CLUES',
        clues: ['N/A'],
        grantedBy: 'RECURSOS_HUMANOS',
      });
      assert.equal(queryCalled, false);
      assert.deepEqual(out, { scope: 'CLUES', unidades: [] });
      passed++;
    }

    // 13. Unidad inactiva -> SQL exige activo = TRUE
    pool.query = async (sql) => {
      assert.match(sql, /activo\s*=\s*TRUE/i);
      return { rows: [] };
    };
    {
      const out = await service.getUnidadesAutorizadas({
        scope: 'GLOBAL',
        clues: [],
        grantedBy: 'RECURSOS_HUMANOS',
      });
      assert.deepEqual(out, { scope: 'GLOBAL', unidades: [] });
      passed++;
    }

    // 14. Respuesta sin unidades duplicadas (SQL usa SELECT DISTINCT)
    pool.query = async (sql) => {
      assert.match(sql, /SELECT\s+DISTINCT/i);
      return {
        rows: [
          { id: 10, nombre: 'HOSPITAL A', cluesimb: 'BCIMB00001' },
          { id: 20, nombre: 'HOSPITAL B', cluesimb: 'BCIMB00002' },
        ],
      };
    };
    {
      const out = await service.getUnidadesAutorizadas({
        scope: 'CLUES',
        clues: ['BCIMB00001', 'BCIMB00002'],
      });
      assert.equal(out.unidades.length, 2);
      assert.deepEqual(out.unidades[0], { id: 10, nombre: 'HOSPITAL A', cluesimb: 'BCIMB00001' });
      passed++;
    }

    // 15. Manejo de errores de base de datos en controlador -> HTTP 500
    pool.query = async () => {
      throw new Error('DB connection lost');
    };
    {
      const req = { rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' } };
      const res = createMockRes();
      await controller.unidadesAutorizadas(req, res);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error interno al consultar unidades autorizadas de RH' });
      passed++;
    }

    // =========================================================================
    // SUITE RH-2B.1 (Padrón laboral y personas candidatas por unidad)
    // =========================================================================

    // Estado simulado en memoria para pruebas 16-30 (cero escrituras o lecturas reales en PostgreSQL)
    const MOCK_UNIDADES = new Map([
      [10, { id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001', activo: true }],
      [20, { id: 20, nombre: 'HOSPITAL GENERAL TIJUANA', cluesimb: 'BCIMB000010', activo: true }],
      [30, { id: 30, nombre: 'CLINICA ENSENADA', cluesimb: 'BCIMB000020', activo: true }],
      [177, { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A', activo: true }],
      [99, { id: 99, nombre: 'UNIDAD INACTIVA', cluesimb: 'BCIMB000099', activo: false }],
    ]);

    const MOCK_PERSONAS = [
      { id: 101, nombre_completo: 'Dra. Ana Gómez', nombres: 'Ana', apellidos: 'Gómez', cargo: 'Médico Especialista', unidad_medica_id: 10, activo: true, rfc: 'GOMA800101ABC', curp: 'GOMA800101MDFR0001', correo_principal: 'ana@imssb.gob.mx' },
      { id: 102, nombre_completo: 'Enf. Luis Pérez', nombres: null, apellidos: null, cargo: 'Enfermero General', unidad_medica_id: 10, activo: true, rfc: null, curp: null, correo_principal: 'luis@imssb.gob.mx' },
      { id: 103, nombre_completo: 'Lic. Sofía Ramírez', nombres: 'Sofía', apellidos: 'Ramírez', cargo: 'Analista RH', unidad_medica_id: 10, activo: true, rfc: 'RAMS900303XXX', curp: 'RAMS900303MDFR03', correo_principal: 'sofia@imssb.gob.mx' },
      { id: 104, nombre_completo: 'Dr. Carlos Ruiz', nombres: 'Carlos', apellidos: 'Ruiz', cargo: 'Urgenciólogo', unidad_medica_id: 20, activo: true, rfc: 'RUIC790404ZZ9', curp: 'RUIC790404HDFR0004', correo_principal: 'carlos@imssb.gob.mx' },
      { id: 105, nombre_completo: 'Persona Inactiva', nombres: 'Persona', apellidos: 'Inactiva', cargo: 'Baja', unidad_medica_id: 10, activo: false, rfc: 'INAC000000XXX', curp: 'INAC000000HDFR00', correo_principal: null },
    ];

    const MOCK_ADSCRIPCIONES = [
      {
        id: 5001,
        persona_id: 101,
        unidad_medica_id: 10,
        matricula: 'MAT-1001',
        puesto: 'Médico Especialista A',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '07:00 - 15:00',
        vigente_desde: new Date('2026-01-01T00:00:00.000Z'),
        vigente_hasta: null,
        activo: true,
        observaciones: 'Base federalizada',
      },
      {
        id: 5002,
        persona_id: 102,
        unidad_medica_id: 10,
        matricula: 'MAT-1002',
        puesto: 'Enfermero General',
        turno: 'VESPERTINO',
        jornada: '8 HORAS',
        horario: '14:00 - 21:30',
        vigente_desde: '2026-02-01',
        vigente_hasta: '2026-12-31',
        activo: true,
        observaciones: null,
      },
      {
        id: 5003,
        persona_id: 104,
        unidad_medica_id: 20,
        matricula: 'MAT-2004',
        puesto: 'Urgenciólogo',
        turno: 'NOCTURNO',
        jornada: 'ACUMULADA',
        horario: '20:00 - 08:00',
        vigente_desde: '2026-01-15',
        vigente_hasta: null,
        activo: true,
        observaciones: 'Guardia nocturna',
      },
    ];

    let capturedQueries = [];

    pool.query = async (sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      capturedQueries.push({ sql: normalized, params });

      // Prohibir estrictamente cualquier sentencia de escritura
      assert.equal(
        /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(normalized),
        false,
        `Sentencia de escritura no permitida en RH-2B.1: ${normalized}`
      );

      // 1) Consulta de unidad individual para alcance GLOBAL
      if (/^SELECT id, nombre, cluesimb FROM public\.unidad_medica WHERE id = \$1 AND activo = TRUE$/i.test(normalized)) {
        const u = MOCK_UNIDADES.get(Number(params[0]));
        if (!u || !u.activo) return { rows: [], rowCount: 0 };
        return { rows: [{ id: u.id, nombre: u.nombre, cluesimb: u.cluesimb }], rowCount: 1 };
      }

      // 2) Consulta de unidades para alcance CLUES (WITH candidatas AS ...)
      if (/WITH candidatas AS/i.test(normalized)) {
        const requestedClues = (params[0] || []).map((c) => String(c).toUpperCase());
        const matched = Array.from(MOCK_UNIDADES.values()).filter(
          (u) => u.activo && u.cluesimb && u.cluesimb !== 'N/A' && requestedClues.includes(u.cluesimb.toUpperCase())
        );
        return {
          rows: matched.map((u) => ({ id: u.id, nombre: u.nombre, cluesimb: u.cluesimb })),
          rowCount: matched.length,
        };
      }

      // 3a) Consulta de ficha individual del trabajador (WHERE al.unidad_medica_id = $1 AND al.id = $2 LIMIT 1)
      if (/FROM public\.rh_adscripcion_laboral al JOIN public\.persona p ON p\.id = al\.persona_id WHERE al\.unidad_medica_id = \$1 AND al\.id = \$2 LIMIT 1/i.test(normalized)) {
        const unidadId = Number(params[0]);
        const adscripcionId = Number(params[1]);
        const foundAl = MOCK_ADSCRIPCIONES.find(
          (al) => al.unidad_medica_id === unidadId && al.id === adscripcionId
        );
        if (!foundAl) {
          return { rows: [], rowCount: 0 };
        }
        const foundPersona = MOCK_PERSONAS.find((per) => per.id === foundAl.persona_id);
        if (!foundPersona) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              adscripcion_laboral_id: foundAl.id,
              unidad_medica_id: foundAl.unidad_medica_id,
              matricula: foundAl.matricula,
              puesto: foundAl.puesto,
              turno: foundAl.turno,
              jornada: foundAl.jornada,
              horario: foundAl.horario,
              vigente_desde: foundAl.vigente_desde,
              vigente_hasta: foundAl.vigente_hasta,
              adscripcion_activo: foundAl.activo,
              observaciones: foundAl.observaciones ?? null,
              persona_id: foundPersona.id,
              nombre_completo: foundPersona.nombre_completo,
              nombres: foundPersona.nombres ?? null,
              apellidos: foundPersona.apellidos ?? null,
              rfc: foundPersona.rfc,
              curp: foundPersona.curp,
              persona_activo: foundPersona.activo,
            },
          ],
          rowCount: 1,
        };
      }

      // 3) Consulta del padrón laboral (FROM public.rh_adscripcion_laboral al JOIN public.persona p)
      if (/FROM public\.rh_adscripcion_laboral al JOIN public\.persona p ON p\.id = al\.persona_id/i.test(normalized)) {
        const unidadId = Number(params[0]);
        const hasSearch = params.length === 4;
        const qVal = hasSearch ? String(params[1]).toLowerCase() : null;
        const limit = Number(params[params.length - 2]);
        const offset = Number(params[params.length - 1]);

        let joined = MOCK_ADSCRIPCIONES
          .filter((al) => al.unidad_medica_id === unidadId)
          .map((al) => {
            const p = MOCK_PERSONAS.find((per) => per.id === al.persona_id);
            return {
              persona_id: p.id,
              nombre_completo: p.nombre_completo,
              adscripcion_laboral_id: al.id,
              unidad_medica_id: al.unidad_medica_id,
              matricula: al.matricula,
              puesto: al.puesto,
              turno: al.turno,
              jornada: al.jornada,
              horario: al.horario,
              vigente_desde: al.vigente_desde,
              vigente_hasta: al.vigente_hasta,
              activo: al.activo,
            };
          });

        if (qVal) {
          joined = joined.filter(
            (row) =>
              row.nombre_completo.toLowerCase().includes(qVal) ||
              (row.matricula && row.matricula.toLowerCase().includes(qVal))
          );
        }

        const total = joined.length;
        const paged = joined.slice(offset, offset + limit).map((r) => ({ ...r, total: String(total) }));
        return { rows: paged, rowCount: paged.length };
      }

      // 4) Consulta de personas candidatas (FROM public.persona p LEFT JOIN public.unidad_medica um)
      if (/FROM public\.persona p LEFT JOIN public\.unidad_medica um/i.test(normalized)) {
        const unidadId = Number(params[0]);
        const filtersByUnidadDirectorio = /WHERE p\.activo = TRUE AND p\.unidad_medica_id = \$1\b/i.test(normalized);
        const hasSearch = params.length === 4;
        const qVal = hasSearch ? String(params[1]).toLowerCase() : null;
        const limit = Number(params[params.length - 2]);
        const offset = Number(params[params.length - 1]);

        let activePersonas = MOCK_PERSONAS.filter((p) => p.activo);
        if (filtersByUnidadDirectorio) {
          activePersonas = activePersonas.filter((p) => p.unidad_medica_id === unidadId);
        }
        if (qVal) {
          activePersonas = activePersonas.filter((p) => {
            const nameMatch = p.nombre_completo.toLowerCase().includes(qVal);
            const cargoMatch = (p.cargo || '').toLowerCase().includes(qVal);
            const matMatch = MOCK_ADSCRIPCIONES.some(
              (al) => al.persona_id === p.id && (al.matricula || '').toLowerCase().includes(qVal)
            );
            return nameMatch || cargoMatch || matMatch;
          });
        }

        // Ordenar priorizando p.unidad_medica_id === unidadId
        activePersonas.sort((a, b) => {
          const prioA = a.unidad_medica_id === unidadId ? 0 : 1;
          const prioB = b.unidad_medica_id === unidadId ? 0 : 1;
          if (prioA !== prioB) return prioA - prioB;
          return a.nombre_completo.localeCompare(b.nombre_completo);
        });

        const total = activePersonas.length;
        const paged = activePersonas.slice(offset, offset + limit).map((p) => {
          const um = MOCK_UNIDADES.get(p.unidad_medica_id);
          const tieneEnUnidad = MOCK_ADSCRIPCIONES.some(
            (al) => al.persona_id === p.id && al.unidad_medica_id === unidadId
          );
          const tieneActivaOtra = MOCK_ADSCRIPCIONES.some(
            (al) => al.persona_id === p.id && al.unidad_medica_id !== unidadId && al.activo
          );
          return {
            persona_id: p.id,
            nombre_completo: p.nombre_completo,
            cargo_directorio: p.cargo,
            unidad_medica_id_directorio: p.unidad_medica_id,
            unidad_medica_directorio: um ? um.nombre : null,
            coincide_unidad_directorio: p.unidad_medica_id === unidadId,
            tiene_adscripcion_rh_en_unidad: tieneEnUnidad,
            tiene_adscripcion_rh_activa_en_otra_unidad: tieneActivaOtra,
            total: String(total),
          };
        });

        return { rows: paged, rowCount: paged.length };
      }

      throw new Error(`Consulta SQL no esperada en mock RH-2B.1: ${normalized}`);
    };

    // 16 (Requisito 4 y 5): Verificar que las nuevas rutas existen en rhRouter con requireAuth + requireRhAccess
    {
      for (const routePath of ['/unidades/:unidadId/personal', '/unidades/:unidadId/personas-candidatas']) {
        const layer = rhRouter.stack.find((l) => l.route && l.route.path === routePath && l.route.methods.get);
        assert.ok(layer, `Debe existir GET ${routePath} en rhRouter`);
        assert.equal(layer.route.stack.length, 3, `GET ${routePath} debe tener requireAuth, requireRhAccess y controlador`);
        assert.equal(layer.route.stack[0].name, 'requireAuth');
      }
      passed++;
    }

    // 17 (Requisitos 1, 3 y 10): Acceso con RECURSOS_HUMANOS GLOBAL y ADMIN_TIC GLOBAL devuelve padrón paginado con campos exactos y sin secretos
    {
      for (const grantedBy of ['RECURSOS_HUMANOS', 'ADMIN_TIC']) {
        capturedQueries = [];
        const req = {
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy },
          params: { unidadId: '10' },
          query: { page: '1', pageSize: '1' },
        };
        const res = createMockRes();
        await controller.personalPorUnidad(req, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.unidad, {
          id: 10,
          nombre: 'HOSPITAL GENERAL MEXICALI',
          cluesimb: 'BCIMB000001',
        });
        assert.equal(res.body.page, 1);
        assert.equal(res.body.pageSize, 1);
        assert.equal(res.body.total, 2);
        assert.equal(res.body.items.length, 1);
        assert.deepEqual(res.body.items[0], {
          persona_id: 101,
          nombre_completo: 'Dra. Ana Gómez',
          adscripcion_laboral_id: 5001,
          unidad_medica_id: 10,
          matricula: 'MAT-1001',
          puesto: 'Médico Especialista A',
          turno: 'MATUTINO',
          jornada: '8 HORAS',
          horario: '07:00 - 15:00',
          vigente_desde: '2026-01-01',
          vigente_hasta: null,
          activo: true,
        });

        // Verificar que no expone RFC, CURP ni correos
        const rawJson = JSON.stringify(res.body);
        assert.equal(rawJson.includes('GOMA800101'), false);
        assert.equal(rawJson.includes('ana@imssb.gob.mx'), false);
      }
      passed++;
    }

    // 18 (Requisitos 2 y 6): Acceso con RECURSOS_HUMANOS CLUES autorizado (200) y rechazo de unidad ajena al alcance CLUES (403 sin consultar datos personales)
    {
      // Unidad 10 autorizada para BCIMB000001 -> 200
      capturedQueries = [];
      const reqAllowed = {
        rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10' },
        query: {},
      };
      const resAllowed = createMockRes();
      await controller.personalPorUnidad(reqAllowed, resAllowed);
      assert.equal(resAllowed.statusCode, 200);
      assert.equal(resAllowed.body.items.length, 2);

      // Unidad 20 (BCIMB000010) o 177 (OFICINA CENTRAL) ajenas al alcance CLUES ['BCIMB000001'] -> 403 en ambos endpoints
      for (const forbiddenUnitId of ['20', '177', '999']) {
        capturedQueries = [];
        const reqDeniedPersonal = {
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: forbiddenUnitId },
          query: {},
        };
        const resDeniedPersonal = createMockRes();
        await controller.personalPorUnidad(reqDeniedPersonal, resDeniedPersonal);
        assert.equal(resDeniedPersonal.statusCode, 403);
        assert.equal(
          capturedQueries.some((q) => /FROM public\.persona|FROM public\.rh_adscripcion_laboral/i.test(q.sql)),
          false,
          'No debe ejecutar consultas sobre persona ni rh_adscripcion_laboral cuando la unidad no está autorizada'
        );

        capturedQueries = [];
        const resDeniedCandidatas = createMockRes();
        await controller.personasCandidatasPorUnidad(reqDeniedPersonal, resDeniedCandidatas);
        assert.equal(resDeniedCandidatas.statusCode, 403);
        assert.equal(
          capturedQueries.some((q) => /FROM public\.persona|FROM public\.rh_adscripcion_laboral/i.test(q.sql)),
          false
        );
      }
      passed++;
    }

    // 19 (Requisitos 7 y 8): Unidad inexistente (404) y unidad inactiva (404) para alcance GLOBAL
    {
      for (const invalidOrInactiveId of ['9999', '99']) {
        capturedQueries = [];
        const req = {
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: invalidOrInactiveId },
          query: {},
        };
        const resPersonal = createMockRes();
        await controller.personalPorUnidad(req, resPersonal);
        assert.equal(resPersonal.statusCode, 404);
        assert.equal(
          capturedQueries.some((q) => /FROM public\.persona|FROM public\.rh_adscripcion_laboral/i.test(q.sql)),
          false
        );

        const resCandidatas = createMockRes();
        await controller.personasCandidatasPorUnidad(req, resCandidatas);
        assert.equal(resCandidatas.statusCode, 404);
      }
      passed++;
    }

    // 20 (Requisito 9): Consulta vacía de adscripciones (OFICINA CENTRAL id = 177 sin filas en rh_adscripcion_laboral) devuelve []
    {
      const reqEmpty = {
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '177' },
        query: {},
      };
      const resEmpty = createMockRes();
      await controller.personalPorUnidad(reqEmpty, resEmpty);
      assert.equal(resEmpty.statusCode, 200);
      assert.deepEqual(resEmpty.body, {
        unidad: { id: 177, nombre: 'OFICINA CENTRAL', cluesimb: 'N/A' },
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });
      passed++;
    }

    // 21 (Requisitos 11 y 12): Búsqueda por nombre y búsqueda por matrícula en padrón laboral
    {
      // Búsqueda por nombre ("luis")
      const reqByName = {
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10' },
        query: { q: '  luis  ' },
      };
      const resByName = createMockRes();
      await controller.personalPorUnidad(reqByName, resByName);
      assert.equal(resByName.statusCode, 200);
      assert.equal(resByName.body.items.length, 1);
      assert.equal(resByName.body.items[0].persona_id, 102);

      // Búsqueda por matrícula ("MAT-1001")
      const reqByMat = {
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10' },
        query: { q: 'mat-1001' },
      };
      const resByMat = createMockRes();
      await controller.personalPorUnidad(reqByMat, resByMat);
      assert.equal(resByMat.statusCode, 200);
      assert.equal(resByMat.body.items.length, 1);
      assert.equal(resByMat.body.items[0].adscripcion_laboral_id, 5001);
      passed++;
    }

    // 22 (Requisitos 13 y 14 + RH-2B.4A.1): Consulta de personas candidatas con separación entre alcance GLOBAL y contención estricta CLUES
    {
      // A) Operador GLOBAL (RECURSOS_HUMANOS GLOBAL) conserva búsqueda institucional de todas las personas activas (4 activas: 101, 102, 103 de unidad 10 + 104 de unidad 20; excluye 105 inactiva)
      const reqCandidatasGlobal = {
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10' },
        query: {},
      };
      const resCandidatasGlobal = createMockRes();
      await controller.personasCandidatasPorUnidad(reqCandidatasGlobal, resCandidatasGlobal);

      assert.equal(resCandidatasGlobal.statusCode, 200);
      assert.equal(resCandidatasGlobal.body.total, 4);

      const globalItems = resCandidatasGlobal.body.items;
      assert.equal(globalItems[0].coincide_unidad_directorio, true);
      assert.equal(globalItems[1].coincide_unidad_directorio, true);
      assert.equal(globalItems[2].coincide_unidad_directorio, true);
      assert.equal(globalItems[3].coincide_unidad_directorio, false);

      const carlosGlobal = globalItems.find((i) => i.persona_id === 104);
      assert.ok(carlosGlobal, 'RH GLOBAL sí debe visualizar personas activas de otras unidades para resolver vinculaciones');
      assert.equal(carlosGlobal.coincide_unidad_directorio, false);
      assert.equal(carlosGlobal.tiene_adscripcion_rh_en_unidad, false);
      assert.equal(carlosGlobal.tiene_adscripcion_rh_activa_en_otra_unidad, true);
      assert.equal(carlosGlobal.requiere_validacion_previa, true);
      assert.equal(carlosGlobal.situacion_rh, 'REQUIERE_VALIDACION_OTRA_ADSCRIPCION');
      assert.equal(carlosGlobal.unidad_medica_id_directorio, 20);
      assert.equal(carlosGlobal.unidad_medica_directorio, 'HOSPITAL GENERAL TIJUANA');

      // B) Operador CLUES (RECURSOS_HUMANOS CLUES) recibe EXCLUSIVAMENTE personas activas con persona.unidad_medica_id = unidadId (101, 102 y 103; NO recibe 104 de unidad 20 ni 105 inactiva)
      const reqCandidatasClues = {
        rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10' },
        query: {},
      };
      const resCandidatasClues = createMockRes();
      await controller.personasCandidatasPorUnidad(reqCandidatasClues, resCandidatasClues);

      assert.equal(resCandidatasClues.statusCode, 200);
      assert.equal(resCandidatasClues.body.total, 3);
      const cluesItems = resCandidatasClues.body.items;
      assert.equal(cluesItems.length, 3);
      assert.equal(
        cluesItems.every((i) => i.coincide_unidad_directorio === true && i.unidad_medica_id_directorio === 10),
        true,
        'RH CLUES solo debe recibir personas asociadas en el directorio a la unidad autorizada consultada'
      );
      assert.equal(
        cluesItems.some((i) => i.persona_id === 104 || i.persona_id === 105),
        false,
        'RH CLUES no debe recibir personas de otras unidades (104) ni inactivas (105)'
      );

      const sofia = cluesItems.find((i) => i.persona_id === 103);
      assert.deepEqual(sofia, {
        persona_id: 103,
        nombre_completo: 'Lic. Sofía Ramírez',
        cargo_directorio: 'Analista RH',
        unidad_medica_id_directorio: 10,
        unidad_medica_directorio: 'HOSPITAL GENERAL MEXICALI',
        coincide_unidad_directorio: true,
        tiene_adscripcion_rh_en_unidad: false,
        tiene_adscripcion_rh_activa_en_otra_unidad: false,
        requiere_validacion_previa: false,
        situacion_rh: 'DISPONIBLE_DIRECTORIO',
      });

      const ana = cluesItems.find((i) => i.persona_id === 101);
      assert.equal(ana.tiene_adscripcion_rh_en_unidad, true);
      assert.equal(ana.situacion_rh, 'YA_ADSCRITA_EN_UNIDAD');

      // Verificar que no expone RFC, CURP ni correos en ningún alcance
      const rawCluesJson = JSON.stringify(resCandidatasClues.body);
      assert.equal(rawCluesJson.includes('GOMA800101'), false);
      assert.equal(rawCluesJson.includes('RAMS900303'), false);
      assert.equal(rawCluesJson.includes('RUIC820404'), false);
      assert.equal(rawCluesJson.includes('ana@imssb.gob.mx'), false);
      assert.equal(rawCluesJson.includes('carlos@imssb.gob.mx'), false);

      // C) RH CLUES no obtiene resultados de otras unidades al buscar por nombre ("Carlos") ni por matrícula ("MAT-2004")
      for (const foreignQuery of ['carlos', 'MAT-2004']) {
        const resForeignSearch = createMockRes();
        await controller.personasCandidatasPorUnidad(
          {
            rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
            params: { unidadId: '10' },
            query: { q: foreignQuery },
          },
          resForeignSearch
        );
        assert.equal(resForeignSearch.statusCode, 200);
        assert.equal(resForeignSearch.body.total, 0, `RH CLUES no debe obtener resultados ajenos buscando "${foreignQuery}"`);
        assert.deepEqual(resForeignSearch.body.items, []);
      }

      // En cambio, RH GLOBAL sí encuentra a Carlos buscando por nombre ("carlos") o por matrícula ("MAT-2004")
      for (const globalForeignQuery of ['carlos', 'MAT-2004']) {
        const resGlobalSearch = createMockRes();
        await controller.personasCandidatasPorUnidad(
          {
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: { unidadId: '10' },
            query: { q: globalForeignQuery },
          },
          resGlobalSearch
        );
        assert.equal(resGlobalSearch.statusCode, 200);
        assert.equal(resGlobalSearch.body.total, 1);
        assert.equal(resGlobalSearch.body.items[0].persona_id, 104);
      }

      // D) Paginación correcta en RH CLUES sobre el subconjunto autorizado (3 registros en unidad 10 -> página 2 con pageSize 2 devuelve 1 registro y total 3)
      const resCluesPage2 = createMockRes();
      await controller.personasCandidatasPorUnidad(
        {
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          query: { page: '2', pageSize: '2' },
        },
        resCluesPage2
      );
      assert.equal(resCluesPage2.statusCode, 200);
      assert.equal(resCluesPage2.body.page, 2);
      assert.equal(resCluesPage2.body.pageSize, 2);
      assert.equal(resCluesPage2.body.total, 3);
      assert.equal(resCluesPage2.body.items.length, 1);

      // E) Unidad autorizada para RH CLUES pero sin personas en directorio (unidad 30 BCIMB000020) devuelve colección vacía válida
      const resCluesEmpty = createMockRes();
      await controller.personasCandidatasPorUnidad(
        {
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000020'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '30' },
          query: {},
        },
        resCluesEmpty
      );
      assert.equal(resCluesEmpty.statusCode, 200);
      assert.deepEqual(resCluesEmpty.body, {
        unidad: { id: 30, nombre: 'CLINICA ENSENADA', cluesimb: 'BCIMB000020' },
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });

      passed++;
    }

    // 23: Validación de parámetros inválidos en URL y query (400) sin tocar PostgreSQL
    {
      capturedQueries = [];
      const badRequests = [
        { params: { unidadId: 'abc' }, query: {} },
        { params: { unidadId: '0' }, query: {} },
        { params: { unidadId: '-5' }, query: {} },
        { params: { unidadId: '10' }, query: { page: '0' } },
        { params: { unidadId: '10' }, query: { pageSize: '-1' } },
        { params: { unidadId: '10' }, query: { q: ['a', 'b'] } },
      ];

      for (const bad of badRequests) {
        const req = {
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          ...bad,
        };
        const res1 = createMockRes();
        await controller.personalPorUnidad(req, res1);
        assert.equal(res1.statusCode, 400);

        const res2 = createMockRes();
        await controller.personasCandidatasPorUnidad(req, res2);
        assert.equal(res2.statusCode, 400);
      }
      assert.equal(capturedQueries.length, 0, 'Parámetros inválidos no deben ejecutar SQL');
      passed++;
    }

    // =========================================================================
    // SUITE RH-2B.4A (POST /api/rh/unidades/:unidadId/adscripciones)
    // =========================================================================

    const AUTH_USER_UUID = '11111111-2222-4333-8444-555555555555';
    let txAdscripciones = [];
    let txPersonas = [];
    let txListasAsistencia = [];
    let txAuditLogs = [];
    let txEvents = [];
    let failOnTxSql = null;
    let nextAdscripcionId = 7001;
    const personaRowLocks = new Map(); // personaId -> { ownerClientId, queue: [] }
    let nextMockClientId = 1;

    function acquirePersonaLock(personaId, clientId) {
      const existing = personaRowLocks.get(personaId);
      if (!existing || existing.ownerClientId === clientId) {
        if (!existing) {
          personaRowLocks.set(personaId, { ownerClientId: clientId, queue: [] });
        }
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        existing.queue.push(() => {
          existing.ownerClientId = clientId;
          resolve();
        });
      });
    }

    function releasePersonaLocks(clientId) {
      for (const [pid, lock] of personaRowLocks.entries()) {
        if (lock.ownerClientId === clientId) {
          const next = lock.queue.shift();
          if (next) {
            next();
          } else {
            personaRowLocks.delete(pid);
          }
        }
      }
    }

    function resetTxState() {
      txAdscripciones = MOCK_ADSCRIPCIONES.map((a) => ({ ...a }));
      txPersonas = MOCK_PERSONAS.map((p) => ({ ...p }));
      txListasAsistencia = [];
      txAuditLogs = [];
      txEvents = [];
      failOnTxSql = null;
      personaRowLocks.clear();
    }
    resetTxState();

    pool.connect = async () => {
      const clientId = nextMockClientId++;
      let stagedAdscripciones = [];
      let stagedUpdates = new Map(); // adscripcionId -> updatedRow
      let stagedPersonaUpdates = new Map(); // personaId -> updatedPersonaRow
      let stagedAuditLogs = [];
      let inTx = false;

      function getEffectiveAdscripciones() {
        const base = txAdscripciones.map((a) =>
          stagedUpdates.has(a.id) ? { ...stagedUpdates.get(a.id) } : { ...a }
        );
        return [...base, ...stagedAdscripciones.map((a) => ({ ...a }))];
      }

      function getEffectivePersonas() {
        return txPersonas.map((p) =>
          stagedPersonaUpdates.has(p.id) ? { ...stagedPersonaUpdates.get(p.id) } : { ...p }
        );
      }

      return {
        async query(sql, params = []) {
          const normalized = String(sql).replace(/\s+/g, ' ').trim();
          txEvents.push({ clientId, sql: normalized, params });

          // Prohibir absolutamente cualquier INSERT/DELETE sobre public.persona o modificaciones sobre snapshots de rh_lista_asistencia
          assert.equal(
            /\b(INSERT\s+INTO|DELETE\s+FROM)\s+public\.persona\b/i.test(normalized),
            false,
            `Prohibido insertar o eliminar en public.persona: ${normalized}`
          );
          assert.equal(
            /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.rh_lista_asistencia\b/i.test(normalized),
            false,
            `Prohibido modificar public.rh_lista_asistencia: ${normalized}`
          );

          if (failOnTxSql && normalized.includes(failOnTxSql)) {
            throw new Error(`Simulated TX failure on ${failOnTxSql}`);
          }

          if (normalized === 'BEGIN') {
            inTx = true;
            stagedAdscripciones = [];
            stagedUpdates = new Map();
            stagedPersonaUpdates = new Map();
            stagedAuditLogs = [];
            return { rows: [], rowCount: 0 };
          }

          if (normalized === 'COMMIT') {
            if (inTx) {
              for (const [id, updatedRow] of stagedUpdates.entries()) {
                const idx = txAdscripciones.findIndex((a) => a.id === id);
                if (idx >= 0) {
                  txAdscripciones[idx] = { ...updatedRow };
                }
              }
              for (const [pid, updatedPersona] of stagedPersonaUpdates.entries()) {
                const idx = txPersonas.findIndex((p) => p.id === pid);
                if (idx >= 0) {
                  txPersonas[idx] = { ...updatedPersona };
                }
              }
              txAdscripciones.push(...stagedAdscripciones);
              txAuditLogs.push(...stagedAuditLogs);
            }
            inTx = false;
            stagedAdscripciones = [];
            stagedUpdates = new Map();
            stagedPersonaUpdates = new Map();
            stagedAuditLogs = [];
            releasePersonaLocks(clientId);
            return { rows: [], rowCount: 0 };
          }

          if (normalized === 'ROLLBACK') {
            inTx = false;
            stagedAdscripciones = [];
            stagedUpdates = new Map();
            stagedPersonaUpdates = new Map();
            stagedAuditLogs = [];
            releasePersonaLocks(clientId);
            return { rows: [], rowCount: 0 };
          }

          if (/^SELECT id, persona_id, unidad_medica_id FROM public\.rh_adscripcion_laboral WHERE id = \$1 AND unidad_medica_id = \$2 LIMIT 1$/i.test(normalized)) {
            const aid = Number(params[0]);
            const uid = Number(params[1]);
            const found = getEffectiveAdscripciones().find(
              (a) => a.id === aid && a.unidad_medica_id === uid
            );
            if (!found) return { rows: [], rowCount: 0 };
            return {
              rows: [{ id: found.id, persona_id: found.persona_id, unidad_medica_id: found.unidad_medica_id }],
              rowCount: 1,
            };
          }

          if (/^SELECT al\.id AS adscripcion_laboral_id, al\.unidad_medica_id, p\.id AS persona_id, p\.rfc, p\.curp FROM public\.rh_adscripcion_laboral al JOIN public\.persona p ON p\.id = al\.persona_id WHERE al\.unidad_medica_id = \$1 AND al\.id = \$2 LIMIT 1$/i.test(normalized)) {
            const uid = Number(params[0]);
            const aid = Number(params[1]);
            const foundAl = getEffectiveAdscripciones().find(
              (a) => a.unidad_medica_id === uid && a.id === aid
            );
            if (!foundAl) return { rows: [], rowCount: 0 };
            const foundPersona = getEffectivePersonas().find((p) => p.id === foundAl.persona_id);
            if (!foundPersona) return { rows: [], rowCount: 0 };
            return {
              rows: [
                {
                  adscripcion_laboral_id: foundAl.id,
                  unidad_medica_id: foundAl.unidad_medica_id,
                  persona_id: foundPersona.id,
                  rfc: foundPersona.rfc,
                  curp: foundPersona.curp,
                },
              ],
              rowCount: 1,
            };
          }

          if (/^SELECT id, nombre_completo, unidad_medica_id, activo FROM public\.persona WHERE id = \$1 FOR UPDATE$/i.test(normalized)) {
            const pid = Number(params[0]);
            await acquirePersonaLock(pid, clientId);
            const found = getEffectivePersonas().find((p) => p.id === pid);
            if (!found) return { rows: [], rowCount: 0 };
            return {
              rows: [{
                id: found.id,
                nombre_completo: found.nombre_completo,
                unidad_medica_id: found.unidad_medica_id,
                activo: found.activo,
              }],
              rowCount: 1,
            };
          }

          if (/^SELECT id, nombre_completo, nombres, apellidos, rfc, curp, activo FROM public\.persona WHERE id = \$1 FOR UPDATE$/i.test(normalized)) {
            const pid = Number(params[0]);
            await acquirePersonaLock(pid, clientId);
            const found = getEffectivePersonas().find((p) => p.id === pid);
            if (!found) return { rows: [], rowCount: 0 };
            return {
              rows: [{
                id: found.id,
                nombre_completo: found.nombre_completo,
                nombres: found.nombres ?? null,
                apellidos: found.apellidos ?? null,
                rfc: found.rfc ?? null,
                curp: found.curp ?? null,
                activo: found.activo,
              }],
              rowCount: 1,
            };
          }

          const updatePersonaMatch = /^UPDATE public\.persona SET (.+) WHERE id = \$(\d+) RETURNING id, nombre_completo, nombres, apellidos, rfc, curp, activo$/i.exec(
            normalized
          );
          if (updatePersonaMatch) {
            const setSegment = updatePersonaMatch[1];
            const whereParamIdx = Number(updatePersonaMatch[2]);

            // Verificar explícitamente que jamás se actualice unidad_medica_id, correo_principal, activo ni fecha_baja
            assert.equal(
              /\b(unidad_medica_id|correo_principal|activo|fecha_baja|user_id)\s*=/i.test(setSegment),
              false
            );

            const pid = Number(params[whereParamIdx - 1]);
            const allPersonas = getEffectivePersonas();
            const current = allPersonas.find((p) => p.id === pid);
            if (!current) return { rows: [], rowCount: 0 };

            const nextValues = {
              nombres: current.nombres ?? null,
              apellidos: current.apellidos ?? null,
              nombre_completo: current.nombre_completo,
              rfc: current.rfc ?? null,
              curp: current.curp ?? null,
            };

            let touchedStructuredInSet = false;
            for (const assignment of setSegment.split(',')) {
              const m = /^\s*([a-z_]+)\s*=\s*\$(\d+)\s*$/i.exec(assignment);
              assert.ok(m, `Asignación SET inválida en UPDATE public.persona: ${assignment}`);
              const col = m[1].toLowerCase();
              const paramIdx = Number(m[2]) - 1;
              assert.ok(
                ['nombres', 'apellidos', 'nombre_completo', 'rfc', 'curp'].includes(col),
                `Columna no permitida en UPDATE public.persona: ${col}`
              );
              nextValues[col] = params[paramIdx];
              if (col === 'nombres' || col === 'apellidos') {
                touchedStructuredInSet = true;
              }
            }

            const { nombres, apellidos, rfc, curp } = nextValues;

            // Simular índices únicos parciales uq_persona_rfc y uq_persona_curp de PostgreSQL (23505)
            if (rfc !== null) {
              const dupRfc = allPersonas.find(
                (p) => p.id !== pid && p.rfc && p.rfc.toUpperCase() === String(rfc).toUpperCase()
              );
              if (dupRfc) {
                const pgErr = new Error('duplicate key value violates unique constraint "uq_persona_rfc"');
                pgErr.code = '23505';
                pgErr.constraint = 'uq_persona_rfc';
                throw pgErr;
              }
            }
            if (curp !== null) {
              const dupCurp = allPersonas.find(
                (p) => p.id !== pid && p.curp && p.curp.toUpperCase() === String(curp).toUpperCase()
              );
              if (dupCurp) {
                const pgErr = new Error('duplicate key value violates unique constraint "uq_persona_curp"');
                pgErr.code = '23505';
                pgErr.constraint = 'uq_persona_curp';
                throw pgErr;
              }
            }

            // Simular trigger real t_persona_nombre de PostgreSQL:
            // CREATE TRIGGER t_persona_nombre BEFORE INSERT OR UPDATE OF nombres, apellidos ON public.persona
            // FOR EACH ROW EXECUTE FUNCTION set_nombre_completo()
            // IF NEW.nombres IS NOT NULL OR NEW.apellidos IS NOT NULL THEN
            //   NEW.nombre_completo := btrim(coalesce(NEW.nombres, '') || ' ' || coalesce(NEW.apellidos, ''));
            // END IF;
            let effectiveNombreCompleto = nextValues.nombre_completo;
            if (touchedStructuredInSet && (nombres !== null || apellidos !== null)) {
              effectiveNombreCompleto = `${nombres ?? ''} ${apellidos ?? ''}`.trim();
            }

            const updatedPersona = {
              ...current,
              nombres,
              apellidos,
              nombre_completo: effectiveNombreCompleto,
              rfc,
              curp,
            };
            if (inTx) {
              stagedPersonaUpdates.set(pid, updatedPersona);
            }
            return {
              rows: [
                {
                  id: updatedPersona.id,
                  nombre_completo: updatedPersona.nombre_completo,
                  nombres: updatedPersona.nombres,
                  apellidos: updatedPersona.apellidos,
                  rfc: updatedPersona.rfc,
                  curp: updatedPersona.curp,
                  activo: updatedPersona.activo,
                },
              ],
              rowCount: 1,
            };
          }

          if (/^SELECT id, unidad_medica_id, vigente_desde, vigente_hasta, activo FROM public\.rh_adscripcion_laboral WHERE persona_id = \$1 ORDER BY id ASC FOR UPDATE$/i.test(normalized)) {
            const pid = Number(params[0]);
            const rows = getEffectiveAdscripciones().filter((a) => a.persona_id === pid);
            return { rows, rowCount: rows.length };
          }

          if (/^SELECT id, persona_id, unidad_medica_id, matricula, puesto, turno, jornada, horario, vigente_desde, vigente_hasta, activo, observaciones FROM public\.rh_adscripcion_laboral WHERE persona_id = \$1 ORDER BY id ASC FOR UPDATE$/i.test(normalized)) {
            const pid = Number(params[0]);
            const rows = getEffectiveAdscripciones().filter((a) => a.persona_id === pid);
            return { rows, rowCount: rows.length };
          }

          if (/^SELECT la\.id, la\.estado, pa\.fecha_inicio, pa\.fecha_fin FROM public\.rh_lista_asistencia la JOIN public\.rh_periodo_asistencia pa ON pa\.id = la\.periodo_id WHERE la\.adscripcion_laboral_id = \$1$/i.test(normalized)) {
            const aid = Number(params[0]);
            const rows = txListasAsistencia
              .filter((l) => l.adscripcion_laboral_id === aid)
              .map((l) => ({ ...l }));
            return { rows, rowCount: rows.length };
          }

          if (/^UPDATE public\.rh_adscripcion_laboral SET matricula = \$1, puesto = \$2, turno = \$3, jornada = \$4, horario = \$5, vigente_desde = \$6, vigente_hasta = \$7, activo = \$8, observaciones = \$9, actualizado_en = NOW\(\) WHERE id = \$10 AND unidad_medica_id = \$11 RETURNING/i.test(normalized)) {
            // Verificar explícitamente que el SQL de UPDATE jamás modifique persona_id ni unidad_medica_id
            assert.equal(/SET[^W]*(persona_id|unidad_medica_id)\s*=/i.test(normalized), false);
            const [
              matricula,
              puesto,
              turno,
              jornada,
              horario,
              vigente_desde,
              vigente_hasta,
              activo,
              observaciones,
              id,
              unidad_medica_id,
            ] = params;
            const current = getEffectiveAdscripciones().find(
              (a) => a.id === Number(id) && a.unidad_medica_id === Number(unidad_medica_id)
            );
            if (!current) return { rows: [], rowCount: 0 };
            const updatedRow = {
              ...current,
              matricula,
              puesto,
              turno,
              jornada,
              horario,
              vigente_desde,
              vigente_hasta,
              activo: Boolean(activo),
              observaciones,
            };
            if (inTx) {
              stagedUpdates.set(Number(id), updatedRow);
            }
            return { rows: [{ ...updatedRow }], rowCount: 1 };
          }

          if (/^INSERT INTO public\.rh_adscripcion_laboral/i.test(normalized)) {
            const [
              persona_id,
              unidad_medica_id,
              matricula,
              puesto,
              turno,
              jornada,
              horario,
              vigente_desde,
              vigente_hasta,
            ] = params;
            const newRow = {
              id: nextAdscripcionId++,
              persona_id: Number(persona_id),
              unidad_medica_id: Number(unidad_medica_id),
              matricula,
              puesto,
              turno,
              jornada,
              horario,
              vigente_desde,
              vigente_hasta,
              activo: true,
            };
            if (inTx) {
              stagedAdscripciones.push(newRow);
            } else {
              txAdscripciones.push(newRow);
            }
            return { rows: [{ ...newRow }], rowCount: 1 };
          }

          if (/^INSERT INTO public\.app_audit_logs \(user_id, action, resource, ip, user_agent, payload\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6::jsonb\)$/i.test(normalized)) {
            const [user_id, action, resource, ip, user_agent, payloadJson] = params;
            const logEntry = {
              user_id,
              action,
              resource,
              ip,
              user_agent,
              payload: JSON.parse(payloadJson),
            };
            if (inTx) {
              stagedAuditLogs.push(logEntry);
            } else {
              txAuditLogs.push(logEntry);
            }
            return { rows: [], rowCount: 1 };
          }

          throw new Error(`Consulta TX SQL no esperada en mock RH-2B.4A: ${normalized}`);
        },
        release() {
          releasePersonaLocks(clientId);
          txEvents.push({ clientId, sql: 'RELEASE', params: [] });
        },
      };
    };

    // 24 (Requisitos 4, 5 y 6 de RH-2B.4A): Ruta POST /unidades/:unidadId/adscripciones registrada con requireAuth + requireRhAccess, y ADMIN_TIC GLOBAL recibe 403 sin permiso operativo de alta
    {
      const postLayer = rhRouter.stack.find(
        (l) => l.route && l.route.path === '/unidades/:unidadId/adscripciones' && l.route.methods.post
      );
      assert.ok(postLayer, 'Debe existir POST /unidades/:unidadId/adscripciones en rhRouter');
      assert.equal(postLayer.route.stack.length, 3);
      assert.equal(postLayer.route.stack[0].name, 'requireAuth');

      // ADMIN_TIC GLOBAL recibe 403
      resetTxState();
      const reqAdminTic = {
        user: { sub: AUTH_USER_UUID },
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' },
        params: { unidadId: '10' },
        body: {
          persona_id: 103,
          matricula: 'MAT-1003',
          puesto: 'Analista RH',
          turno: 'MATUTINO',
          jornada: '8 HORAS',
          horario: '08:00 - 16:00',
          vigente_desde: '2026-11-01',
          vigente_hasta: null,
        },
        get: () => 'TestAgent/1.0',
      };
      const resAdminTic = createMockRes();
      await controller.createAdscripcionPorUnidad(reqAdminTic, resAdminTic);
      assert.equal(resAdminTic.statusCode, 403);
      assert.equal(txEvents.length, 0, 'ADMIN_TIC no debe abrir conexión transaccional en alta de adscripción');
      passed++;
    }

    // 25 (Requisitos 1, 2, 14 y 15 de RH-2B.4A): Creación válida con RECURSOS_HUMANOS GLOBAL y RECURSOS_HUMANOS CLUES autorizado, sin tocar public.persona y con auditoría completa
    {
      resetTxState();
      // Persona 103 (Lic. Sofía Ramírez) está en directorio con unidad_medica_id = 10 y sin adscripciones previas
      const reqRhGlobal = {
        user: { sub: AUTH_USER_UUID },
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10' },
        ip: '127.0.0.1',
        get: (h) => (h === 'User-Agent' ? 'Mozilla/5.0 Test' : undefined),
        body: {
          persona_id: 103,
          matricula: '  MAT-1003  ',
          puesto: '  Analista Administrativo  ',
          turno: '  MATUTINO  ',
          jornada: '  8 HORAS  ',
          horario: '  08:00 - 16:00  ',
          vigente_desde: '2026-11-01',
          vigente_hasta: null,
        },
      };
      const resRhGlobal = createMockRes();
      await controller.createAdscripcionPorUnidad(reqRhGlobal, resRhGlobal);

      assert.equal(resRhGlobal.statusCode, 201);
      assert.deepEqual(resRhGlobal.body, {
        adscripcion_laboral_id: 7001,
        persona_id: 103,
        nombre_completo: 'Lic. Sofía Ramírez',
        unidad: { id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' },
        unidad_medica_id: 10,
        matricula: 'MAT-1003',
        puesto: 'Analista Administrativo',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '08:00 - 16:00',
        vigente_desde: '2026-11-01',
        vigente_hasta: null,
        activo: true,
      });

      // Verificar que no incluye RFC ni CURP ni secretos en respuesta ni en auditoría
      const rawResp = JSON.stringify(resRhGlobal.body);
      assert.equal(rawResp.includes('rfc'), false);
      assert.equal(rawResp.includes('curp'), false);
      assert.equal(rawResp.includes('RAMS900303'), false);

      assert.equal(txAuditLogs.length, 1);
      assert.deepEqual(txAuditLogs[0], {
        user_id: AUTH_USER_UUID,
        action: 'RH_CREATE_ADSCRIPCION_LABORAL',
        resource: 'rh_adscripcion_laboral:7001',
        ip: '127.0.0.1',
        user_agent: 'Mozilla/5.0 Test',
        payload: {
          adscripcion_laboral_id: 7001,
          persona_id: 103,
          unidad_medica_id: 10,
          vigente_desde: '2026-11-01',
          vigente_hasta: null,
        },
      });

      // Ahora probar con RECURSOS_HUMANOS CLUES autorizado para unidad 10 (reiniciando estado)
      resetTxState();
      const reqRhClues = {
        ...reqRhGlobal,
        rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
      };
      const resRhClues = createMockRes();
      await controller.createAdscripcionPorUnidad(reqRhClues, resRhClues);
      assert.equal(resRhClues.statusCode, 201);
      assert.equal(resRhClues.body.unidad_medica_id, 10);
      assert.equal(txAuditLogs.length, 1);
      passed++;
    }

    // 26 (Requisitos 3, 7, 8, 9, 10 y 11 de RH-2B.4A): Unidad no autorizada (403), persona inexistente (404), persona inactiva (409), unidad distinta en directorio (409), adscripción duplicada en misma unidad (409), adscripción activa en otra unidad (409) y conflicto de vigencias (409)
    {
      resetTxState();

      // A) Unidad no autorizada para operador CLUES (unidad 20 cuando solo tiene BCIMB000001) -> 403
      const resForbiddenUnit = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '20' },
          body: { persona_id: 104, vigente_desde: '2026-11-01' },
        },
        resForbiddenUnit
      );
      assert.equal(resForbiddenUnit.statusCode, 403);

      // B) Persona inexistente (id 9999) -> 404 con ROLLBACK
      const resMissingPersona = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          body: { persona_id: 9999, vigente_desde: '2026-11-01' },
        },
        resMissingPersona
      );
      assert.equal(resMissingPersona.statusCode, 404);

      // C) Persona inactiva (id 105) -> 409
      const resInactivePersona = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          body: { persona_id: 105, vigente_desde: '2026-11-01' },
        },
        resInactivePersona
      );
      assert.equal(resInactivePersona.statusCode, 409);

      // D) Persona con unidad diferente en directorio (persona 103 tiene unidad_medica_id = 10; se intenta vincular en unidad 20) -> 409
      const resDiffDirUnit = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '20' },
          body: { persona_id: 103, vigente_desde: '2026-11-01' },
        },
        resDiffDirUnit
      );
      assert.equal(resDiffDirUnit.statusCode, 409);

      // E) Adscripción duplicada activa en la misma unidad (persona 101 ya tiene adscripción activa en unidad 10) -> 409
      const resDupSameUnit = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          body: { persona_id: 101, vigente_desde: '2026-11-01' },
        },
        resDupSameUnit
      );
      assert.equal(resDupSameUnit.statusCode, 409);

      // F) Adscripción activa en otra unidad (simulamos persona 103 con unidad_medica_id = null pero con adscripción activa en unidad 20) -> 409
      txAdscripciones.push({
        id: 5999,
        persona_id: 103,
        unidad_medica_id: 20,
        matricula: 'MAT-EXT',
        puesto: 'Comisionada',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '08:00 - 16:00',
        vigente_desde: '2026-01-01',
        vigente_hasta: null,
        activo: true,
      });
      const resActiveOtherUnit = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          body: { persona_id: 103, vigente_desde: '2026-11-01' },
        },
        resActiveOtherUnit
      );
      assert.equal(resActiveOtherUnit.statusCode, 409);

      // G) Conflicto de solapamiento de vigencias con una adscripción inactiva histórica en la misma unidad -> 409
      resetTxState();
      txAdscripciones.push({
        id: 5888,
        persona_id: 103,
        unidad_medica_id: 10,
        matricula: 'MAT-HIST',
        puesto: 'Analista',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '08:00 - 16:00',
        vigente_desde: '2026-01-01',
        vigente_hasta: '2026-06-30',
        activo: false,
      });
      const resOverlap = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          body: { persona_id: 103, vigente_desde: '2026-06-15', vigente_hasta: '2026-12-31' },
        },
        resOverlap
      );
      assert.equal(resOverlap.statusCode, 409);

      // Si no se solapa (vigente_desde posterior al 2026-06-30 de la adscripción inactiva), SÍ permite crearla (201)
      const resNonOverlap = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          body: { persona_id: 103, vigente_desde: '2026-07-01', vigente_hasta: null },
        },
        resNonOverlap
      );
      assert.equal(resNonOverlap.statusCode, 201);
      passed++;
    }

    // 27 (Requisitos 12 y 13 de RH-2B.4A): Validación de fechas (vigente_hasta < vigente_desde, fechas inválidas), longitudes y rechazo de propiedades desconocidas (400)
    {
      resetTxState();
      const invalidPayloads = [
        { persona_id: 103, vigente_desde: '2026-11-10', vigente_hasta: '2026-11-01' }, // hasta < desde
        { persona_id: 103, vigente_desde: '2026-02-30' }, // fecha calendario inexistente
        { persona_id: 103, vigente_desde: '17/11/2026' }, // formato inválido
        { persona_id: 103 }, // falta vigente_desde
        { persona_id: -1, vigente_desde: '2026-11-01' }, // persona_id inválido
        { persona_id: 103, vigente_desde: '2026-11-01', rfc: 'GOMA800101XXX' }, // propiedad no permitida
        { persona_id: 103, vigente_desde: '2026-11-01', unidad_medica_id: 20 }, // propiedad no permitida
        { persona_id: 103, vigente_desde: '2026-11-01', matricula: 'X'.repeat(65) }, // excede longitud 64
      ];

      for (const badBody of invalidPayloads) {
        const res = createMockRes();
        await controller.createAdscripcionPorUnidad(
          {
            user: { sub: AUTH_USER_UUID },
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: { unidadId: '10' },
            body: badBody,
          },
          res
        );
        assert.equal(res.statusCode, 400, `Payload ${JSON.stringify(badBody)} debe devolver 400`);
      }
      assert.equal(txAuditLogs.length, 0);
      passed++;
    }

    // 28 (Requisitos 16 y 17 de RH-2B.4A): Rollback completo si falla la auditoría, y control de concurrencia (dos altas simultáneas sobre la misma persona solo permiten una)
    {
      // Parte A: Si falla el INSERT en app_audit_logs, se hace ROLLBACK y no queda persistida la adscripción
      resetTxState();
      const initialCount = txAdscripciones.length;
      failOnTxSql = 'INSERT INTO public.app_audit_logs';

      const resAuditFail = createMockRes();
      await controller.createAdscripcionPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10' },
          body: { persona_id: 103, vigente_desde: '2026-11-01' },
        },
        resAuditFail
      );
      assert.equal(resAuditFail.statusCode, 500);
      assert.equal(txAdscripciones.length, initialCount, 'El rollback debe revertir el INSERT de rh_adscripcion_laboral si falla la auditoría');
      assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));

      // Parte B: Dos solicitudes concurrentes para vincular a la misma persona 103 en la unidad 10
      resetTxState();
      const reqConcurrent = () =>
        service.createAdscripcionLaboral(
          { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          10,
          { persona_id: 103, matricula: 'MAT-CONC', vigente_desde: '2026-11-01' },
          { userId: AUTH_USER_UUID }
        );

      const outcomes = await Promise.allSettled([reqConcurrent(), reqConcurrent()]);
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactamente una solicitud concurrente debe completarse con éxito');
      assert.equal(rejected.length, 1, 'La segunda solicitud concurrente debe rechazarse con 409 tras el bloqueo FOR UPDATE');
      assert.equal(rejected[0].reason.status, 409);
      assert.equal(txAuditLogs.length, 1);
      passed++;
    }

    // =========================================================================
    // SUITE RH-2B.4C (GET /api/rh/unidades/:unidadId/personal/:adscripcionId)
    // =========================================================================

    // 29 (Requisitos 4, 5 y 14 de RH-2B.4C): Ruta GET /unidades/:unidadId/personal/:adscripcionId registrada con requireAuth + requireRhAccess, y rechazo sin rol autorizado (403)
    {
      const fichaLayer = rhRouter.stack.find(
        (l) =>
          l.route &&
          l.route.path === '/unidades/:unidadId/personal/:adscripcionId' &&
          l.route.methods.get
      );
      assert.ok(fichaLayer, 'Debe existir GET /unidades/:unidadId/personal/:adscripcionId en rhRouter');
      assert.equal(fichaLayer.route.stack.length, 3);
      assert.equal(fichaLayer.route.stack[0].name, 'requireAuth');

      const resNoAccess = createMockRes();
      await controller.fichaPersonalPorUnidad(
        { params: { unidadId: '10', adscripcionId: '5001' } },
        resNoAccess
      );
      assert.equal(resNoAccess.statusCode, 403);
      passed++;
    }

    // 30 (Requisitos 1, 9, 10, 11, 12, 14, 15, 18 y 19 de RH-2B.4C): RH GLOBAL consulta ficha autorizada, verifica enmascaramiento exacto de RFC/CURP, Cache-Control: no-store y permisos completos
    {
      capturedQueries = [];
      const reqGlobal = {
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10', adscripcionId: '5001' },
      };
      const resGlobal = createMockRes();
      await controller.fichaPersonalPorUnidad(reqGlobal, resGlobal);

      assert.equal(resGlobal.statusCode, 200);
      assert.equal(resGlobal.headers['cache-control'], 'no-store');

      // RFC real en mock: 'GOMA800101ABC' (13 chars) -> '**********ABC' (10 asteriscos + últimos 3)
      // CURP real en mock: 'GOMA800101MDFR0001' (18 chars) -> '****************01' (16 asteriscos + últimos 2)
      assert.deepEqual(resGlobal.body, {
        unidad: {
          id: 10,
          nombre: 'HOSPITAL GENERAL MEXICALI',
          cluesimb: 'BCIMB000001',
        },
        personal: {
          persona_id: 101,
          nombre_completo: 'Dra. Ana Gómez',
          nombres: 'Ana',
          apellidos: 'Gómez',
          tiene_rfc: true,
          rfc_masked: '**********ABC',
          tiene_curp: true,
          curp_masked: '****************01',
          activo: true,
        },
        laboral: {
          adscripcion_laboral_id: 5001,
          unidad_medica_id: 10,
          matricula: 'MAT-1001',
          puesto: 'Médico Especialista A',
          turno: 'MATUTINO',
          jornada: '8 HORAS',
          horario: '07:00 - 15:00',
          vigente_desde: '2026-01-01',
          vigente_hasta: null,
          activo: true,
          observaciones: 'Base federalizada',
        },
        permisos: {
          puede_editar_laboral: true,
          puede_revelar_sensibles: true,
          puede_editar_identificacion: true,
        },
      });

      // Conservar longitud real y garantizar que RFC/CURP completos ni fecha de nacimiento ('800101') ni iniciales ('GOMA') aparezcan en el payload serializado
      assert.equal(resGlobal.body.personal.rfc_masked.length, 'GOMA800101ABC'.length);
      assert.equal(resGlobal.body.personal.curp_masked.length, 'GOMA800101MDFR0001'.length);
      const serialized = JSON.stringify(resGlobal.body);
      assert.equal(serialized.includes('GOMA800101ABC'), false);
      assert.equal(serialized.includes('GOMA800101MDFR0001'), false);
      assert.equal(serialized.includes('GOMA'), false);
      assert.equal(serialized.includes('800101'), false);
      assert.equal(serialized.includes('ana@imssb.gob.mx'), false);
      passed++;
    }

    // 31 (Requisitos 2, 3, 13, 16 y 17 de RH-2B.4C): RH CLUES en su unidad autorizada, ADMIN_TIC GLOBAL y manejo de RFC/CURP NULL
    {
      // A) RH CLUES consulta adscripción 5002 (Enf. Luis Pérez, con rfc: null y curp: null) en unidad 10 autorizada
      const reqClues = {
        rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10', adscripcionId: '5002' },
      };
      const resClues = createMockRes();
      await controller.fichaPersonalPorUnidad(reqClues, resClues);

      assert.equal(resClues.statusCode, 200);
      assert.equal(resClues.headers['cache-control'], 'no-store');
      assert.deepEqual(resClues.body.personal, {
        persona_id: 102,
        nombre_completo: 'Enf. Luis Pérez',
        nombres: null,
        apellidos: null,
        tiene_rfc: false,
        rfc_masked: null,
        tiene_curp: false,
        curp_masked: null,
        activo: true,
      });
      assert.deepEqual(resClues.body.laboral, {
        adscripcion_laboral_id: 5002,
        unidad_medica_id: 10,
        matricula: 'MAT-1002',
        puesto: 'Enfermero General',
        turno: 'VESPERTINO',
        jornada: '8 HORAS',
        horario: '14:00 - 21:30',
        vigente_desde: '2026-02-01',
        vigente_hasta: '2026-12-31',
        activo: true,
        observaciones: null,
      });
      // Permisos RH CLUES: puede_editar_laboral = true, pero sensibles/identificación = false
      assert.deepEqual(resClues.body.permisos, {
        puede_editar_laboral: true,
        puede_revelar_sensibles: false,
        puede_editar_identificacion: false,
      });

      // B) ADMIN_TIC GLOBAL consulta ficha básica: todos los permisos de edición/revelación en false
      const reqAdminTic = {
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' },
        params: { unidadId: '10', adscripcionId: '5001' },
      };
      const resAdminTic = createMockRes();
      await controller.fichaPersonalPorUnidad(reqAdminTic, resAdminTic);

      assert.equal(resAdminTic.statusCode, 200);
      assert.equal(resAdminTic.headers['cache-control'], 'no-store');
      assert.deepEqual(resAdminTic.body.permisos, {
        puede_editar_laboral: false,
        puede_revelar_sensibles: false,
        puede_editar_identificacion: false,
      });
      assert.equal(resAdminTic.body.personal.rfc_masked, '**********ABC');
      assert.equal(resAdminTic.body.personal.curp_masked, '****************01');
      passed++;
    }

    // 32 (Requisitos 6, 7 y 8 de RH-2B.4C): RH CLUES en unidad ajena (403), adscripción inexistente (404), adscripción de otra unidad cambiando URL (404) y parámetros inválidos (400)
    {
      // A) RH CLUES intenta consultar unidad 20 ajena a su alcance ['BCIMB000001'] -> 403 sin tocar rh_adscripcion_laboral
      capturedQueries = [];
      const resForbiddenClues = createMockRes();
      await controller.fichaPersonalPorUnidad(
        {
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '20', adscripcionId: '5003' },
        },
        resForbiddenClues
      );
      assert.equal(resForbiddenClues.statusCode, 403);
      assert.equal(
        capturedQueries.some((q) => /FROM public\.rh_adscripcion_laboral/i.test(q.sql)),
        false,
        'No debe consultar rh_adscripcion_laboral si la unidad no está autorizada para el operador CLUES'
      );

      // B) Adscripción inexistente (99999) en unidad autorizada 10 -> 404
      const resNotFound = createMockRes();
      await controller.fichaPersonalPorUnidad(
        {
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '99999' },
        },
        resNotFound
      );
      assert.equal(resNotFound.statusCode, 404);

      // C) Adscripción 5003 pertenece a la unidad 20; si se solicita bajo la unidad 10 (/unidades/10/personal/5003), devuelve 404 y no filtra datos
      const resCrossUnit = createMockRes();
      await controller.fichaPersonalPorUnidad(
        {
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5003' },
        },
        resCrossUnit
      );
      assert.equal(resCrossUnit.statusCode, 404);
      assert.equal(JSON.stringify(resCrossUnit.body).includes('Carlos'), false);

      // D) Parámetros inválidos en URL (400) sin ejecutar SQL
      capturedQueries = [];
      for (const badParams of [
        { unidadId: 'abc', adscripcionId: '5001' },
        { unidadId: '0', adscripcionId: '5001' },
        { unidadId: '10', adscripcionId: 'xyz' },
        { unidadId: '10', adscripcionId: '0' },
        { unidadId: '10', adscripcionId: '-5' },
      ]) {
        const resBad = createMockRes();
        await controller.fichaPersonalPorUnidad(
          {
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: badParams,
          },
          resBad
        );
        assert.equal(resBad.statusCode, 400);
      }
      assert.equal(capturedQueries.length, 0);
      passed++;
    }

    // =========================================================================
    // SUITE RH-2B.4E (PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/laboral)
    // =========================================================================

    // 33 (Requisitos 3, 4 y 5 de RH-2B.4E): Ruta PATCH registrada con requireAuth + requireRhAccess; 401 sin usuario, 403 sin rol RH y 403 para ADMIN_TIC GLOBAL sin permiso de edición laboral
    {
      const patchLayer = rhRouter.stack.find(
        (l) =>
          l.route &&
          l.route.path === '/unidades/:unidadId/personal/:adscripcionId/laboral' &&
          l.route.methods.patch
      );
      assert.ok(
        patchLayer,
        'Debe existir PATCH /unidades/:unidadId/personal/:adscripcionId/laboral en rhRouter'
      );
      assert.equal(patchLayer.route.stack.length, 3);
      assert.equal(patchLayer.route.stack[0].name, 'requireAuth');

      resetTxState();
      // 401 sin usuario autenticado
      const resNoUser = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { puesto: 'Nuevo Puesto' },
        },
        resNoUser
      );
      assert.equal(resNoUser.statusCode, 401);

      // 403 sin rhAccess
      const resNoRh = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { puesto: 'Nuevo Puesto' },
        },
        resNoRh
      );
      assert.equal(resNoRh.statusCode, 403);

      // 403 para ADMIN_TIC GLOBAL sin rol operativo RECURSOS_HUMANOS
      const resAdminTic = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { puesto: 'Intento Admin TIC' },
        },
        resAdminTic
      );
      assert.equal(resAdminTic.statusCode, 403);
      assert.equal(txEvents.length, 0, 'ADMIN_TIC no debe abrir conexión transaccional en edición laboral');
      passed++;
    }

    // 34 (Requisitos 1, 2, 9, 18, 19 y 20 de RH-2B.4E): RH GLOBAL y RH CLUES modifican información laboral mediante PATCH parcial conservando propiedades omitidas, registrando auditoría exclusivamente de los campos modificados y sin tocar public.persona
    {
      resetTxState();

      // A) RH GLOBAL actualiza parcialmente solo `puesto` y `observaciones` de la adscripción 5001
      const reqPatchGlobal = {
        user: { sub: AUTH_USER_UUID },
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10', adscripcionId: '5001' },
        ip: '10.0.0.15',
        get: (h) => (h === 'User-Agent' ? 'Mozilla/5.0 PatchTest' : undefined),
        body: {
          puesto: '  Médico Especialista B  ',
          observaciones: '  Cambio de nivel autorizado  ',
        },
      };
      const resPatchGlobal = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(reqPatchGlobal, resPatchGlobal);

      assert.equal(resPatchGlobal.statusCode, 200);
      assert.deepEqual(resPatchGlobal.body, {
        unidad: { id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' },
        laboral: {
          adscripcion_laboral_id: 5001,
          unidad_medica_id: 10,
          matricula: 'MAT-1001', // conservado
          puesto: 'Médico Especialista B', // actualizado
          turno: 'MATUTINO', // conservado
          jornada: '8 HORAS', // conservado
          horario: '07:00 - 15:00', // conservado
          vigente_desde: '2026-01-01', // conservado
          vigente_hasta: null, // conservado
          activo: true, // conservado
          observaciones: 'Cambio de nivel autorizado', // actualizado
        },
        campos_modificados: ['puesto', 'observaciones'],
      });

      // Verificar que no expone RFC ni CURP
      const rawJson = JSON.stringify(resPatchGlobal.body);
      assert.equal(rawJson.includes('GOMA'), false);
      assert.equal(rawJson.includes('rfc'), false);
      assert.equal(rawJson.includes('curp'), false);

      // Verificar auditoría exacta en app_audit_logs
      assert.equal(txAuditLogs.length, 1);
      assert.deepEqual(txAuditLogs[0], {
        user_id: AUTH_USER_UUID,
        action: 'RH_UPDATE_ADSCRIPCION_LABORAL',
        resource: 'rh_adscripcion_laboral:5001',
        ip: '10.0.0.15',
        user_agent: 'Mozilla/5.0 PatchTest',
        payload: {
          adscripcion_laboral_id: 5001,
          persona_id: 101,
          unidad_medica_id: 10,
          campos_modificados: ['puesto', 'observaciones'],
        },
      });

      // B) Si se envía un PATCH con los mismos valores actuales (sin cambios efectivos), devuelve 200 con campos_modificados: [] y NO inserta un nuevo registro en app_audit_logs
      const resNoOp = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(reqPatchGlobal, resNoOp);
      assert.equal(resNoOp.statusCode, 200);
      assert.deepEqual(resNoOp.body.campos_modificados, []);
      assert.equal(txAuditLogs.length, 1, 'No debe registrar auditoría cuando no hubo cambios efectivos');

      // C) RH CLUES modifica información laboral en su unidad autorizada (unidad 10, adscripción 5002)
      const reqPatchClues = {
        user: { sub: AUTH_USER_UUID },
        rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10', adscripcionId: '5002' },
        body: {
          horario: '14:00 - 21:00',
          turno: 'VESPERTINO ESPECIAL',
        },
      };
      const resPatchClues = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(reqPatchClues, resPatchClues);
      assert.equal(resPatchClues.statusCode, 200);
      assert.equal(resPatchClues.body.laboral.horario, '14:00 - 21:00');
      assert.equal(resPatchClues.body.laboral.turno, 'VESPERTINO ESPECIAL');
      assert.deepEqual(resPatchClues.body.campos_modificados, ['turno', 'horario']);
      assert.equal(txAuditLogs.length, 2);
      passed++;
    }

    // 35 (Requisitos 6, 7 y 8 de RH-2B.4E): RH CLUES fuera de su unidad (403), adscripción inexistente (404) y adscripción de otra unidad (404)
    {
      resetTxState();

      // A) RH CLUES intenta modificar unidad 20 ajena a su alcance -> 403 sin abrir transacción
      const resCluesForbidden = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '20', adscripcionId: '5003' },
          body: { puesto: 'Intento ajeno' },
        },
        resCluesForbidden
      );
      assert.equal(resCluesForbidden.statusCode, 403);
      assert.equal(txEvents.length, 0);

      // B) Adscripción inexistente (99999) -> 404
      const resMissing = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '99999' },
          body: { puesto: 'No existe' },
        },
        resMissing
      );
      assert.equal(resMissing.statusCode, 404);

      // C) Adscripción 5003 pertenece a la unidad 20; si se solicita editarla bajo la unidad 10 (/unidades/10/personal/5003/laboral) -> 404
      const resWrongUnit = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5003' },
          body: { puesto: 'Cruce de unidad' },
        },
        resWrongUnit
      );
      assert.equal(resWrongUnit.statusCode, 404);
      passed++;
    }

    // 36 (Requisitos 10, 11, 12, 13, 14 y 15 de RH-2B.4E): Rechazo de request vacío, propiedades desconocidas/prohibidas, longitudes máximas, fechas inválidas, vigencias invertidas y booleanos no estrictos (400)
    {
      resetTxState();
      const badPayloads = [
        {}, // request vacío
        { id: 5001, puesto: 'Médico' }, // propiedad prohibida id
        { adscripcion_laboral_id: 5001 }, // propiedad prohibida adscripcion_laboral_id
        { persona_id: 102, puesto: 'Médico' }, // propiedad prohibida persona_id
        { unidad_medica_id: 20, puesto: 'Médico' }, // propiedad prohibida unidad_medica_id
        { rfc: 'GOMA800101ABC' }, // propiedad prohibida rfc
        { curp: 'GOMA800101MDFR0001' }, // propiedad prohibida curp
        { nombre_completo: 'Otro Nombre' }, // propiedad prohibida nombre_completo
        { creado_en: '2026-01-01' }, // propiedad prohibida creado_en
        { actualizado_en: '2026-01-01' }, // propiedad prohibida actualizado_en
        { matricula: 'M'.repeat(65) }, // excede 64
        { puesto: 'P'.repeat(161) }, // excede 160
        { turno: 'T'.repeat(61) }, // excede 60
        { jornada: 'J'.repeat(81) }, // excede 80
        { horario: 'H'.repeat(121) }, // excede 120
        { observaciones: 'O'.repeat(2001) }, // excede 2000
        { vigente_desde: null }, // vigente_desde no puede ser null
        { vigente_desde: '2026-02-30' }, // fecha calendario inexistente
        { vigente_hasta: '2025-12-31' }, // anterior al vigente_desde actual (2026-01-01 de 5001)
        { vigente_desde: '2026-10-10', vigente_hasta: '2026-10-01' }, // hasta < desde
        { activo: 'true' }, // booleano no estricto (string)
        { activo: 1 }, // booleano no estricto (number)
        { activo: null }, // booleano null
      ];

      for (const badBody of badPayloads) {
        const res = createMockRes();
        await controller.updateAdscripcionLaboralPorUnidad(
          {
            user: { sub: AUTH_USER_UUID },
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: { unidadId: '10', adscripcionId: '5001' },
            body: badBody,
          },
          res
        );
        assert.equal(
          res.statusCode,
          400,
          `Payload inválido ${JSON.stringify(badBody)} debe devolver 400 (recibió ${res.statusCode})`
        );
      }
      assert.equal(txAuditLogs.length, 0);
      passed++;
    }

    // 37 (Requisitos 16, 17, 21 y 22 de RH-2B.4E): Detección de conflictos con otras adscripciones (409), protección de referencias históricas en rh_lista_asistencia (409), rollback si falla auditoría (500) y serialización concurrente
    {
      resetTxState();

      // A) Conflicto con otra adscripción de la misma persona (persona 101 tiene adscripción activa 5001 desde 2026-01-01; agregamos una histórica inactiva 5900 del 2025-01-01 al 2025-06-30)
      txAdscripciones.push({
        id: 5900,
        persona_id: 101,
        unidad_medica_id: 10,
        matricula: 'MAT-1001-ANT',
        puesto: 'Médico General',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '07:00 - 15:00',
        vigente_desde: '2025-01-01',
        vigente_hasta: '2025-06-30',
        activo: false,
        observaciones: 'Periodo previo',
      });

      // Intentar activar la adscripción histórica 5900 mientras 5001 está activa -> 409
      const resDupActive = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5900' },
          body: { activo: true },
        },
        resDupActive
      );
      assert.equal(resDupActive.statusCode, 409);

      // Intentar cambiar vigente_desde de 5001 a '2025-05-01' para que se solape con 5900 -> 409
      const resOverlapVigencia = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { vigente_desde: '2025-05-01' },
        },
        resOverlapVigencia
      );
      assert.equal(resOverlapVigencia.statusCode, 409);

      // B) Protección de referencias históricas en rh_lista_asistencia:
      // Simulamos que la adscripción 5001 tiene una lista de asistencia en el periodo 2026-03-01 a 2026-03-15 en estado 'EN_CAPTURA'
      txListasAsistencia.push({
        id: 9001,
        adscripcion_laboral_id: 5001,
        estado: 'EN_CAPTURA',
        fecha_inicio: '2026-03-01',
        fecha_fin: '2026-03-15',
      });

      // 1) Mover vigente_desde a '2026-04-01' (posterior al inicio de la lista 2026-03-01) -> 409
      const resHistDesde = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { vigente_desde: '2026-04-01' },
        },
        resHistDesde
      );
      assert.equal(resHistDesde.statusCode, 409);

      // 2) Recortar vigente_hasta a '2026-02-28' (anterior al fin de la lista 2026-03-15) -> 409
      const resHistHasta = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { vigente_hasta: '2026-02-28' },
        },
        resHistHasta
      );
      assert.equal(resHistHasta.statusCode, 409);

      // 3) Desactivar adscripción (activo: false) mientras tiene lista en captura -> 409
      const resHistDeactivate = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { activo: false },
        },
        resHistDeactivate
      );
      assert.equal(resHistDeactivate.statusCode, 409);

      // C) Rollback completo si falla la inserción en app_audit_logs (500)
      resetTxState();
      failOnTxSql = 'INSERT INTO public.app_audit_logs';
      const resAuditFail = createMockRes();
      await controller.updateAdscripcionLaboralPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { puesto: 'Puesto que debe revertirse' },
        },
        resAuditFail
      );
      assert.equal(resAuditFail.statusCode, 500);
      const rowAfterRollback = txAdscripciones.find((a) => a.id === 5001);
      assert.equal(rowAfterRollback.puesto, 'Médico Especialista A', 'El rollback debe revertir el UPDATE si falla la auditoría');

      // D) Concurrencia: dos ediciones simultáneas para activar dos adscripciones inactivas de la misma persona solo permiten una
      resetTxState();
      txAdscripciones = [
        {
          id: 5001,
          persona_id: 101,
          unidad_medica_id: 10,
          matricula: 'MAT-1001',
          puesto: 'Puesto 1',
          turno: 'MATUTINO',
          jornada: '8 HORAS',
          horario: '07:00 - 15:00',
          vigente_desde: '2025-01-01',
          vigente_hasta: '2025-06-30',
          activo: false,
          observaciones: null,
        },
        {
          id: 5900,
          persona_id: 101,
          unidad_medica_id: 10,
          matricula: 'MAT-1001',
          puesto: 'Puesto 2',
          turno: 'MATUTINO',
          jornada: '8 HORAS',
          horario: '07:00 - 15:00',
          vigente_desde: '2026-01-01',
          vigente_hasta: null,
          activo: false,
          observaciones: null,
        },
      ];

      const concurrentActivate1 = () =>
        service.updateAdscripcionLaboral(
          { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          10,
          5001,
          { activo: true },
          { userId: AUTH_USER_UUID }
        );
      const concurrentActivate2 = () =>
        service.updateAdscripcionLaboral(
          { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          10,
          5900,
          { activo: true },
          { userId: AUTH_USER_UUID }
        );

      const outcomes = await Promise.allSettled([concurrentActivate1(), concurrentActivate2()]);
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.status, 409);
      passed++;
    }

    // =========================================================================
    // SUITE RH-2B.4G.1 (POST /api/rh/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores)
    // =========================================================================

    // 38 (Requisitos 2, 3, 4, 5, 6 y 16 de RH-2B.4G.1): Autorización estricta de revelación sensible y verificación de que operaciones denegadas NO consultan RFC/CURP
    {
      const revealLayer = rhRouter.stack.find(
        (l) =>
          l.route &&
          l.route.path === '/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores' &&
          l.route.methods.post
      );
      assert.ok(
        revealLayer,
        'Debe existir POST /unidades/:unidadId/personal/:adscripcionId/revelar-identificadores en rhRouter'
      );
      assert.equal(revealLayer.route.stack.length, 3);
      assert.equal(revealLayer.route.stack[0].name, 'requireAuth');

      resetTxState();
      capturedQueries = [];

      // 6. Sin autenticación (sin req.user.sub) -> 401
      const resNoAuth = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: {},
        },
        resNoAuth
      );
      assert.equal(resNoAuth.statusCode, 401);

      // 4. Otro rol GLOBAL sin RH (p. ej. ABASTO GLOBAL -> resolveRhAccess devuelve null -> sin rhAccess) -> 403
      const nonRhAccess = resolveRhAccess([{ code: 'ABASTO', scope: 'GLOBAL', id: null }]);
      assert.equal(nonRhAccess, null);
      const resNonRh = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: {},
        },
        resNonRh
      );
      assert.equal(resNonRh.statusCode, 403);

      // 2. RECURSOS_HUMANOS CLUES recibe 403 incluso en su propia unidad autorizada (unidad 10)
      const resRhClues = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: {},
        },
        resRhClues
      );
      assert.equal(resRhClues.statusCode, 403);

      // 3. ADMIN_TIC GLOBAL sin rol RECURSOS_HUMANOS GLOBAL recibe 403
      const resAdminTicOnly = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: {},
        },
        resAdminTicOnly
      );
      assert.equal(resAdminTicOnly.statusCode, 403);

      // 16. Ninguna de las operaciones denegadas abrió conexión ni consultó RFC/CURP
      assert.equal(txEvents.length, 0);
      assert.equal(capturedQueries.length, 0);
      assert.equal(txAuditLogs.length, 0);
      passed++;
    }

    // 39 (Requisitos 1, 5, 11, 12, 13 y 14 de RH-2B.4G.1): RECURSOS_HUMANOS GLOBAL (y cuenta combinada ADMIN_TIC GLOBAL + RH GLOBAL) obtiene RFC/CURP reales o null, con Cache-Control: no-store y auditoría sin valores sensibles
    {
      resetTxState();

      // 1. RECURSOS_HUMANOS GLOBAL revela identificadores de adscripción 5001 (persona 101: Dra. Ana Gómez)
      const reqReveal5001 = {
        user: { sub: AUTH_USER_UUID },
        rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
        params: { unidadId: '10', adscripcionId: '5001' },
        ip: '192.168.1.50',
        get: (h) => (h === 'User-Agent' ? 'Mozilla/5.0 RevealTest' : undefined),
        body: {},
      };
      const resReveal5001 = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(reqReveal5001, resReveal5001);

      assert.equal(resReveal5001.statusCode, 200);
      assert.equal(resReveal5001.headers['cache-control'], 'no-store');
      assert.deepEqual(resReveal5001.body, {
        persona_id: 101,
        rfc: 'GOMA800101ABC',
        curp: 'GOMA800101MDFR0001',
      });

      // 13 y 14. Verificar auditoría obligatoria en public.app_audit_logs y que NO contenga los valores de RFC ni CURP
      assert.equal(txAuditLogs.length, 1);
      assert.deepEqual(txAuditLogs[0], {
        user_id: AUTH_USER_UUID,
        action: 'RH_REVEAL_SENSITIVE_IDS',
        resource: 'rh_adscripcion_laboral:5001',
        ip: '192.168.1.50',
        user_agent: 'Mozilla/5.0 RevealTest',
        payload: {
          adscripcion_laboral_id: 5001,
          persona_id: 101,
          unidad_medica_id: 10,
          campos_revelados: ['rfc', 'curp'],
        },
      });
      const rawAuditStr = JSON.stringify(txAuditLogs[0]);
      assert.equal(rawAuditStr.includes('GOMA800101ABC'), false);
      assert.equal(rawAuditStr.includes('GOMA800101MDFR0001'), false);

      // 5 y 11. Cuenta que combina ADMIN_TIC GLOBAL + RECURSOS_HUMANOS GLOBAL revela adscripción 5002 (persona 102 con rfc: null y curp: null)
      const combinedAccess = resolveRhAccess([
        { code: 'ADMIN_TIC', scope: 'GLOBAL', id: null },
        { code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null },
      ]);
      assert.deepEqual(combinedAccess, {
        scope: 'GLOBAL',
        clues: [],
        grantedBy: 'RECURSOS_HUMANOS',
      });

      const resReveal5002 = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: combinedAccess,
          params: { unidadId: '10', adscripcionId: '5002' },
          body: {},
        },
        resReveal5002
      );
      assert.equal(resReveal5002.statusCode, 200);
      assert.equal(resReveal5002.headers['cache-control'], 'no-store');
      assert.deepEqual(resReveal5002.body, {
        persona_id: 102,
        rfc: null,
        curp: null,
      });
      assert.equal(txAuditLogs.length, 2);
      passed++;
    }

    // 40 (Requisitos 7, 8, 9, 10 y 15 de RH-2B.4G.1): Parámetros inválidos (400), body con propiedades adicionales (400), adscripción inexistente (404), adscripción de otra unidad (404 sin revelar) y fallo de auditoría con rollback (500 sin devolver identificadores)
    {
      resetTxState();

      // 7. Parámetros inválidos en URL -> 400
      for (const badParams of [
        { unidadId: 'abc', adscripcionId: '5001' },
        { unidadId: '0', adscripcionId: '5001' },
        { unidadId: '10', adscripcionId: 'xyz' },
        { unidadId: '10', adscripcionId: '-1' },
      ]) {
        const resBadParam = createMockRes();
        await controller.revelarIdentificadoresPorUnidad(
          {
            user: { sub: AUTH_USER_UUID },
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: badParams,
            body: {},
          },
          resBadParam
        );
        assert.equal(resBadParam.statusCode, 400);
      }

      // 8. Body con propiedades adicionales o no objeto vacío -> 400
      for (const badBody of [
        { persona_id: 101 },
        { user_id: AUTH_USER_UUID },
        { rfc: 'GOMA800101ABC' },
        { curp: 'GOMA800101MDFR0001' },
        { extra: true },
        [],
        null,
      ]) {
        const resBadBody = createMockRes();
        await controller.revelarIdentificadoresPorUnidad(
          {
            user: { sub: AUTH_USER_UUID },
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: { unidadId: '10', adscripcionId: '5001' },
            body: badBody,
          },
          resBadBody
        );
        assert.equal(resBadBody.statusCode, 400);
      }
      assert.equal(txEvents.length, 0, 'Requests 400 no deben abrir conexión transaccional');

      // 9. Adscripción inexistente (99999) -> 404 con ROLLBACK y sin auditoría
      const resNotFound = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '99999' },
          body: {},
        },
        resNotFound
      );
      assert.equal(resNotFound.statusCode, 404);
      assert.equal(txAuditLogs.length, 0);

      // 10. Adscripción perteneciente a otra unidad (5003 es de unidad 20, solicitada bajo unidad 10) -> 404 sin revelar RFC/CURP
      const resOtherUnit = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5003' },
          body: {},
        },
        resOtherUnit
      );
      assert.equal(resOtherUnit.statusCode, 404);
      assert.equal(JSON.stringify(resOtherUnit.body).includes('RUIC790404'), false);
      assert.equal(txAuditLogs.length, 0);

      // 15. Si falla el INSERT en public.app_audit_logs -> ROLLBACK, responde 500 y NO devuelve los identificadores completos
      resetTxState();
      failOnTxSql = 'INSERT INTO public.app_audit_logs';
      const resAuditFail = createMockRes();
      await controller.revelarIdentificadoresPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: {},
        },
        resAuditFail
      );
      assert.equal(resAuditFail.statusCode, 500);
      assert.equal(JSON.stringify(resAuditFail.body).includes('GOMA800101ABC'), false);
      assert.equal(JSON.stringify(resAuditFail.body).includes('GOMA800101MDFR0001'), false);
      assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
      assert.equal(txAuditLogs.length, 0);
      passed++;
    }

    // =========================================================================
    // SUITE RH-2B.4G.2 (PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/identificacion)
    // =========================================================================

    // 41 (Requisitos 4, 5, 6, 7 y 8 de RH-2B.4G.2): Ruta PATCH /identificacion protegida; 401 sin usuario, 403 para RH CLUES y ADMIN_TIC GLOBAL sin RH, y 404 para adscripción inexistente o ajena
    {
      const patchIdLayer = rhRouter.stack.find(
        (l) =>
          l.route &&
          l.route.path === '/unidades/:unidadId/personal/:adscripcionId/identificacion' &&
          l.route.methods.patch
      );
      assert.ok(
        patchIdLayer,
        'Debe existir PATCH /unidades/:unidadId/personal/:adscripcionId/identificacion en rhRouter'
      );
      assert.equal(patchIdLayer.route.stack.length, 3);
      assert.equal(patchIdLayer.route.stack[0].name, 'requireAuth');

      resetTxState();
      capturedQueries = [];

      // 7. Usuario no autenticado -> 401
      const resNoAuth = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { rfc: 'GOMA800101ZZ9' },
        },
        resNoAuth
      );
      assert.equal(resNoAuth.statusCode, 401);

      // 4. RH CLUES no edita identificación (recibe 403 incluso en su propia unidad 10)
      const resClues = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { rfc: 'GOMA800101ZZ9' },
        },
        resClues
      );
      assert.equal(resClues.statusCode, 403);

      // 5. ADMIN_TIC GLOBAL sin RH GLOBAL recibe 403
      const resAdminTic = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { rfc: 'GOMA800101ZZ9' },
        },
        resAdminTic
      );
      assert.equal(resAdminTic.statusCode, 403);
      assert.equal(txEvents.length, 0, 'Operadores sin permiso no deben abrir transacción');

      // 8. Adscripción inexistente (99999) o perteneciente a otra unidad (5003 de unidad 20 consultada bajo unidad 10) -> 404
      for (const wrongAdsId of ['99999', '5003']) {
        const res404 = createMockRes();
        await controller.updateIdentificacionPersonalPorUnidad(
          {
            user: { sub: AUTH_USER_UUID },
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: { unidadId: '10', adscripcionId: wrongAdsId },
            body: { rfc: 'GOMA800101ZZ9' },
          },
          res404
        );
        assert.equal(res404.statusCode, 404);
      }
      assert.equal(txAuditLogs.length, 0);
      passed++;
    }

    // 42 (Requisitos 1, 2, 3, 6, 9, 10, 11, 12, 19, 20, 21, 22, 23, 24, 26, 27 y 28 de RH-2B.4G.2): Edición parcial de RFC, CURP, nombres/apellidos y nombre_completo sin heurísticas; normalización de vacíos/null; enmascaramiento en respuesta; Cache-Control: no-store y auditoría limpia
    {
      resetTxState();

      // A) RH GLOBAL (incluyendo cuenta combinada ADMIN_TIC GLOBAL + RH GLOBAL) edita RFC, CURP, nombres y apellidos en adscripción 5001 (persona 101)
      const combinedAccess = resolveRhAccess([
        { code: 'ADMIN_TIC', scope: 'GLOBAL', id: null },
        { code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null },
      ]);

      const reqUpdate5001 = {
        user: { sub: AUTH_USER_UUID },
        rhAccess: combinedAccess,
        params: { unidadId: '10', adscripcionId: '5001' },
        ip: '10.10.1.99',
        get: (h) => (h === 'User-Agent' ? 'Mozilla/5.0 IdPatchTest' : undefined),
        body: {
          nombres: '  Ana   María  ',
          apellidos: '  Gómez   López  ',
          rfc: '  gola800101xy9  ',
          curp: '  gola800101mdfrpn08  ',
        },
      };
      const resUpdate5001 = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(reqUpdate5001, resUpdate5001);

      assert.equal(resUpdate5001.statusCode, 200);
      assert.equal(resUpdate5001.headers['cache-control'], 'no-store');
      assert.deepEqual(resUpdate5001.body, {
        unidad: { id: 10, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB000001' },
        personal: {
          persona_id: 101,
          nombre_completo: 'Ana María Gómez López', // sincronizado con trigger t_persona_nombre
          nombres: 'Ana María',
          apellidos: 'Gómez López',
          tiene_rfc: true,
          rfc_masked: '**********XY9',
          tiene_curp: true,
          curp_masked: '****************08',
          activo: true,
        },
        campos_modificados: ['nombres', 'apellidos', 'nombre_completo', 'rfc', 'curp'],
      });

      // 27. Nunca devuelve RFC ni CURP completos en la respuesta del PATCH
      const rawBody5001 = JSON.stringify(resUpdate5001.body);
      assert.equal(rawBody5001.includes('GOLA800101XY9'), false);
      assert.equal(rawBody5001.includes('GOLA800101MDFRPN08'), false);

      // 21 y 22. Verificar que no se modificó persona.unidad_medica_id ni rh_adscripcion_laboral
      const updatedPersona101 = txPersonas.find((p) => p.id === 101);
      assert.equal(updatedPersona101.unidad_medica_id, 10);
      assert.equal(updatedPersona101.correo_principal, 'ana@imssb.gob.mx');
      assert.equal(updatedPersona101.rfc, 'GOLA800101XY9');
      assert.equal(updatedPersona101.curp, 'GOLA800101MDFRPN08');

      // 23 y 24. Verificar auditoría en app_audit_logs (solo nombres de campos e IDs, sin valores sensibles)
      assert.equal(txAuditLogs.length, 1);
      assert.deepEqual(txAuditLogs[0], {
        user_id: AUTH_USER_UUID,
        action: 'RH_UPDATE_PERSONA_IDENTIFICACION',
        resource: 'persona:101',
        ip: '10.10.1.99',
        user_agent: 'Mozilla/5.0 IdPatchTest',
        payload: {
          adscripcion_laboral_id: 5001,
          persona_id: 101,
          unidad_medica_id: 10,
          campos_modificados: ['nombres', 'apellidos', 'nombre_completo', 'rfc', 'curp'],
        },
      });
      const rawAudit = JSON.stringify(txAuditLogs[0]);
      assert.equal(rawAudit.includes('GOLA800101XY9'), false);
      assert.equal(rawAudit.includes('GOLA800101MDFRPN08'), false);
      assert.equal(rawAudit.includes('Ana María'), false);

      // 26. Enviar nuevamente los mismos valores no genera UPDATE ni nueva fila de auditoría
      const resNoOp = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(reqUpdate5001, resNoOp);
      assert.equal(resNoOp.statusCode, 200);
      assert.deepEqual(resNoOp.body.campos_modificados, []);
      assert.equal(txAuditLogs.length, 1);

      // B) 9, 10, 11 y 12. PATCH parcial: enviar `rfc: ""` y `curp: null` limpia explícitamente los identificadores a SQL NULL sin alterar nombres ni apellidos omitidos
      const resClearIds = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { rfc: '   ', curp: null },
        },
        resClearIds
      );
      assert.equal(resClearIds.statusCode, 200);
      assert.equal(resClearIds.body.personal.nombres, 'Ana María');
      assert.equal(resClearIds.body.personal.apellidos, 'Gómez López');
      assert.equal(resClearIds.body.personal.tiene_rfc, false);
      assert.equal(resClearIds.body.personal.rfc_masked, null);
      assert.equal(resClearIds.body.personal.tiene_curp, false);
      assert.equal(resClearIds.body.personal.curp_masked, null);
      assert.deepEqual(resClearIds.body.campos_modificados, ['rfc', 'curp']);

      // C) 20. Registro legado con solo `nombre_completo` (persona 102 en adscripción 5002 tiene `nombres: null, apellidos: null`):
      // permite actualizar `nombre_completo` directamente sin dividirlo mediante heurísticas
      const resLegacyName = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5002' },
          body: { nombre_completo: '  Enf. Luis Alberto Pérez  ' },
        },
        resLegacyName
      );
      assert.equal(resLegacyName.statusCode, 200);
      assert.equal(resLegacyName.body.personal.nombre_completo, 'Enf. Luis Alberto Pérez');
      assert.equal(resLegacyName.body.personal.nombres, null);
      assert.equal(resLegacyName.body.personal.apellidos, null);
      assert.deepEqual(resLegacyName.body.campos_modificados, ['nombre_completo']);
      passed++;
    }

    // 43 (Requisitos 13, 14, 15, 16, 17, 18 y 25 de RH-2B.4G.2): Rechazo de máscaras con asteriscos, RFC/CURP inválidos, body vacío o propiedades prohibidas (400); detección de RFC/CURP duplicados (409 sin revelar propietario); y rollback si falla auditoría (500)
    {
      resetTxState();

      const invalidPayloads = [
        {}, // body vacío
        { rfc: '**********ABC' }, // máscara con asteriscos
        { curp: '****************01' }, // máscara con asteriscos
        { rfc: 'GOMA8001*1ABC' }, // asterisco parcial
        { rfc: 'INVALIDO123' }, // formato RFC inválido
        { rfc: 'GOMA800230ABC' }, // fecha imposible (30 de febrero) en RFC
        { rfc: 'GOM800101ABC' }, // 12 caracteres (persona moral no permitida para trabajador físico)
        { curp: 'GOMA800101MDFR01' }, // 16 caracteres (longitud distinta de 18)
        { curp: 'GOMA800231MDFR0001' }, // fecha imposible (31 de febrero) en CURP
        { nombres: null, apellidos: null }, // intento de borrar simultáneamente nombres y apellidos en persona 101 que ya los tenía
        { nombres: 'Ana', nombre_completo: 'Nombre Inconsistente Con Trigger' }, // discrepancia con trigger t_persona_nombre
        { nombre_completo: '' }, // nombre_completo vacío
        { nombre_completo: null }, // nombre_completo null
        { nombres: 'N'.repeat(151) }, // excede 150
        { apellidos: 'A'.repeat(151) }, // excede 150
        { persona_id: 999, rfc: 'GOMA800101ABC' }, // propiedad prohibida persona_id
        { unidad_medica_id: 20 }, // propiedad prohibida unidad_medica_id
        { correo_principal: 'otro@imssb.gob.mx' }, // propiedad prohibida correo_principal
        { activo: false }, // propiedad prohibida activo
      ];

      for (const badBody of invalidPayloads) {
        const resBad = createMockRes();
        await controller.updateIdentificacionPersonalPorUnidad(
          {
            user: { sub: AUTH_USER_UUID },
            rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
            params: { unidadId: '10', adscripcionId: '5001' },
            body: badBody,
          },
          resBad
        );
        assert.equal(
          resBad.statusCode,
          400,
          `Payload inválido ${JSON.stringify(badBody)} debe devolver 400 (recibió ${resBad.statusCode})`
        );
      }

      // 16, 17 y 18. RFC duplicado o CURP duplicada (pertenecientes a persona 104: RUIC790404ZZ9 / RUIC790404HDFR0004) -> 409 sin revelar propietario ni valor
      const resDupRfc = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { rfc: 'RUIC790404ZZ9' },
        },
        resDupRfc
      );
      assert.equal(resDupRfc.statusCode, 409);
      assert.equal(JSON.stringify(resDupRfc.body).includes('Carlos'), false);
      assert.equal(JSON.stringify(resDupRfc.body).includes('104'), false);
      assert.equal(JSON.stringify(resDupRfc.body).includes('RUIC790404ZZ9'), false);

      const resDupCurp = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { curp: 'RUIC790404HDFR0004' },
        },
        resDupCurp
      );
      assert.equal(resDupCurp.statusCode, 409);
      assert.equal(JSON.stringify(resDupCurp.body).includes('Carlos'), false);
      assert.equal(JSON.stringify(resDupCurp.body).includes('RUIC790404HDFR0004'), false);

      // 25. Si falla la inserción en public.app_audit_logs -> ROLLBACK completo revirtiendo la modificación en public.persona
      resetTxState();
      failOnTxSql = 'INSERT INTO public.app_audit_logs';
      const resAuditFail = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { rfc: 'GOMA800101ZZ9' },
        },
        resAuditFail
      );
      assert.equal(resAuditFail.statusCode, 500);
      assert.equal(
        txPersonas.find((p) => p.id === 101).rfc,
        'GOMA800101ABC',
        'El rollback debe revertir el UPDATE de public.persona si falla la auditoría'
      );
      assert.ok(txEvents.some((e) => e.sql === 'ROLLBACK'));
      passed++;
    }

    // 44 (Verificación RH-2B.4G.2A - Escenarios 1 a 8): PATCH parcial respeta el trigger real t_persona_nombre (BEFORE INSERT OR UPDATE OF nombres, apellidos) sin sobrescribir ni auditar campos ajenos
    {
      resetTxState();

      // Escenario 1: Cambiar solamente RFC en registro estructurado (persona 101: nombres='Ana', apellidos='Gómez', nombre_completo='Dra. Ana Gómez')
      // conserva nombres, apellidos, CURP y nombre_completo, y audita únicamente ['rfc']
      const resOnlyRfc = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { rfc: 'GOMA800101ZZ9' },
        },
        resOnlyRfc
      );
      assert.equal(resOnlyRfc.statusCode, 200);
      assert.equal(resOnlyRfc.body.personal.nombres, 'Ana');
      assert.equal(resOnlyRfc.body.personal.apellidos, 'Gómez');
      assert.equal(resOnlyRfc.body.personal.nombre_completo, 'Dra. Ana Gómez');
      assert.equal(resOnlyRfc.body.personal.curp_masked, '****************01');
      assert.equal(resOnlyRfc.body.personal.rfc_masked, '**********ZZ9');
      assert.deepEqual(resOnlyRfc.body.campos_modificados, ['rfc']);
      assert.deepEqual(txAuditLogs[txAuditLogs.length - 1].payload.campos_modificados, ['rfc']);

      // Verificar que el UPDATE SQL ejecutado solo incluyó `SET rfc = $1`
      const lastUpdateRfcEvent = [...txEvents]
        .reverse()
        .find((e) => /^UPDATE public\.persona/i.test(e.sql));
      assert.ok(lastUpdateRfcEvent);
      assert.match(
        lastUpdateRfcEvent.sql,
        /^UPDATE public\.persona SET rfc = \$1 WHERE id = \$2/i
      );

      // Escenario 2: Cambiar solamente CURP conserva RFC, nombres, apellidos y nombre_completo, y audita únicamente ['curp']
      const resOnlyCurp = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { curp: 'GOMA800101MDFR0099' },
        },
        resOnlyCurp
      );
      assert.equal(resOnlyCurp.statusCode, 200);
      assert.equal(resOnlyCurp.body.personal.nombres, 'Ana');
      assert.equal(resOnlyCurp.body.personal.apellidos, 'Gómez');
      assert.equal(resOnlyCurp.body.personal.nombre_completo, 'Dra. Ana Gómez');
      assert.equal(resOnlyCurp.body.personal.rfc_masked, '**********ZZ9');
      assert.equal(resOnlyCurp.body.personal.curp_masked, '****************99');
      assert.deepEqual(resOnlyCurp.body.campos_modificados, ['curp']);

      // Escenario 3: Cambiar nombres o apellidos recalcula nombre_completo adecuadamente en armonía con t_persona_nombre
      const resChangeNombres = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5001' },
          body: { nombres: 'Ana Sofía' },
        },
        resChangeNombres
      );
      assert.equal(resChangeNombres.statusCode, 200);
      assert.equal(resChangeNombres.body.personal.nombres, 'Ana Sofía');
      assert.equal(resChangeNombres.body.personal.apellidos, 'Gómez');
      assert.equal(resChangeNombres.body.personal.nombre_completo, 'Ana Sofía Gómez');
      assert.equal(resChangeNombres.body.personal.rfc_masked, '**********ZZ9');
      assert.equal(resChangeNombres.body.personal.curp_masked, '****************99');
      assert.deepEqual(resChangeNombres.body.campos_modificados, ['nombres', 'nombre_completo']);

      // Escenario 4: Registro legado con nombres = NULL y apellidos = NULL (persona 102 en adscripción 5002: nombre_completo='Enf. Luis Pérez')
      // permite actualizar RFC y CURP sin perder nombre_completo
      const resLegacyIds = createMockRes();
      await controller.updateIdentificacionPersonalPorUnidad(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' },
          params: { unidadId: '10', adscripcionId: '5002' },
          body: { rfc: 'PERL850505AB1', curp: 'PERL850505HDFR0005' },
        },
        resLegacyIds
      );
      assert.equal(resLegacyIds.statusCode, 200);
      assert.equal(resLegacyIds.body.personal.nombre_completo, 'Enf. Luis Pérez');
      assert.equal(resLegacyIds.body.personal.nombres, null);
      assert.equal(resLegacyIds.body.personal.apellidos, null);
      assert.equal(resLegacyIds.body.personal.rfc_masked, '**********AB1');
      assert.equal(resLegacyIds.body.personal.curp_masked, '****************05');
      assert.deepEqual(resLegacyIds.body.campos_modificados, ['rfc', 'curp']);
      passed++;
    }

    // =========================================================================
    // SUITE RH-2C.2 (GET /api/rh/mi-contexto — Autogestión del empleado autenticado)
    // =========================================================================

    const MOCK_TODAY_ISO = '2026-11-18';

    const MOCK_EMPLOYEES_PERSONAS = [
      ...MOCK_PERSONAS,
      {
        id: 106,
        nombre_completo: 'Mtro. Jorge Mendoza',
        nombres: 'Jorge',
        apellidos: 'Mendoza',
        cargo: 'Analista Central',
        unidad_medica_id: 177, // OFICINA CENTRAL (cluesimb = 'N/A')
        activo: true,
        rfc: 'MENJ820808KL1',
        curp: 'MENJ820808HDFR0006',
        correo_principal: 'jorge@imssb.gob.mx',
        user_id: '99999999-9999-4999-8999-999999999999', // Columna legada persona.user_id que NUNCA debe usarse
      },
      {
        id: 107,
        nombre_completo: 'Dra. Elena Castro',
        nombres: 'Elena',
        apellidos: 'Castro',
        cargo: 'Médica General',
        unidad_medica_id: 20,
        activo: true,
        rfc: 'CASE880909MN2',
        curp: 'CASE880909MDFR0007',
        correo_principal: 'elena@imssb.gob.mx',
      },
      {
        id: 108,
        nombre_completo: 'Dr. Roberto Vega',
        nombres: 'Roberto',
        apellidos: 'Vega',
        cargo: 'Médico Internista',
        unidad_medica_id: 30,
        activo: true,
        rfc: 'VEGR750101PQ3',
        curp: 'VEGR750101HDFR0008',
        correo_principal: 'roberto@imssb.gob.mx',
      },
    ];

    const UUID_EMP_VIGENTE = '11111111-1111-4111-8111-111111111101'; // persona 101 (con adscripción vigente + histórica)
    const UUID_EMP_OFICINA_CENTRAL_SIN_ADS = '11111111-1111-4111-8111-111111111106'; // persona 106 (OFICINA CENTRAL id=177, sin adscripción RH)
    const UUID_EMP_SOLO_HISTORICA = '11111111-1111-4111-8111-111111111107'; // persona 107 (solo adscripción histórica/vencida)
    const UUID_EMP_SOLO_FUTURA = '11111111-1111-4111-8111-111111111108'; // persona 108 (solo adscripción futura)
    const UUID_EMP_PERSONA_INACTIVA = '11111111-1111-4111-8111-111111111105'; // persona 105 (persona.activo = false)
    const UUID_USER_INACTIVO = '11111111-1111-4111-8111-111111111190'; // status = 'SUSPENDED'
    const UUID_CUENTA_TECNICA_SIN_PERSONA = '11111111-1111-4111-8111-111111111191'; // persona_id = null (ej. cuenta técnica ADMIN_TIC GLOBAL)
    const UUID_USER_INEXISTENTE = '11111111-1111-4111-8111-111111111199';

    const MOCK_APP_USERS = new Map([
      [UUID_EMP_VIGENTE, { id: UUID_EMP_VIGENTE, status: 'ACTIVE', persona_id: 101 }],
      [UUID_EMP_OFICINA_CENTRAL_SIN_ADS, { id: UUID_EMP_OFICINA_CENTRAL_SIN_ADS, status: 'ACTIVE', persona_id: 106 }],
      [UUID_EMP_SOLO_HISTORICA, { id: UUID_EMP_SOLO_HISTORICA, status: 'ACTIVE', persona_id: 107 }],
      [UUID_EMP_SOLO_FUTURA, { id: UUID_EMP_SOLO_FUTURA, status: 'ACTIVE', persona_id: 108 }],
      [UUID_EMP_PERSONA_INACTIVA, { id: UUID_EMP_PERSONA_INACTIVA, status: 'ACTIVE', persona_id: 105 }],
      [UUID_USER_INACTIVO, { id: UUID_USER_INACTIVO, status: 'SUSPENDED', persona_id: 101 }],
      [UUID_CUENTA_TECNICA_SIN_PERSONA, { id: UUID_CUENTA_TECNICA_SIN_PERSONA, status: 'ACTIVE', persona_id: null }],
    ]);

    const MOCK_EMPLOYEE_ADSCRIPCIONES = [
      // Persona 101: tiene 1 adscripción vigente (5001), 1 histórica inactiva (5010) y 1 futura (5011)
      {
        id: 5001,
        persona_id: 101,
        unidad_medica_id: 10,
        matricula: 'MAT-1001',
        puesto: 'Médico Especialista A',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '07:00 - 15:00',
        vigente_desde: '2026-01-01',
        vigente_hasta: null,
        activo: true,
        observaciones: 'Base federalizada',
      },
      {
        id: 5010,
        persona_id: 101,
        unidad_medica_id: 177,
        matricula: 'MAT-1001-HIST',
        puesto: 'Comisión Administrativa',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '08:00 - 16:00',
        vigente_desde: '2025-01-01',
        vigente_hasta: '2025-12-31',
        activo: false,
        observaciones: 'Comisión concluida',
      },
      {
        id: 5011,
        persona_id: 101,
        unidad_medica_id: 20,
        matricula: 'MAT-1001-FUT',
        puesto: 'Adscripción Programada 2027',
        turno: 'VESPERTINO',
        jornada: '8 HORAS',
        horario: '14:00 - 21:30',
        vigente_desde: '2027-01-01',
        vigente_hasta: null,
        activo: true,
        observaciones: 'Cambio programado',
      },
      // Persona 107: solo tiene una adscripción con activo=true pero vigente_hasta vencida ('2026-06-30' < '2026-11-18')
      {
        id: 5020,
        persona_id: 107,
        unidad_medica_id: 20,
        matricula: 'MAT-1070',
        puesto: 'Médica General Interina',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '07:00 - 15:00',
        vigente_desde: '2026-01-01',
        vigente_hasta: '2026-06-30',
        activo: true,
        observaciones: 'Interinato concluido',
      },
      // Persona 108: solo tiene una adscripción futura ('2026-12-01' > '2026-11-18')
      {
        id: 5030,
        persona_id: 108,
        unidad_medica_id: 30,
        matricula: 'MAT-1080',
        puesto: 'Médico Internista',
        turno: 'MATUTINO',
        jornada: '8 HORAS',
        horario: '07:00 - 15:00',
        vigente_desde: '2026-12-01',
        vigente_hasta: null,
        activo: true,
        observaciones: 'Alta próxima quincena',
      },
      // Persona 104 (otro trabajador, jamás debe filtrarse al consultar 101, 106, 107 o 108)
      {
        id: 5003,
        persona_id: 104,
        unidad_medica_id: 20,
        matricula: 'MAT-2004',
        puesto: 'Urgenciólogo',
        turno: 'NOCTURNO',
        jornada: 'ACUMULADA',
        horario: '20:00 - 08:00',
        vigente_desde: '2026-01-15',
        vigente_hasta: null,
        activo: true,
        observaciones: 'Guardia nocturna',
      },
    ];

    const prevQueryBefore2C2 = pool.query;
    pool.query = async (sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      capturedQueries.push({ sql: normalized, params });

      // Prohibir estrictamente cualquier sentencia de escritura en RH-2C.2
      assert.equal(
        /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(normalized),
        false,
        `Sentencia de escritura no permitida en RH-2C.2: ${normalized}`
      );

      // Verificar que NUNCA se utilice la columna legada persona.user_id
      assert.equal(
        /\bp\.user_id\b/i.test(normalized),
        false,
        `No se debe utilizar p.user_id en consultas de identidad RH: ${normalized}`
      );

      if (/FROM public\.app_users u LEFT JOIN public\.persona p ON p\.id = u\.persona_id LEFT JOIN public\.unidad_medica um ON um\.id = p\.unidad_medica_id WHERE u\.id = \$1 LIMIT 1/i.test(normalized)) {
        const uid = String(params[0]);
        const u = MOCK_APP_USERS.get(uid);
        if (!u) return { rows: [], rowCount: 0 };
        const p = u.persona_id != null
          ? MOCK_EMPLOYEES_PERSONAS.find((per) => per.id === u.persona_id) ?? null
          : null;
        const um = p && p.unidad_medica_id != null
          ? MOCK_UNIDADES.get(p.unidad_medica_id) ?? null
          : null;

        return {
          rows: [
            {
              user_id: u.id,
              user_status: u.status,
              user_persona_id: u.persona_id,
              persona_id: p ? p.id : null,
              nombre_completo: p ? p.nombre_completo : null,
              nombres: p ? p.nombres : null,
              apellidos: p ? p.apellidos : null,
              rfc: p ? p.rfc : null,
              curp: p ? p.curp : null,
              persona_activo: p ? p.activo : null,
              directorio_unidad_id: um ? um.id : null,
              directorio_unidad_nombre: um ? um.nombre : null,
              directorio_unidad_cluesimb: um ? um.cluesimb : null,
              directorio_unidad_activo: um ? um.activo : null,
            },
          ],
          rowCount: 1,
        };
      }

      if (/FROM public\.rh_adscripcion_laboral al JOIN public\.unidad_medica um ON um\.id = al\.unidad_medica_id WHERE al\.persona_id = \$1/i.test(normalized)) {
        const pid = Number(params[0]);
        const list = MOCK_EMPLOYEE_ADSCRIPCIONES
          .filter((al) => al.persona_id === pid)
          .map((al) => {
            const um = MOCK_UNIDADES.get(al.unidad_medica_id);
            return {
              adscripcion_laboral_id: al.id,
              unidad_medica_id: al.unidad_medica_id,
              unidad_nombre: um ? um.nombre : 'UNIDAD',
              unidad_cluesimb: um ? um.cluesimb : null,
              matricula: al.matricula,
              puesto: al.puesto,
              turno: al.turno,
              jornada: al.jornada,
              horario: al.horario,
              vigente_desde: al.vigente_desde,
              vigente_hasta: al.vigente_hasta,
              activo: al.activo,
              observaciones: al.observaciones,
              current_date_iso: MOCK_TODAY_ISO,
            };
          });
        return { rows: list, rowCount: list.length };
      }

      return prevQueryBefore2C2(sql, params);
    };

    // 45 (Secciones 2, 6, 7 y 8 #16 de RH-2C.2): Ruta GET /mi-contexto registrada únicamente con requireAuth (sin requireRhAccess), mientras todos los demás endpoints RH conservan requireAuth + requireRhAccess
    {
      const miContextoLayer = rhRouter.stack.find(
        (l) => l.route && l.route.path === '/mi-contexto' && l.route.methods.get
      );
      assert.ok(miContextoLayer, 'Debe existir GET /mi-contexto en rhRouter');
      assert.equal(
        miContextoLayer.route.stack.length,
        2,
        'GET /mi-contexto debe tener únicamente requireAuth y el controlador (sin requireRhAccess)'
      );
      assert.equal(miContextoLayer.route.stack[0].name, 'requireAuth');

      // Verificar que TODOS los demás endpoints administrativos en rhRouter conservan requireAuth + requireRhAccess (stack.length === 3)
      const adminRoutes = rhRouter.stack.filter(
        (l) => l.route && l.route.path !== '/mi-contexto'
      );
      assert.equal(adminRoutes.length, 11);
      for (const layer of adminRoutes) {
        assert.equal(
          layer.route.stack.length,
          3,
          `La ruta administrativa ${layer.route.path} debe conservar requireAuth + requireRhAccess + controlador`
        );
        assert.equal(layer.route.stack[0].name, 'requireAuth');
      }

      // Caso #16: Usuario no autenticado (sin req.user.sub) -> 401
      const resNoAuth = createMockRes();
      await controller.miContexto({}, resNoAuth);
      assert.equal(resNoAuth.statusCode, 401);
      passed++;
    }

    // 46 (Casos #1, #2, #3, #4, #5, #7, #8, #9, #10 de RH-2C.2): Empleado autenticado (sin rol RH, con rol ordinario ABASTO, o combinado con ADMIN_TIC GLOBAL / RH GLOBAL / RH CLUES) consulta su contexto propio con múltiples adscripciones (VIGENTE, FUTURA, HISTORICA), RFC/CURP enmascarados, Cache-Control: no-store y permisos de autogestión sin escalamiento
    {
      for (const roleCombo of [
        [], // #2. Empleado sin ningún rol administrativo
        [{ code: 'ABASTO', scope: 'GLOBAL', id: null }], // #1. Empleado con rol ordinario
        [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }], // #3. Empleado que además tiene ADMIN_TIC GLOBAL
        [{ code: 'RECURSOS_HUMANOS', scope: 'GLOBAL', id: null }], // #4. Empleado que además tiene RECURSOS_HUMANOS GLOBAL
        [{ code: 'RECURSOS_HUMANOS', scope: 'CLUES', id: 'BCIMB000001' }], // #5. Empleado con RECURSOS_HUMANOS CLUES
      ]) {
        capturedQueries = [];
        const res = createMockRes();
        await controller.miContexto(
          {
            user: { sub: UUID_EMP_VIGENTE, roles: roleCombo },
            query: {},
          },
          res
        );

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['cache-control'], 'no-store');
        assert.deepEqual(res.body, {
          modo: 'EMPLEADO',
          persona: {
            persona_id: 101,
            nombre_completo: 'Dra. Ana Gómez',
            nombres: 'Ana',
            apellidos: 'Gómez',
            tiene_rfc: true,
            rfc_masked: '**********ABC',
            tiene_curp: true,
            curp_masked: '****************01',
          },
          unidad_referencia: {
            id: 10,
            nombre: 'HOSPITAL GENERAL MEXICALI',
            cluesimb: 'BCIMB000001',
            origen: 'ADSCRIPCION_RH',
          },
          estado_vinculacion_rh: 'ADSCRIPCION_VIGENTE',
          adscripciones: [
            {
              adscripcion_laboral_id: 5001,
              unidad_medica_id: 10,
              unidad: {
                id: 10,
                nombre: 'HOSPITAL GENERAL MEXICALI',
                cluesimb: 'BCIMB000001',
              },
              matricula: 'MAT-1001',
              puesto: 'Médico Especialista A',
              turno: 'MATUTINO',
              jornada: '8 HORAS',
              horario: '07:00 - 15:00',
              vigente_desde: '2026-01-01',
              vigente_hasta: null,
              activo: true,
              es_vigente: true,
              estado_vigencia: 'VIGENTE',
              observaciones: 'Base federalizada',
            },
            {
              adscripcion_laboral_id: 5011,
              unidad_medica_id: 20,
              unidad: {
                id: 20,
                nombre: 'HOSPITAL GENERAL TIJUANA',
                cluesimb: 'BCIMB000010',
              },
              matricula: 'MAT-1001-FUT',
              puesto: 'Adscripción Programada 2027',
              turno: 'VESPERTINO',
              jornada: '8 HORAS',
              horario: '14:00 - 21:30',
              vigente_desde: '2027-01-01',
              vigente_hasta: null,
              activo: true,
              es_vigente: false,
              estado_vigencia: 'FUTURA',
              observaciones: 'Cambio programado',
            },
            {
              adscripcion_laboral_id: 5010,
              unidad_medica_id: 177,
              unidad: {
                id: 177,
                nombre: 'OFICINA CENTRAL',
                cluesimb: 'N/A',
              },
              matricula: 'MAT-1001-HIST',
              puesto: 'Comisión Administrativa',
              turno: 'MATUTINO',
              jornada: '8 HORAS',
              horario: '08:00 - 16:00',
              vigente_desde: '2025-01-01',
              vigente_hasta: '2025-12-31',
              activo: false,
              es_vigente: false,
              estado_vigencia: 'HISTORICA',
              observaciones: 'Comisión concluida',
            },
          ],
          permisos: {
            puede_ver_perfil_propio: true,
            puede_administrar_personal_desde_autogestion: false,
            puede_revelar_identificadores_desde_autogestion: false,
            puede_editar_identificacion_desde_autogestion: false,
          },
        });

        // Verificar que jamás expone RFC/CURP completos ni datos de otros compañeros (ej. Carlos Ruiz, persona 104)
        const rawJson = JSON.stringify(res.body);
        assert.equal(rawJson.includes('GOMA800101ABC'), false);
        assert.equal(rawJson.includes('GOMA800101MDFR0001'), false);
        assert.equal(rawJson.includes('Carlos'), false);
        assert.equal(rawJson.includes('MAT-2004'), false);
      }
      passed++;
    }

    // 47 (Casos #6, #8, #9 y #11 de RH-2C.2): Empleado en OFICINA CENTRAL (id=177, cluesimb='N/A') sin adscripción formal RH (PENDIENTE_ADSCRIPCION_RH), empleado solo con adscripción histórica (ADSCRIPCION_HISTORICA) y empleado solo con adscripción futura (ADSCRIPCION_FUTURA)
    {
      // A) Caso #6 y #11: Empleado de OFICINA CENTRAL (id=177, cluesimb='N/A') sin fila en rh_adscripcion_laboral
      const resOficinaCentral = createMockRes();
      await controller.miContexto(
        {
          user: { sub: UUID_EMP_OFICINA_CENTRAL_SIN_ADS, roles: [] },
          query: {},
        },
        resOficinaCentral
      );

      assert.equal(resOficinaCentral.statusCode, 200);
      assert.equal(resOficinaCentral.headers['cache-control'], 'no-store');
      assert.deepEqual(resOficinaCentral.body, {
        modo: 'EMPLEADO',
        persona: {
          persona_id: 106,
          nombre_completo: 'Mtro. Jorge Mendoza',
          nombres: 'Jorge',
          apellidos: 'Mendoza',
          tiene_rfc: true,
          rfc_masked: '**********KL1',
          tiene_curp: true,
          curp_masked: '****************06',
        },
        unidad_referencia: {
          id: 177,
          nombre: 'OFICINA CENTRAL',
          cluesimb: 'N/A',
          origen: 'DIRECTORIO',
        },
        estado_vinculacion_rh: 'PENDIENTE_ADSCRIPCION_RH',
        adscripciones: [],
        permisos: {
          puede_ver_perfil_propio: true,
          puede_administrar_personal_desde_autogestion: false,
          puede_revelar_identificadores_desde_autogestion: false,
          puede_editar_identificacion_desde_autogestion: false,
        },
      });

      // B) Caso #8: Empleado con adscripción vencida únicamente -> estado_vinculacion_rh = 'ADSCRIPCION_HISTORICA' y es_vigente = false
      const resSoloHistorica = createMockRes();
      await controller.miContexto(
        {
          user: { sub: UUID_EMP_SOLO_HISTORICA, roles: [] },
          query: {},
        },
        resSoloHistorica
      );
      assert.equal(resSoloHistorica.statusCode, 200);
      assert.equal(resSoloHistorica.body.estado_vinculacion_rh, 'ADSCRIPCION_HISTORICA');
      assert.equal(resSoloHistorica.body.adscripciones.length, 1);
      assert.equal(resSoloHistorica.body.adscripciones[0].es_vigente, false);
      assert.equal(resSoloHistorica.body.adscripciones[0].estado_vigencia, 'HISTORICA');

      // C) Caso #9: Empleado con adscripción futura únicamente -> estado_vinculacion_rh = 'ADSCRIPCION_FUTURA' y es_vigente = false
      const resSoloFutura = createMockRes();
      await controller.miContexto(
        {
          user: { sub: UUID_EMP_SOLO_FUTURA, roles: [] },
          query: {},
        },
        resSoloFutura
      );
      assert.equal(resSoloFutura.statusCode, 200);
      assert.equal(resSoloFutura.body.estado_vinculacion_rh, 'ADSCRIPCION_FUTURA');
      assert.equal(resSoloFutura.body.adscripciones.length, 1);
      assert.equal(resSoloFutura.body.adscripciones[0].es_vigente, false);
      assert.equal(resSoloFutura.body.adscripciones[0].estado_vigencia, 'FUTURA');
      passed++;
    }

    // 48 (Casos #12, #13, #14, #15 y Secciones 6 y 7 de RH-2C.2): Rechazo de parámetros para elegir otro trabajador (400), rechazo de persona inactiva (403), cuenta inactiva (403), cuenta técnica sin persona_id incluso con ADMIN_TIC GLOBAL (403), usuario inexistente (401) y confirmación de que un empleado sin rol RH no obtiene acceso en resolveRhAccess()
    {
      // 1) Intento de pasar query params como persona_id, user_id o unidadId para consultar otra persona -> 400
      for (const badQuery of [
        { persona_id: '104' },
        { personaId: '104' },
        { user_id: UUID_EMP_OFICINA_CENTRAL_SIN_ADS },
        { unidadId: '20' },
      ]) {
        const resBadQuery = createMockRes();
        await controller.miContexto(
          {
            user: { sub: UUID_EMP_VIGENTE, roles: [] },
            query: badQuery,
          },
          resBadQuery
        );
        assert.equal(resBadQuery.statusCode, 400);
      }

      // 2) Caso #12: Persona vinculada inactiva (persona.activo = false) -> 403
      const resPersonaInactiva = createMockRes();
      await controller.miContexto(
        {
          user: { sub: UUID_EMP_PERSONA_INACTIVA, roles: [] },
          query: {},
        },
        resPersonaInactiva
      );
      assert.equal(resPersonaInactiva.statusCode, 403);

      // 3) Caso #13: Cuenta SSO inactiva/suspendida (app_users.status = 'SUSPENDED') -> 403
      const resUserInactivo = createMockRes();
      await controller.miContexto(
        {
          user: { sub: UUID_USER_INACTIVO, roles: [] },
          query: {},
        },
        resUserInactivo
      );
      assert.equal(resUserInactivo.statusCode, 403);

      // 4) Caso #14: Cuenta técnica sin persona_id (incluso si posee ADMIN_TIC GLOBAL) -> 403 en autogestión de empleado
      const resCuentaTecnica = createMockRes();
      await controller.miContexto(
        {
          user: {
            sub: UUID_CUENTA_TECNICA_SIN_PERSONA,
            roles: [{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }],
          },
          query: {},
        },
        resCuentaTecnica
      );
      assert.equal(resCuentaTecnica.statusCode, 403);

      // 5) Caso #15: Usuario inexistente en app_users -> 401
      const resUserInexistente = createMockRes();
      await controller.miContexto(
        {
          user: { sub: UUID_USER_INEXISTENTE, roles: [] },
          query: {},
        },
        resUserInexistente
      );
      assert.equal(resUserInexistente.statusCode, 401);

      // 6) Separación de autorizaciones: un empleado autenticado sin rol RH sigue recibiendo null en resolveRhAccess() y 403 en requireRhAccess()
      assert.equal(resolveRhAccess([]), null);
      assert.equal(
        resolveRhAccess([{ code: 'ABASTO', scope: 'GLOBAL', id: null }]),
        null
      );
      const mw = requireRhAccess();
      const resAdminEndpoint = createMockRes();
      let nextCalled = false;
      mw(
        { user: { sub: UUID_EMP_VIGENTE, roles: [{ code: 'ABASTO', scope: 'GLOBAL', id: null }] } },
        resAdminEndpoint,
        () => {
          nextCalled = true;
        }
      );
      assert.equal(nextCalled, false);
      assert.equal(resAdminEndpoint.statusCode, 403);
      passed++;
    }

    // =========================================================================
    // SUITE RH-4A.1A: POST /api/rh/personas y PATCH /api/rh/personas/:personaId/estado
    // =========================================================================

    const personaStore = [
      {
        id: 201,
        nombres: 'Persona',
        apellidos: 'Activa Sin Vinculos',
        nombre_completo: 'Persona Activa Sin Vinculos',
        rfc: 'PASV800101AB1',
        curp: 'PASV800101MDFR0001',
        cargo: 'Analista',
        correo_principal: 'persona.sin.vinculos@imssbienestar.gob.mx',
        unidad_medica_id: 10,
        activo: true,
        fecha_baja: null,
        hasActiveUser: false,
        hasVigenteAdscripcion: false,
      },
      {
        id: 202,
        nombres: 'Persona',
        apellidos: 'Con Cuenta Activa',
        nombre_completo: 'Persona Con Cuenta Activa',
        rfc: null,
        curp: null,
        cargo: 'Médico',
        correo_principal: null,
        unidad_medica_id: 10,
        activo: true,
        fecha_baja: null,
        hasActiveUser: true,
        hasVigenteAdscripcion: false,
      },
      {
        id: 203,
        nombres: 'Persona',
        apellidos: 'Con Adscripcion Vigente',
        nombre_completo: 'Persona Con Adscripcion Vigente',
        rfc: null,
        curp: null,
        cargo: 'Enfermería',
        correo_principal: null,
        unidad_medica_id: 10,
        activo: true,
        fecha_baja: null,
        hasActiveUser: false,
        hasVigenteAdscripcion: true,
      },
      {
        id: 204,
        nombres: 'Persona',
        apellidos: 'Previamente Inactiva',
        nombre_completo: 'Persona Previamente Inactiva',
        rfc: null,
        curp: null,
        cargo: null,
        correo_principal: null,
        unidad_medica_id: null,
        activo: false,
        fecha_baja: '2026-01-15',
        hasActiveUser: false,
        hasVigenteAdscripcion: false,
      },
    ];
    let nextPersonaId = 205;
    let simulatePersonaAuditError = false;
    const personaTxEvents = [];
    const personaAuditLogs = [];
    const appUsersCreated = [];

    pool.connect = async () => ({
      query: async (sql, params = []) => {
        const s = String(sql).trim();
        if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
          personaTxEvents.push(s);
          return { rows: [], rowCount: 0 };
        }
        if (s.includes('FROM public.unidad_medica') && s.includes('WHERE id = $1')) {
          const umId = Number(params[0]);
          const valid = [10, 20, 30, 177].includes(umId);
          return { rows: valid ? [{ id: umId }] : [], rowCount: valid ? 1 : 0 };
        }
        if (s.startsWith('INSERT INTO public.persona')) {
          const [nombres, apellidos, rfc, curp, cargo, correo, unidadId] = params;
          if (rfc && personaStore.some((p) => p.rfc === rfc)) {
            const err = new Error('duplicate key value violates unique constraint "uq_persona_rfc"');
            err.code = '23505';
            err.constraint = 'uq_persona_rfc';
            throw err;
          }
          if (curp && personaStore.some((p) => p.curp === curp)) {
            const err = new Error('duplicate key value violates unique constraint "uq_persona_curp"');
            err.code = '23505';
            err.constraint = 'uq_persona_curp';
            throw err;
          }
          const created = {
            id: nextPersonaId++,
            nombres,
            apellidos,
            nombre_completo: `${nombres} ${apellidos}`.trim(),
            rfc,
            curp,
            cargo,
            correo_principal: correo,
            unidad_medica_id: unidadId,
            activo: true,
            fecha_baja: null,
            hasActiveUser: false,
            hasVigenteAdscripcion: false,
          };
          personaStore.push(created);
          return { rows: [created], rowCount: 1 };
        }
        if (s.includes('FROM public.persona') && s.includes('FOR UPDATE')) {
          const pId = Number(params[0]);
          const found = personaStore.find((p) => p.id === pId);
          return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
        }
        if (s.includes('FROM public.app_users') && s.includes('persona_id = $1')) {
          const pId = Number(params[0]);
          const found = personaStore.find((p) => p.id === pId);
          return {
            rows: found && found.hasActiveUser ? [{ id: 'u-active-1' }] : [],
            rowCount: found && found.hasActiveUser ? 1 : 0,
          };
        }
        if (s.includes('FROM public.rh_adscripcion_laboral') && s.includes('persona_id = $1')) {
          const pId = Number(params[0]);
          const found = personaStore.find((p) => p.id === pId);
          return {
            rows: found && found.hasVigenteAdscripcion ? [{ id: 9901 }] : [],
            rowCount: found && found.hasVigenteAdscripcion ? 1 : 0,
          };
        }
        if (s.startsWith('UPDATE public.persona')) {
          const pId = Number(params[0]);
          const found = personaStore.find((p) => p.id === pId);
          if (s.includes('activo = FALSE')) {
            found.activo = false;
            found.fecha_baja = '2026-11-18';
          } else {
            found.activo = true;
            found.fecha_baja = null;
          }
          return { rows: [{ ...found }], rowCount: 1 };
        }
        if (s.includes('INSERT INTO public.app_audit_logs')) {
          if (simulatePersonaAuditError) {
            throw new Error('Simulated audit failure');
          }
          personaAuditLogs.push({
            user_id: params[0],
            action: params[1],
            resource: params[2],
            payload: JSON.parse(params[5]),
          });
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected SQL in RH-4A.1A mock: ${s}`);
      },
      release: () => {},
    });

    // 49 (RH-4A.1A #13, #14, #15): Autorización exclusiva RECURSOS_HUMANOS GLOBAL para POST /personas y PATCH /personas/:id/estado
    {
      for (const roleCtx of [
        undefined,
        { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
        { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' },
      ]) {
        const resCreate = createMockRes();
        await controller.createPersona(
          { user: { sub: AUTH_USER_UUID }, rhAccess: roleCtx, body: { nombres: 'Ana', apellidos: 'Lopez' } },
          resCreate
        );
        assert.equal(resCreate.statusCode, 403);

        const resEstado = createMockRes();
        await controller.updatePersonaEstado(
          { user: { sub: AUTH_USER_UUID }, rhAccess: roleCtx, params: { personaId: '201' }, body: { activo: false } },
          resEstado
        );
        assert.equal(resEstado.statusCode, 403);
      }
      assert.equal(personaTxEvents.length, 0);
      passed++;
    }

    // 50 (RH-4A.1A #1-#12, #16, #24, #26): Alta de personas (obligatorios, sin RFC/CURP, RFC 10/13, rechazo moral 12, CURP inválida, duplicados 409, nombres vacíos, campos desconocidos, unidad inexistente, sin crear app_users)
    {
      const rhGlobal = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };

      // Alta con campos obligatorios sin RFC/CURP -> 201, Cache-Control: no-store, sin crear app_users
      const resMin = createMockRes();
      await controller.createPersona(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: rhGlobal,
          body: { nombres: 'Laura', apellidos: 'Ramirez' },
        },
        resMin
      );
      assert.equal(resMin.statusCode, 201);
      assert.equal(resMin.headers['cache-control'], 'no-store');
      assert.equal(resMin.body.nombre_completo, 'Laura Ramirez');
      assert.equal(resMin.body.activo, true);
      assert.equal(resMin.body.tiene_rfc, false);
      assert.equal(resMin.body.tiene_curp, false);
      assert.equal(appUsersCreated.length, 0);

      // Alta con RFC de 10 caracteres válido estructuralmente
      const resRfc10 = createMockRes();
      await controller.createPersona(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: rhGlobal,
          body: { nombres: 'Mario', apellidos: 'Diaz', rfc: 'DIAM850202', unidad_medica_id: 10 },
        },
        resRfc10
      );
      assert.equal(resRfc10.statusCode, 201);
      assert.equal(resRfc10.body.tiene_rfc, true);
      assert.equal(resRfc10.body.rfc_masked, '*******202');

      // Alta con RFC completo de 13 caracteres y CURP de 18 caracteres (devuelve enmascarados, nunca completos)
      const resRfc13 = createMockRes();
      await controller.createPersona(
        {
          user: { sub: AUTH_USER_UUID },
          rhAccess: rhGlobal,
          body: {
            nombres: 'Sofia',
            apellidos: 'Castro',
            rfc: 'CASS900303XYZ',
            curp: 'CASS900303MDFR0002',
            cargo: 'Química',
            correo_principal: 'sofia.castro@imssbienestar.gob.mx',
          },
        },
        resRfc13
      );
      assert.equal(resRfc13.statusCode, 201);
      assert.equal(resRfc13.body.rfc_masked, '**********XYZ');
      assert.equal(resRfc13.body.curp_masked, '****************02');
      assert.equal(JSON.stringify(resRfc13.body).includes('CASS900303XYZ'), false);
      assert.equal(JSON.stringify(resRfc13.body).includes('CASS900303MDFR0002'), false);

      // Rechazo de RFC persona moral (12 caracteres), CURP inválida, nombres vacíos, campos desconocidos y unidad inexistente
      const resMoral = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: 'A', apellidos: 'B', rfc: 'EMP900101ABC' } },
        resMoral
      );
      assert.equal(resMoral.statusCode, 400);

      const resBadCurp = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: 'A', apellidos: 'B', curp: 'CURPINVALIDA' } },
        resBadCurp
      );
      assert.equal(resBadCurp.statusCode, 400);

      const resEmptyNames = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: '   ', apellidos: 'B' } },
        resEmptyNames
      );
      assert.equal(resEmptyNames.statusCode, 400);

      const resUnknownField = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: 'A', apellidos: 'B', nombre_completo: 'X' } },
        resUnknownField
      );
      assert.equal(resUnknownField.statusCode, 400);

      const resBadUnidad = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: 'A', apellidos: 'B', unidad_medica_id: 99999 } },
        resBadUnidad
      );
      assert.equal(resBadUnidad.statusCode, 404);

      // RFC duplicado y CURP duplicada -> HTTP 409 sin revelar propietario
      const resDupRfc = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: 'Otro', apellidos: 'User', rfc: 'PASV800101AB1' } },
        resDupRfc
      );
      assert.equal(resDupRfc.statusCode, 409);

      const resDupCurp = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: 'Otro', apellidos: 'User', curp: 'PASV800101MDFR0001' } },
        resDupCurp
      );
      assert.equal(resDupCurp.statusCode, 409);

      // Auditoría sin RFC ni CURP
      assert.equal(personaAuditLogs.filter((a) => a.action === 'RH_CREATE_PERSONA').length, 3);
      assert.equal(JSON.stringify(personaAuditLogs).includes('CASS900303XYZ'), false);
      assert.equal(JSON.stringify(personaAuditLogs).includes('CASS900303MDFR0002'), false);
      passed++;
    }

    // 51 (RH-4A.1A #17-#23): Cambio de estado (desactivación válida, reactivación, idempotencia, activo no booleano, persona inexistente, cuenta activa 409, adscripción vigente 409)
    {
      const rhGlobal = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };

      // activo no booleano ("false") -> 400
      const resStrBool = createMockRes();
      await controller.updatePersonaEstado(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, params: { personaId: '201' }, body: { activo: 'false' } },
        resStrBool
      );
      assert.equal(resStrBool.statusCode, 400);

      // persona inexistente -> 404
      const resNotFound = createMockRes();
      await controller.updatePersonaEstado(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, params: { personaId: '99999' }, body: { activo: false } },
        resNotFound
      );
      assert.equal(resNotFound.statusCode, 404);

      // cuenta activa vinculada -> 409
      const resActiveUser = createMockRes();
      await controller.updatePersonaEstado(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, params: { personaId: '202' }, body: { activo: false } },
        resActiveUser
      );
      assert.equal(resActiveUser.statusCode, 409);

      // adscripción vigente -> 409
      const resVigenteAds = createMockRes();
      await controller.updatePersonaEstado(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, params: { personaId: '203' }, body: { activo: false } },
        resVigenteAds
      );
      assert.equal(resVigenteAds.statusCode, 409);

      // desactivación válida (persona 201) -> 200, activo=false, fecha_baja set
      const auditCountBefore = personaAuditLogs.length;
      const resDeactivate = createMockRes();
      await controller.updatePersonaEstado(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, params: { personaId: '201' }, body: { activo: false } },
        resDeactivate
      );
      assert.equal(resDeactivate.statusCode, 200);
      assert.equal(resDeactivate.body.persona.activo, false);
      assert.equal(resDeactivate.body.persona.fecha_baja, '2026-11-18');
      assert.equal(resDeactivate.body.idempotente, false);
      assert.equal(personaAuditLogs.length, auditCountBefore + 1);

      // idempotencia (volver a enviar activo=false) -> 200, idempotente=true, NO duplica auditoría
      const resIdempotent = createMockRes();
      await controller.updatePersonaEstado(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, params: { personaId: '201' }, body: { activo: false } },
        resIdempotent
      );
      assert.equal(resIdempotent.statusCode, 200);
      assert.equal(resIdempotent.body.idempotente, true);
      assert.equal(personaAuditLogs.length, auditCountBefore + 1);

      // reactivación válida (persona 204) -> 200, activo=true, fecha_baja=null
      const resReactivate = createMockRes();
      await controller.updatePersonaEstado(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, params: { personaId: '204' }, body: { activo: true } },
        resReactivate
      );
      assert.equal(resReactivate.statusCode, 200);
      assert.equal(resReactivate.body.persona.activo, true);
      assert.equal(resReactivate.body.persona.fecha_baja, null);
      assert.equal(personaAuditLogs.length, auditCountBefore + 2);
      passed++;
    }

    // 52 (RH-4A.1A #25, #27): Fallo de auditoría dispara ROLLBACK y devuelve HTTP 500
    {
      const rhGlobal = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };
      simulatePersonaAuditError = true;
      personaTxEvents.length = 0;

      const resAuditFail = createMockRes();
      await controller.createPersona(
        { user: { sub: AUTH_USER_UUID }, rhAccess: rhGlobal, body: { nombres: 'Rollback', apellidos: 'Test' } },
        resAuditFail
      );
      assert.equal(resAuditFail.statusCode, 500);
      assert.equal(personaTxEvents.includes('ROLLBACK'), true);
      assert.equal(personaTxEvents.includes('COMMIT'), false);
      simulatePersonaAuditError = false;
      passed++;
    }

    // =========================================================================
    // SUITE RH-4A.1A.1: GET /api/rh/personas (Consulta administrativa del padrón)
    // =========================================================================

    const padronMockRows = [
      {
        persona_id: 301,
        nombre_completo: 'Persona Activa Oficina Central',
        nombres: 'Persona Activa',
        apellidos: 'Oficina Central',
        cargo: 'Coordinación',
        correo_principal: 'oficina.central@imssbienestar.gob.mx',
        unidad_medica_id: 177,
        unidad_medica_nombre: 'OFICINA CENTRAL',
        unidad_medica_cluesimb: 'N/A',
        rfc: 'PAOC800101AB1',
        curp: 'PAOC800101MDFR0001',
        activo: true,
        fecha_baja: null,
        tiene_cuenta_activa: true,
      },
      {
        persona_id: 302,
        nombre_completo: 'Persona Activa Sin Cuenta Ni Unidad',
        nombres: 'Persona Activa',
        apellidos: 'Sin Cuenta Ni Unidad',
        cargo: null,
        correo_principal: null,
        unidad_medica_id: null,
        unidad_medica_nombre: null,
        unidad_medica_cluesimb: null,
        rfc: null,
        curp: null,
        activo: true,
        fecha_baja: null,
        tiene_cuenta_activa: false,
      },
      {
        persona_id: 303,
        nombre_completo: 'Persona Inactiva Historica',
        nombres: 'Persona Inactiva',
        apellidos: 'Historica',
        cargo: 'Auxiliar',
        correo_principal: null,
        unidad_medica_id: 10,
        unidad_medica_nombre: 'HOSPITAL GENERAL MEXICALI',
        unidad_medica_cluesimb: 'BCIMB000001',
        rfc: 'PIHI850505XY9',
        curp: null,
        activo: false,
        fecha_baja: '2026-02-01',
        tiene_cuenta_activa: false,
      },
    ];

    const padronCapturedQueries = [];
    pool.query = async (sql, params = []) => {
      const s = String(sql).trim();
      padronCapturedQueries.push({ sql: s, params });
      if (!s.startsWith('SELECT') || !s.includes('FROM public.persona p')) {
        throw new Error(`Unexpected SQL in GET /api/rh/personas: ${s}`);
      }

      let filtered = [...padronMockRows];
      let pIdx = 0;

      if (s.includes('p.activo = TRUE')) {
        filtered = filtered.filter((r) => r.activo === true);
      } else if (s.includes('p.activo = FALSE')) {
        filtered = filtered.filter((r) => r.activo === false);
      }

      if (s.includes('p.unidad_medica_id = $')) {
        const uId = Number(params[pIdx++]);
        filtered = filtered.filter((r) => r.unidad_medica_id === uId);
      }

      if (s.includes('LOWER(COALESCE(p.nombre_completo')) {
        const qVal = String(params[pIdx++]).toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.nombre_completo.toLowerCase().includes(qVal) ||
            (r.nombres ?? '').toLowerCase().includes(qVal) ||
            (r.apellidos ?? '').toLowerCase().includes(qVal)
        );
      }

      const limit = Number(params[pIdx++]);
      const offset = Number(params[pIdx++]);

      filtered.sort((a, b) => {
        if (a.activo !== b.activo) return a.activo ? -1 : 1;
        const cmp = a.nombre_completo.toLowerCase().localeCompare(b.nombre_completo.toLowerCase());
        if (cmp !== 0) return cmp;
        return a.persona_id - b.persona_id;
      });

      const total = filtered.length;
      const sliced = filtered.slice(offset, offset + limit).map((r) => ({ ...r, total }));
      return { rows: sliced, rowCount: sliced.length };
    };

    // 53 (RH-4A.1A.1 #13, #14, #15): Autorización exclusiva RECURSOS_HUMANOS GLOBAL y rechazo de parámetros inválidos
    {
      for (const roleCtx of [
        undefined,
        { scope: 'CLUES', clues: ['BCIMB000001'], grantedBy: 'RECURSOS_HUMANOS' },
        { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' },
      ]) {
        const resDenied = createMockRes();
        await controller.listPersonasPadron({ rhAccess: roleCtx, query: {} }, resDenied);
        assert.equal(resDenied.statusCode, 403);
      }

      const rhGlobal = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };
      const resBadParam = createMockRes();
      await controller.listPersonasPadron(
        { rhAccess: rhGlobal, query: { rfc: 'PAOC800101AB1' } },
        resBadParam
      );
      assert.equal(resBadParam.statusCode, 400);

      const resBadEstado = createMockRes();
      await controller.listPersonasPadron(
        { rhAccess: rhGlobal, query: { estado: 'eliminadas' } },
        resBadEstado
      );
      assert.equal(resBadEstado.statusCode, 400);

      const resBadUnidad = createMockRes();
      await controller.listPersonasPadron(
        { rhAccess: rhGlobal, query: { unidadId: 'abc' } },
        resBadUnidad
      );
      assert.equal(resBadUnidad.statusCode, 400);

      const resBadPage = createMockRes();
      await controller.listPersonasPadron(
        { rhAccess: rhGlobal, query: { page: '0' } },
        resBadPage
      );
      assert.equal(resBadPage.statusCode, 400);
      passed++;
    }

    // 54 (RH-4A.1A.1 #1-#12, #16, #17): Listado activas/inactivas/todas, búsqueda, paginación, orden, sin cuenta/adscripción/unidad, CLUES N/A, RFC/CURP enmascarados y Cache-Control: no-store
    {
      const rhGlobal = { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };

      // Todas sin filtro de estado
      const resAll = createMockRes();
      await controller.listPersonasPadron({ rhAccess: rhGlobal, query: {} }, resAll);
      assert.equal(resAll.statusCode, 200);
      assert.equal(resAll.headers['cache-control'], 'no-store');
      assert.equal(resAll.body.total, 3);
      assert.equal(resAll.body.items[0].persona_id, 301);
      assert.equal(resAll.body.items[0].unidad_medica_cluesimb, 'N/A');
      assert.equal(resAll.body.items[0].tiene_cuenta_activa, true);
      assert.equal(resAll.body.items[0].rfc_masked, '**********AB1');
      assert.equal(resAll.body.items[0].curp_masked, '****************01');
      assert.equal(JSON.stringify(resAll.body).includes('PAOC800101AB1'), false);
      assert.equal(JSON.stringify(resAll.body).includes('PAOC800101MDFR0001'), false);

      // Persona sin cuenta ni unidad incluida
      assert.equal(resAll.body.items[1].persona_id, 302);
      assert.equal(resAll.body.items[1].unidad_medica_id, null);
      assert.equal(resAll.body.items[1].tiene_cuenta_activa, false);

      // Filtro activas
      const resActivas = createMockRes();
      await controller.listPersonasPadron(
        { rhAccess: rhGlobal, query: { estado: 'activas' } },
        resActivas
      );
      assert.equal(resActivas.statusCode, 200);
      assert.equal(resActivas.body.total, 2);

      // Filtro inactivas
      const resInactivas = createMockRes();
      await controller.listPersonasPadron(
        { rhAccess: rhGlobal, query: { estado: 'inactivas' } },
        resInactivas
      );
      assert.equal(resInactivas.statusCode, 200);
      assert.equal(resInactivas.body.total, 1);
      assert.equal(resInactivas.body.items[0].persona_id, 303);

      // Búsqueda por nombre y paginación
      const resSearch = createMockRes();
      await controller.listPersonasPadron(
        { rhAccess: rhGlobal, query: { q: 'Oficina', page: '1', pageSize: '1' } },
        resSearch
      );
      assert.equal(resSearch.statusCode, 200);
      assert.equal(resSearch.body.total, 1);
      assert.equal(resSearch.body.items.length, 1);

      // Cero escrituras SQL
      assert.equal(
        padronCapturedQueries.every((q) => q.sql.startsWith('SELECT')),
        true
      );
      passed++;
    }
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }

  console.log(
    `RH-API.1 + RH-2B.1 + RH-2B.4A + RH-2B.4C + RH-2B.4E + RH-2B.4G.1 + RH-2B.4G.2 + RH-2B.4G.2A + RH-2C.2 + RH-4A.1A + RH-4A.1A.1 TESTS PASSED: ${passed}/54`
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
