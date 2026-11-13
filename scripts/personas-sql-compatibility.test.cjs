const assert = require('node:assert/strict');
const test = require('node:test');

const { pool } = require('../dist/db/pool');
const PersonasService = require('../dist/services/personas.service').default;
const PersonasController = require('../dist/controllers/personas.controller').default;

// Conjunto real de columnas de public.persona según dump-postgres-202611111225.sql (L10641-L10657)
const VALID_PERSONA_COLUMNS = new Set([
  'id',
  'nombre_completo',
  'cargo',
  'unidad_medica_id',
  'creado_en',
  'actualizado_en',
  'nombres',
  'apellidos',
  'rfc',
  'curp',
  'correo_principal',
  'username',
  'activo',
  'fecha_baja',
  'user_id',
]);

// Columnas inválidas que causaban error SQL 42703 en public.persona
const INVALID_PERSONA_COLUMNS = ['created_at', 'updated_at'];

/**
 * Crea un mock de PoolClient y reemplaza temporalmente `pool.connect` y `pool.query`
 * para inspeccionar el SQL y los parámetros emitidos por `PersonasService` sin conectarse a PostgreSQL.
 */
function createMockDb({
  initialPersona = {
    id: 42,
    nombre_completo: 'Dra. Ana Gómez',
    unidad_medica_id: 15,
    activo: true,
    correo_principal: 'ana@imssb.bc',
  },
  activeAssignmentCount = 0,
  failOnSqlMatch = null,
} = {}) {
  const executedQueries = [];
  let releasedCount = 0;
  const state = { ...initialPersona };

  const client = {
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      executedQueries.push({ sql: normalizedSql, rawSql: String(sql), params });

      if (failOnSqlMatch && normalizedSql.includes(failOnSqlMatch)) {
        const err = new Error(`Simulated DB error on: ${failOnSqlMatch}`);
        throw err;
      }

      if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      // INSERT INTO persona
      if (/^INSERT INTO persona\b/i.test(normalizedSql)) {
        state.nombre_completo = params[0];
        state.unidad_medica_id = params[1];
        state.correo_principal = params.length >= 3 ? params[2] : null;
        state.activo = true;
        return { rows: [{ id: state.id }], rowCount: 1 };
      }

      // SELECT id FROM persona WHERE id=$1 AND activo=TRUE
      if (/^SELECT id FROM persona WHERE id=\$1 AND activo=TRUE$/i.test(normalizedSql)) {
        if (state.id === params[0] && state.activo) {
          return { rows: [{ id: state.id }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // UPDATE persona en update()
      if (/^UPDATE persona SET nombre_completo = COALESCE\(\$2, nombre_completo\)/i.test(normalizedSql)) {
        const [, newNombre, newUnidadId, shouldUpdateUnidad, newCorreoPrincipal, shouldUpdateCorreo] = params;
        if (newNombre !== null && newNombre !== undefined) {
          state.nombre_completo = newNombre;
        }
        if (shouldUpdateUnidad === true) {
          state.unidad_medica_id = newUnidadId;
        }
        if (shouldUpdateCorreo === true) {
          state.correo_principal = newCorreoPrincipal;
        }
        return { rows: [], rowCount: 1 };
      }

      // SELECT 1 FROM asignacion_dispositivo en softDelete()
      if (/^SELECT 1 FROM asignacion_dispositivo/i.test(normalizedSql)) {
        return {
          rows: activeAssignmentCount > 0 ? [{ '?column?': 1 }] : [],
          rowCount: activeAssignmentCount,
        };
      }

      // UPDATE persona en softDelete()
      if (/^UPDATE persona SET activo = FALSE/i.test(normalizedSql)) {
        state.activo = false;
        state.correo_principal = null;
        return { rows: [], rowCount: 1 };
      }

      // Consultas sobre persona_correo
      if (/persona_correo/i.test(normalizedSql)) {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {
      releasedCount += 1;
    },
  };

  const origConnect = pool.connect;
  const origQuery = pool.query;

  pool.connect = async () => client;
  pool.query = async (sql, params) => client.query(sql, params);

  function restore() {
    pool.connect = origConnect;
    pool.query = origQuery;
  }

  return {
    executedQueries,
    getReleasedCount: () => releasedCount,
    getState: () => ({ ...state }),
    restore,
  };
}

test('1 y 4. PersonasService.create utiliza exclusivamente columnas válidas de public.persona (creado_en, actualizado_en) y mantiene contrato { id }', async () => {
  const mockDb = createMockDb();
  try {
    const svc = new PersonasService();
    const result = await svc.create({
      nombre_completo: 'Dr. Roberto Juárez',
      unidad_medica_id: 10,
      correos: ['roberto@imssb.bc', 'roberto.alt@imssb.bc'],
    });

    assert.deepEqual(result, { id: 42 });

    const insertPersonaQuery = mockDb.executedQueries.find((q) =>
      /^INSERT INTO persona\b/i.test(q.sql)
    );
    assert.ok(insertPersonaQuery, 'Debe ejecutarse INSERT INTO persona');

    // Verificar que usa creado_en y actualizado_en y NO created_at ni updated_at
    assert.match(insertPersonaQuery.sql, /\bcreado_en\b/);
    assert.match(insertPersonaQuery.sql, /\bactualizado_en\b/);
    for (const invalidCol of INVALID_PERSONA_COLUMNS) {
      assert.ok(
        !insertPersonaQuery.sql.includes(invalidCol),
        `INSERT INTO persona no debe referenciar columna inexistente: ${invalidCol}`
      );
    }

    // Extraer lista de columnas del INSERT INTO persona (...) y validar contra el dump
    const colListMatch = insertPersonaQuery.sql.match(/^INSERT INTO persona\s*\(([^)]+)\)/i);
    assert.ok(colListMatch, 'Debe poder extraerse la lista de columnas de INSERT INTO persona');
    const cols = colListMatch[1].split(',').map((c) => c.trim());
    for (const col of cols) {
      assert.ok(
        VALID_PERSONA_COLUMNS.has(col),
        `La columna "${col}" no existe en public.persona según el dump`
      );
    }

    // Verificar parametrización ($1, $2, $3) y que persona_correo solo guarda el complementario
    assert.deepEqual(insertPersonaQuery.params, ['Dr. Roberto Juárez', 10, 'roberto@imssb.bc']);
    const correoInserts = mockDb.executedQueries.filter((q) =>
      /^INSERT INTO persona_correo\b/i.test(q.sql)
    );
    assert.equal(correoInserts.length, 1);
    assert.deepEqual(correoInserts[0].params, [42, 'roberto.alt@imssb.bc']);
  } finally {
    mockDb.restore();
  }
});

test('2, 4 y 5. PersonasService.update utiliza actualizado_en y preserva unidad_medica_id cuando el campo se omite (undefined)', async () => {
  const mockDb = createMockDb({
    initialPersona: {
      id: 42,
      nombre_completo: 'Dra. Ana Gómez',
      unidad_medica_id: 15,
      activo: true,
    },
  });
  try {
    const svc = new PersonasService();

    // Caso A: Se actualiza únicamente el nombre (unidad_medica_id omitido / undefined)
    const outA = await svc.update(42, {
      nombre_completo: 'Dra. Ana María Gómez',
      unidad_medica_id: undefined,
    });
    assert.deepEqual(outA, { id: 42 });

    const updateQueryA = mockDb.executedQueries.find((q) => /^UPDATE persona\b/i.test(q.sql));
    assert.ok(updateQueryA, 'Debe ejecutarse UPDATE persona');
    assert.match(updateQueryA.sql, /\bactualizado_en\s*=\s*NOW\(\)/i);
    for (const invalidCol of INVALID_PERSONA_COLUMNS) {
      assert.ok(
        !updateQueryA.sql.includes(invalidCol),
        `UPDATE persona no debe referenciar columna inexistente: ${invalidCol}`
      );
    }

    // Verificar que los parámetros indican NO sobrescribir unidad_medica_id ($4 = false) ni correo_principal ($6 = false)
    assert.deepEqual(updateQueryA.params, [42, 'Dra. Ana María Gómez', null, false, null, false]);
    assert.equal(
      mockDb.getState().unidad_medica_id,
      15,
      'Actualizar solo el nombre debe preservar unidad_medica_id = 15'
    );
    assert.equal(mockDb.getState().nombre_completo, 'Dra. Ana María Gómez');

    // Caso B: Se envía un nuevo unidad_medica_id numérico válido (25)
    mockDb.executedQueries.length = 0;
    const outB = await svc.update(42, {
      unidad_medica_id: 25,
    });
    assert.deepEqual(outB, { id: 42 });
    const updateQueryB = mockDb.executedQueries.find((q) => /^UPDATE persona\b/i.test(q.sql));
    assert.deepEqual(updateQueryB.params, [42, null, 25, true, null, false]);
    assert.equal(mockDb.getState().unidad_medica_id, 25);

    // Caso C: Se envía explícitamente null al servicio (payload.unidad_medica_id === null)
    mockDb.executedQueries.length = 0;
    const outC = await svc.update(42, {
      unidad_medica_id: null,
    });
    assert.deepEqual(outC, { id: 42 });
    const updateQueryC = mockDb.executedQueries.find((q) => /^UPDATE persona\b/i.test(q.sql));
    assert.deepEqual(updateQueryC.params, [42, null, null, true, null, false]);
    assert.equal(mockDb.getState().unidad_medica_id, null);
  } finally {
    mockDb.restore();
  }
});

test('3, 4 y 8. PersonasService.softDelete utiliza actualizado_en en persona, mantiene intacta la consulta de persona_correo y asignacion_dispositivo, y conserva contrato { ok: true }', async () => {
  const mockDb = createMockDb();
  try {
    const svc = new PersonasService();
    const out = await svc.softDelete(42);
    assert.deepEqual(out, { ok: true });

    const updatePersonaDelete = mockDb.executedQueries.find((q) =>
      /^UPDATE persona\b/i.test(q.sql)
    );
    assert.ok(updatePersonaDelete, 'Debe ejecutarse UPDATE persona en softDelete');
    assert.match(updatePersonaDelete.sql, /\bactualizado_en\s*=\s*NOW\(\)/i);
    for (const invalidCol of INVALID_PERSONA_COLUMNS) {
      assert.ok(
        !updatePersonaDelete.sql.includes(invalidCol),
        `softDelete no debe referenciar columna inexistente: ${invalidCol}`
      );
    }
    assert.deepEqual(updatePersonaDelete.params, [42]);

    const updateCorreoDelete = mockDb.executedQueries.find((q) =>
      /^UPDATE persona_correo\b/i.test(q.sql)
    );
    assert.ok(updateCorreoDelete, 'Debe ejecutarse UPDATE persona_correo SET activo = FALSE');
    assert.deepEqual(updateCorreoDelete.params, [42]);
  } finally {
    mockDb.restore();
  }
});

test('6 y 7. PersonasController mantiene contratos HTTP y parametrización al invocar PersonasService', async () => {
  const mockDb = createMockDb({
    initialPersona: {
      id: 42,
      nombre_completo: 'Dra. Ana Gómez',
      unidad_medica_id: 15,
      activo: true,
    },
  });
  try {
    const ctrl = new PersonasController();

    // PUT /api/ti/personas/42 enviando solo nombre_completo en el body HTTP
    const reqUpdate = {
      params: { id: '42' },
      body: { nombre_completo: 'Dra. Ana Gómez Editada' },
    };
    let statusUpdate = 200;
    let bodyUpdate = null;
    const resUpdate = {
      status(code) {
        statusUpdate = code;
        return this;
      },
      json(payload) {
        bodyUpdate = payload;
        return this;
      },
    };

    await ctrl.update(reqUpdate, resUpdate);
    assert.equal(statusUpdate, 200);
    assert.deepEqual(bodyUpdate, { id: 42 });
    assert.equal(
      mockDb.getState().unidad_medica_id,
      15,
      'Desde PersonasController.update, omitir unidad_medica_id en el body preserva la unidad 15'
    );
  } finally {
    mockDb.restore();
  }
});

test('9. create, update y softDelete ejecutan ROLLBACK y liberan el cliente cuando ocurre un error en la transacción (verificación con mock de cliente)', async () => {
  // 9a. Error en create (al insertar correo complementario en persona_correo)
  const mockCreate = createMockDb({ failOnSqlMatch: 'INSERT INTO persona_correo' });
  try {
    const svc = new PersonasService();
    await assert.rejects(
      () =>
        svc.create({
          nombre_completo: 'Test Rollback',
          unidad_medica_id: 10,
          correos: ['principal@imssb.bc', 'fail@imssb.bc'],
        }),
      /Simulated DB error/
    );
    const sqlList = mockCreate.executedQueries.map((q) => q.sql);
    assert.equal(sqlList[0], 'BEGIN');
    assert.equal(sqlList[sqlList.length - 1], 'ROLLBACK');
    assert.equal(mockCreate.getReleasedCount(), 1);
  } finally {
    mockCreate.restore();
  }

  // 9b. Error en update (persona inactiva o fallo posterior)
  const mockUpdate = createMockDb({ failOnSqlMatch: 'UPDATE persona' });
  try {
    const svc = new PersonasService();
    await assert.rejects(
      () => svc.update(42, { nombre_completo: 'Fallo Update' }),
      /Simulated DB error/
    );
    const sqlList = mockUpdate.executedQueries.map((q) => q.sql);
    assert.equal(sqlList[0], 'BEGIN');
    assert.equal(sqlList[sqlList.length - 1], 'ROLLBACK');
    assert.equal(mockUpdate.getReleasedCount(), 1);
  } finally {
    mockUpdate.restore();
  }

  // 9c. Error en softDelete (cuando la persona tiene un equipo activo asignado)
  const mockDelete = createMockDb({ activeAssignmentCount: 1 });
  try {
    const svc = new PersonasService();
    await assert.rejects(
      () => svc.softDelete(42),
      /No se puede eliminar: persona con equipo asignado\./
    );
    const sqlList = mockDelete.executedQueries.map((q) => q.sql);
    assert.equal(sqlList[0], 'BEGIN');
    assert.equal(sqlList[sqlList.length - 1], 'ROLLBACK');
    assert.equal(mockDelete.getReleasedCount(), 1);
  } finally {
    mockDelete.restore();
  }
});

/**
 * Helper en memoria que simula el comportamiento exacto de PostgreSQL para
 * `PersonasService.listPaged()` y `PersonasService.byId()`, evaluando la precedencia:
 *   COALESCE(NULLIF(TRIM(p.correo_principal), ''), NULLIF(TRIM(pe.email_principal), ''))
 * donde `pe` exige `pc.activo = TRUE AND pc.es_principal = TRUE AND NULLIF(TRIM(pc.correo), '') IS NOT NULL`.
 */
function createReadEmailMockDb({ personas = [], personaCorreos = [], unidades = [] } = {}) {
  const executedQueries = [];
  const origQuery = pool.query;

  const trimNullIfEmpty = (val) => {
    if (val === null || val === undefined) return null;
    const t = String(val).trim();
    return t === '' ? null : t;
  };

  pool.query = async (sql, params = []) => {
    const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
    executedQueries.push({ sql: normalizedSql, rawSql: String(sql), params });

    // 1. Consulta de listPaged (FROM persona p ... COUNT(*) OVER() AS total)
    if (/COUNT\(\*\)\s+OVER\(\)\s+AS\s+total/i.test(normalizedSql)) {
      // Verificar que el SQL utiliza la expresión de precedencia y filtra pc.es_principal = TRUE y pc.activo = TRUE
      assert.match(
        normalizedSql,
        /COALESCE\(\s*NULLIF\(TRIM\(p\.correo_principal\),\s*''\),\s*NULLIF\(TRIM\(pe\.email_principal\),\s*''\)\s*\)\s+AS\s+email_principal/i
      );
      assert.match(normalizedSql, /pc\.activo\s*=\s*TRUE/i);
      assert.match(normalizedSql, /pc\.es_principal\s*=\s*TRUE/i);

      let filtered = personas.filter((p) => p.activo === true);

      // Evaluar parámetros si vienen (q y/o unidad_medica_id)
      let pIdx = 0;
      if (/LOWER\(p\.nombre_completo\)\s+LIKE/i.test(normalizedSql)) {
        const qVal = String(params[pIdx++] || '').toLowerCase();
        filtered = filtered.filter((p) => {
          const um = unidades.find((u) => u.id === p.unidad_medica_id);
          const matchNombre = String(p.nombre_completo || '').toLowerCase().includes(qVal);
          const matchUm = String(um?.nombre || '').toLowerCase().includes(qVal);
          const matchCorreoP = String(p.correo_principal || '').toLowerCase().includes(qVal);
          const matchPc = personaCorreos.some(
            (pc) =>
              pc.persona_id === p.id &&
              pc.activo === true &&
              String(pc.correo || '').toLowerCase().includes(qVal)
          );
          return matchNombre || matchUm || matchCorreoP || matchPc;
        });
      }

      if (/AND\s+p\.unidad_medica_id\s*=\s*\$/i.test(normalizedSql)) {
        const umId = Number(params[pIdx++]);
        filtered = filtered.filter((p) => p.unidad_medica_id === umId);
      }

      // Ordenar igual que SQL: ORDER BY LOWER(p.nombre_completo) ASC, p.id ASC
      filtered.sort((a, b) => {
        const na = String(a.nombre_completo || '').toLowerCase();
        const nb = String(b.nombre_completo || '').toLowerCase();
        if (na < nb) return -1;
        if (na > nb) return 1;
        return a.id - b.id;
      });

      const total = filtered.length;
      const limitMatch = normalizedSql.match(/LIMIT\s+(\d+)\s+OFFSET\s+(\d+)/i);
      const limit = limitMatch ? Number(limitMatch[1]) : 20;
      const offset = limitMatch ? Number(limitMatch[2]) : 0;
      const pageSlice = filtered.slice(offset, offset + limit);

      const rows = pageSlice.map((p) => {
        const um = unidades.find((u) => u.id === p.unidad_medica_id);
        const activePrincipalCorreos = personaCorreos
          .filter(
            (pc) =>
              pc.persona_id === p.id &&
              pc.activo === true &&
              pc.es_principal === true &&
              trimNullIfEmpty(pc.correo) !== null
          )
          .sort((a, b) => b.id - a.id);

        const peEmailPrincipal = activePrincipalCorreos.length
          ? activePrincipalCorreos[0].correo
          : null;

        const email_principal =
          trimNullIfEmpty(p.correo_principal) ?? trimNullIfEmpty(peEmailPrincipal) ?? null;

        const n_correos = personaCorreos.filter(
          (pc) => pc.persona_id === p.id && pc.activo === true
        ).length;

        return {
          id: p.id,
          nombre_completo: p.nombre_completo,
          unidad_medica_id: p.unidad_medica_id ?? null,
          unidad_medica: um ? um.nombre : null,
          email_principal,
          n_correos,
          total: String(total),
        };
      });

      return { rows, rowCount: rows.length };
    }

    // 2. Consulta principal de byId (FROM persona p ... WHERE p.id = $1 AND p.activo = TRUE)
    if (/FROM\s+persona\s+p/i.test(normalizedSql) && /WHERE\s+p\.id\s*=\s*\$1\s+AND\s+p\.activo\s*=\s*TRUE/i.test(normalizedSql)) {
      assert.match(
        normalizedSql,
        /COALESCE\(\s*NULLIF\(TRIM\(p\.correo_principal\),\s*''\),\s*NULLIF\(TRIM\(pe\.email_principal\),\s*''\)\s*\)\s+AS\s+correo/i
      );
      const targetId = Number(params[0]);
      const p = personas.find((item) => item.id === targetId && item.activo === true);
      if (!p) return { rows: [], rowCount: 0 };

      const um = unidades.find((u) => u.id === p.unidad_medica_id);
      const activePrincipalCorreos = personaCorreos
        .filter(
          (pc) =>
            pc.persona_id === p.id &&
            pc.activo === true &&
            pc.es_principal === true &&
            trimNullIfEmpty(pc.correo) !== null
        )
        .sort((a, b) => b.id - a.id);

      const peEmailPrincipal = activePrincipalCorreos.length
        ? activePrincipalCorreos[0].correo
        : null;

      const correo =
        trimNullIfEmpty(p.correo_principal) ?? trimNullIfEmpty(peEmailPrincipal) ?? null;

      return {
        rows: [
          {
            id: p.id,
            nombre_completo: p.nombre_completo,
            unidad_medica_id: p.unidad_medica_id ?? null,
            unidad_medica: um ? um.nombre : null,
            correo,
          },
        ],
        rowCount: 1,
      };
    }

    // 3. Consulta secundaria de byId (SELECT id, correo, es_principal FROM persona_correo WHERE persona_id = $1 AND activo = TRUE)
    if (/FROM\s+persona_correo\s+WHERE\s+persona_id\s*=\s*\$1\s+AND\s+activo\s*=\s*TRUE/i.test(normalizedSql)) {
      const targetId = Number(params[0]);
      const rows = personaCorreos
        .filter((pc) => pc.persona_id === targetId && pc.activo === true)
        .sort((a, b) => {
          if (a.es_principal !== b.es_principal) return a.es_principal ? -1 : 1;
          return b.id - a.id;
        })
        .map((pc) => ({
          id: pc.id,
          correo: pc.correo,
          es_principal: pc.es_principal,
        }));
      return { rows, rowCount: rows.length };
    }

    throw new Error(`Unexpected SQL in read test: ${normalizedSql}`);
  };

  return {
    executedQueries,
    restore() {
      pool.query = origQuery;
    },
  };
}

test('10. Lectura compatible de correos (6.4B-2B.1): precedencia persona.correo_principal > persona_correo(activo y principal) > null, sin duplicados y conservando contratos', async () => {
  const dataset = {
    unidades: [{ id: 1, nombre: 'Hospital General Tijuana' }],
    personas: [
      // Caso 1: Únicamente persona.correo_principal (como las 64 personas en BD)
      {
        id: 101,
        nombre_completo: '01 Solo Correo Principal',
        unidad_medica_id: 1,
        activo: true,
        correo_principal: 'solo.persona@imssb.gob.mx',
      },
      // Caso 2: Únicamente correo complementario activo y principal (persona.correo_principal NULL o espacios)
      {
        id: 102,
        nombre_completo: '02 Solo Complementario Activo Principal',
        unidad_medica_id: 1,
        activo: true,
        correo_principal: '   ',
      },
      // Caso 3: Ambos correos coincidentes
      {
        id: 103,
        nombre_completo: '03 Ambos Coincidentes',
        unidad_medica_id: 1,
        activo: true,
        correo_principal: 'coincidente@imssb.gob.mx',
      },
      // Caso 4: Ambos correos diferentes (precedencia: gana persona.correo_principal)
      {
        id: 104,
        nombre_completo: '04 Ambos Diferentes Precedencia',
        unidad_medica_id: 1,
        activo: true,
        correo_principal: 'canonico.persona@imssb.gob.mx',
      },
      // Caso 5: Sin ninguno de los dos correos
      {
        id: 105,
        nombre_completo: '05 Sin Ningun Correo',
        unidad_medica_id: 1,
        activo: true,
        correo_principal: null,
      },
      // Caso 6: Con correo complementario inactivo (y sin correo_principal) -> debe devolver null
      {
        id: 106,
        nombre_completo: '06 Con Complementario Inactivo',
        unidad_medica_id: 1,
        activo: true,
        correo_principal: null,
      },
      // Caso 7: Con correo complementario activo pero NO principal (es_principal = false) y otro principal activo -> sin duplicados en paginado
      {
        id: 107,
        nombre_completo: '07 Multiples Correos Complementarios',
        unidad_medica_id: 1,
        activo: true,
        correo_principal: null,
      },
    ],
    personaCorreos: [
      // Para 102: activo y principal
      { id: 1, persona_id: 102, correo: 'complementario.102@imssb.gob.mx', es_principal: true, activo: true },
      // Para 103: coincidente activo y principal
      { id: 2, persona_id: 103, correo: 'coincidente@imssb.gob.mx', es_principal: true, activo: true },
      // Para 104: diferente activo y principal
      { id: 3, persona_id: 104, correo: 'secundario.104@imssb.gob.mx', es_principal: true, activo: true },
      // Para 106: inactivo y principal (no debe leerse)
      { id: 4, persona_id: 106, correo: 'inactivo.106@imssb.gob.mx', es_principal: true, activo: false },
      // Para 107: múltiples filas en persona_correo (una secundaria con id mayor y una principal activa)
      { id: 5, persona_id: 107, correo: 'principal.107@imssb.gob.mx', es_principal: true, activo: true },
      { id: 6, persona_id: 107, correo: 'secundario.107@imssb.gob.mx', es_principal: false, activo: true },
    ],
  };

  const mock = createReadEmailMockDb(dataset);
  try {
    const svc = new PersonasService();
    const ctrl = new PersonasController();

    // A) Verificar listado paginado completo (sin duplicados y con precedencia exacta)
    const pageOut = await svc.listPaged({ page: 1, pageSize: 20 });
    assert.equal(pageOut.total, 7, 'No deben duplicarse filas aunque existan múltiples persona_correo');
    assert.equal(pageOut.items.length, 7);

    const byIdMap = new Map(pageOut.items.map((i) => [i.id, i]));
    assert.equal(byIdMap.get(101).email_principal, 'solo.persona@imssb.gob.mx');
    assert.equal(byIdMap.get(101).n_correos, 0);

    assert.equal(byIdMap.get(102).email_principal, 'complementario.102@imssb.gob.mx');
    assert.equal(byIdMap.get(102).n_correos, 1);

    assert.equal(byIdMap.get(103).email_principal, 'coincidente@imssb.gob.mx');
    assert.equal(byIdMap.get(104).email_principal, 'canonico.persona@imssb.gob.mx');
    assert.equal(byIdMap.get(105).email_principal, null);
    assert.equal(byIdMap.get(106).email_principal, null);
    assert.equal(byIdMap.get(107).email_principal, 'principal.107@imssb.gob.mx');
    assert.equal(byIdMap.get(107).n_correos, 2);

    // B) Verificar consulta por ID (byId) en cada escenario
    const p101 = await svc.byId(101);
    assert.equal(p101.correo, 'solo.persona@imssb.gob.mx');
    assert.equal(p101.email_principal, 'solo.persona@imssb.gob.mx');
    assert.deepEqual(
      p101.correos,
      [],
      'Persona con correo_principal y sin filas en persona_correo debe devolver correos: [] (sin objetos sintéticos con id: null)'
    );

    const p102 = await svc.byId(102);
    assert.equal(p102.correo, 'complementario.102@imssb.gob.mx');
    assert.equal(p102.email_principal, 'complementario.102@imssb.gob.mx');
    assert.deepEqual(p102.correos, [
      { id: 1, correo: 'complementario.102@imssb.gob.mx', es_principal: true },
    ]);
    assert.ok(
      p102.correos.every((c) => typeof c.id === 'number' && c.id > 0),
      'Todos los elementos de correos[] deben tener un id numérico real de persona_correo'
    );

    const p104 = await svc.byId(104);
    assert.equal(
      p104.correo,
      'canonico.persona@imssb.gob.mx',
      'En byId debe prevalecer persona.correo_principal cuando difiere de persona_correo'
    );
    assert.equal(p104.email_principal, 'canonico.persona@imssb.gob.mx');
    assert.deepEqual(p104.correos, [
      { id: 3, correo: 'secundario.104@imssb.gob.mx', es_principal: true },
    ]);

    const p105 = await svc.byId(105);
    assert.equal(p105.correo, null);
    assert.equal(p105.email_principal, null);
    assert.deepEqual(p105.correos, []);

    const p106 = await svc.byId(106);
    assert.equal(p106.correo, null);
    assert.equal(p106.email_principal, null);
    assert.deepEqual(p106.correos, []);

    const p107 = await svc.byId(107);
    assert.equal(p107.correo, 'principal.107@imssb.gob.mx');
    assert.equal(p107.email_principal, 'principal.107@imssb.gob.mx');
    assert.equal(p107.correos.length, 2);
    assert.ok(p107.correos.every((c) => typeof c.id === 'number' && c.id > 0));

    // C) Verificar conservación de contratos HTTP desde PersonasController (list y byId)
    let listPayload = null;
    await ctrl.list(
      { query: { page: '1', pageSize: '10', q: 'solo.persona' } },
      {
        status() {
          return this;
        },
        json(data) {
          listPayload = data;
          return this;
        },
      }
    );
    assert.ok(listPayload);
    assert.equal(listPayload.total, 1);
    assert.equal(listPayload.items[0].id, 101);
    assert.equal(listPayload.items[0].email_principal, 'solo.persona@imssb.gob.mx');

    let byIdPayload = null;
    await ctrl.byId(
      { params: { id: '101' } },
      {
        sendStatus() {
          return this;
        },
        status() {
          return this;
        },
        json(data) {
          byIdPayload = data;
          return this;
        },
      }
    );
    assert.ok(byIdPayload);
    assert.equal(byIdPayload.id, 101);
    assert.equal(byIdPayload.correo, 'solo.persona@imssb.gob.mx');
    assert.equal(byIdPayload.email_principal, 'solo.persona@imssb.gob.mx');
    assert.deepEqual(byIdPayload.correos, []);
  } finally {
    mock.restore();
  }
});

test('11 (TI-2C.1). CREATE sin correo ni unidad permite NULL, y CREATE con correo principal no duplica fila en persona_correo', async () => {
  // 1) Alta sin correo ni unidad
  const mock1 = createMockDb();
  try {
    const svc = new PersonasService();
    const res = await svc.create({ nombre_completo: 'Trabajador Sin Correo' });
    assert.deepEqual(res, { id: 42 });
    assert.equal(mock1.getState().nombre_completo, 'Trabajador Sin Correo');
    assert.equal(mock1.getState().unidad_medica_id, null);
    assert.equal(mock1.getState().correo_principal, null);

    const pcInserts = mock1.executedQueries.filter((q) => /^INSERT INTO persona_correo/i.test(q.sql));
    assert.equal(pcInserts.length, 0, 'No debe insertar en persona_correo cuando no hay correo');
  } finally {
    mock1.restore();
  }

  // 2) Alta con correo principal (via correo_principal o correos: [uno]) no fabrica fila redundante en persona_correo
  const mock2 = createMockDb();
  try {
    const svc = new PersonasService();
    await svc.create({
      nombre_completo: 'Médico Con Correo',
      unidad_medica_id: 10,
      correo_principal: '  medico@imssb.gob.mx ',
    });
    assert.equal(mock2.getState().correo_principal, 'medico@imssb.gob.mx');
    const pcInserts = mock2.executedQueries.filter((q) => /^INSERT INTO persona_correo/i.test(q.sql));
    assert.equal(pcInserts.length, 0, 'No debe replicar el correo principal único en persona_correo');
  } finally {
    mock2.restore();
  }
});

test('12 (TI-2C.1). UPDATE preserva campos omitidos, distingue omisión vs NULL en unidad_medica_id y correo_principal, y limpia es_principal al desactivar', async () => {
  // A) Solo nombre -> preserva unidad_medica_id, correo_principal y persona_correo
  const mockNombre = createMockDb({
    initialPersona: {
      id: 42,
      nombre_completo: 'Nombre Original',
      unidad_medica_id: 15,
      activo: true,
      correo_principal: 'original@imssb.gob.mx',
    },
  });
  try {
    const svc = new PersonasService();
    await svc.update(42, { nombre_completo: 'Nombre Nuevo' });
    assert.equal(mockNombre.getState().nombre_completo, 'Nombre Nuevo');
    assert.equal(mockNombre.getState().unidad_medica_id, 15);
    assert.equal(mockNombre.getState().correo_principal, 'original@imssb.gob.mx');
    assert.equal(
      mockNombre.executedQueries.filter((q) => /persona_correo/i.test(q.sql)).length,
      0,
      'No debe tocar persona_correo al actualizar solo el nombre'
    );
  } finally {
    mockNombre.restore();
  }

  // B) Eliminación explícita de unidad_medica_id mediante NULL desde PersonasController.update
  const mockNullUnidad = createMockDb({
    initialPersona: {
      id: 42,
      nombre_completo: 'Persona',
      unidad_medica_id: 15,
      activo: true,
      correo_principal: 'original@imssb.gob.mx',
    },
  });
  try {
    const ctrl = new PersonasController();
    let jsonPayload = null;
    await ctrl.update(
      { params: { id: '42' }, body: { unidad_medica_id: null } },
      { status() { return this; }, json(d) { jsonPayload = d; return this; } }
    );
    assert.deepEqual(jsonPayload, { id: 42 });
    assert.equal(mockNullUnidad.getState().unidad_medica_id, null);
    assert.equal(mockNullUnidad.getState().correo_principal, 'original@imssb.gob.mx');
  } finally {
    mockNullUnidad.restore();
  }

  // C) Eliminación explícita de correo_principal mediante NULL o correos: [] limpia es_principal = FALSE
  const mockDelCorreo = createMockDb({
    initialPersona: {
      id: 42,
      nombre_completo: 'Persona',
      unidad_medica_id: 15,
      activo: true,
      correo_principal: 'original@imssb.gob.mx',
    },
  });
  try {
    const svc = new PersonasService();
    await svc.update(42, { correos: [] });
    assert.equal(mockDelCorreo.getState().correo_principal, null);
    const deactivateQuery = mockDelCorreo.executedQueries.find((q) =>
      /UPDATE persona_correo SET activo = FALSE, es_principal = FALSE/i.test(q.sql)
    );
    assert.ok(deactivateQuery, 'Al desactivar filas en persona_correo debe establecer es_principal = FALSE');

    // Nunca toca app_users
    assert.equal(
      mockDelCorreo.executedQueries.some((q) => /app_users/i.test(q.sql)),
      false,
      'PersonasService nunca debe modificar app_users'
    );
  } finally {
    mockDelCorreo.restore();
  }

  // D) Sustitución de correo complementario principal limpia es_principal antes de promover el nuevo
  const mockReplace = createMockDb();
  try {
    const svc = new PersonasService();
    await svc.update(42, { correos: ['nuevo.principal@imssb.gob.mx', 'secundario@imssb.gob.mx'] });
    assert.equal(mockReplace.getState().correo_principal, 'nuevo.principal@imssb.gob.mx');

    const resetPrincipalIdx = mockReplace.executedQueries.findIndex((q) =>
      /UPDATE persona_correo SET es_principal = FALSE WHERE persona_id = \$1 AND es_principal = TRUE/i.test(q.sql)
    );
    const setPrincipalIdx = mockReplace.executedQueries.findIndex((q) =>
      /UPDATE persona_correo SET es_principal = TRUE WHERE persona_id = \$1 AND lower\(correo\) = \$2/i.test(q.sql)
    );
    assert.ok(resetPrincipalIdx >= 0 && setPrincipalIdx > resetPrincipalIdx, 'Debe limpiar es_principal antes de asignar el nuevo principal');
  } finally {
    mockReplace.restore();
  }
});
