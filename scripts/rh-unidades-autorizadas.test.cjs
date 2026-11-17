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
      { id: 101, nombre_completo: 'Dra. Ana Gómez', cargo: 'Médico Especialista', unidad_medica_id: 10, activo: true, rfc: 'GOMA800101XXX', curp: 'GOMA800101MDFR01', correo_principal: 'ana@imssb.gob.mx' },
      { id: 102, nombre_completo: 'Enf. Luis Pérez', cargo: 'Enfermero General', unidad_medica_id: 10, activo: true, rfc: 'PERL850202XXX', curp: 'PERL850202HDFR02', correo_principal: 'luis@imssb.gob.mx' },
      { id: 103, nombre_completo: 'Lic. Sofía Ramírez', cargo: 'Analista RH', unidad_medica_id: 10, activo: true, rfc: 'RAMS900303XXX', curp: 'RAMS900303MDFR03', correo_principal: 'sofia@imssb.gob.mx' },
      { id: 104, nombre_completo: 'Dr. Carlos Ruiz', cargo: 'Urgenciólogo', unidad_medica_id: 20, activo: true, rfc: 'RUIC790404XXX', curp: 'RUIC790404HDFR04', correo_principal: 'carlos@imssb.gob.mx' },
      { id: 105, nombre_completo: 'Persona Inactiva', cargo: 'Baja', unidad_medica_id: 10, activo: false, rfc: 'INAC000000XXX', curp: 'INAC000000HDFR00', correo_principal: null },
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
      txAuditLogs = [];
      txEvents = [];
      failOnTxSql = null;
      personaRowLocks.clear();
    }
    resetTxState();

    pool.connect = async () => {
      const clientId = nextMockClientId++;
      let stagedAdscripciones = [];
      let stagedAuditLogs = [];
      let inTx = false;

      return {
        async query(sql, params = []) {
          const normalized = String(sql).replace(/\s+/g, ' ').trim();
          txEvents.push({ clientId, sql: normalized, params });

          // Prohibir absolutamente cualquier INSERT/UPDATE/DELETE sobre public.persona
          assert.equal(
            /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.persona\b/i.test(normalized),
            false,
            `Prohibido modificar public.persona en RH-2B.4A: ${normalized}`
          );

          if (failOnTxSql && normalized.includes(failOnTxSql)) {
            throw new Error(`Simulated TX failure on ${failOnTxSql}`);
          }

          if (normalized === 'BEGIN') {
            inTx = true;
            stagedAdscripciones = [];
            stagedAuditLogs = [];
            return { rows: [], rowCount: 0 };
          }

          if (normalized === 'COMMIT') {
            if (inTx) {
              txAdscripciones.push(...stagedAdscripciones);
              txAuditLogs.push(...stagedAuditLogs);
            }
            inTx = false;
            stagedAdscripciones = [];
            stagedAuditLogs = [];
            releasePersonaLocks(clientId);
            return { rows: [], rowCount: 0 };
          }

          if (normalized === 'ROLLBACK') {
            inTx = false;
            stagedAdscripciones = [];
            stagedAuditLogs = [];
            releasePersonaLocks(clientId);
            return { rows: [], rowCount: 0 };
          }

          if (/^SELECT id, nombre_completo, unidad_medica_id, activo FROM public\.persona WHERE id = \$1 FOR UPDATE$/i.test(normalized)) {
            const pid = Number(params[0]);
            await acquirePersonaLock(pid, clientId);
            const found = MOCK_PERSONAS.find((p) => p.id === pid);
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

          if (/^SELECT id, unidad_medica_id, vigente_desde, vigente_hasta, activo FROM public\.rh_adscripcion_laboral WHERE persona_id = \$1 ORDER BY id ASC FOR UPDATE$/i.test(normalized)) {
            const pid = Number(params[0]);
            const rows = [...txAdscripciones, ...stagedAdscripciones]
              .filter((a) => a.persona_id === pid)
              .map((a) => ({ ...a }));
            return { rows, rowCount: rows.length };
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
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }

  console.log(`RH-API.1 + RH-2B.1 + RH-2B.4A TESTS PASSED: ${passed}/28`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
