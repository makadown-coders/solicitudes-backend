const assert = require('node:assert/strict');
const { resolveRhAccess, requireRhAccess } = require('../dist/auth/requireRhAccess');
const RhService = require('../dist/services/rh.service').default;
const RhController = require('../dist/controllers/rh.controller').default;
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

  // Mock de pool.query para pruebas 10-15
  const originalQuery = pool.query.bind(pool);
  const service = new RhService();

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
        grantedBy: 'RECURSOS_HUMANOS',
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
      const controller = new RhController();
      const req = { rhAccess: { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' } };
      const res = createMockRes();
      await controller.unidadesAutorizadas(req, res);
      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Error interno al consultar unidades autorizadas de RH' });
      passed++;
    }
  } finally {
    pool.query = originalQuery;
  }

  console.log(`RH-API.1 TESTS PASSED: ${passed}/15`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
