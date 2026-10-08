const assert = require('node:assert/strict');
const test = require('node:test');
const CnisGruposTerapeuticosService = require('../dist/services/cnis-grupos-terapeuticos.service').default;

function crearDb(rows) {
  const llamadas = [];
  return {
    llamadas,
    query: async (text, values) => {
      llamadas.push({ text, values });
      return { rows };
    },
  };
}

function verificarRelacionCnis(sql) {
  assert.match(sql, /FROM public\.articulos a/);
  assert.match(sql, /regexp_replace\(trim\(a\.clave\), '\[\^0-9\]', '', 'g'\) = i\.clave_normalizada/);
  assert.match(sql, /cnis\.insumo_grupo/);
  assert.match(sql, /cnis\.grupo/);
  assert.doesNotMatch(sql, /clavea/);
}

test('devuelve únicamente grupos usados por artículos y ordenados por número', async () => {
  const esperado = [{ numero: 16, nombre: 'Oncología' }];
  const db = crearDb(esperado);
  const service = new CnisGruposTerapeuticosService(db);

  assert.deepEqual(await service.obtenerGruposUtilizados(), esperado);
  assert.equal(db.llamadas.length, 1);
  verificarRelacionCnis(db.llamadas[0].text);
  assert.match(db.llamadas[0].text, /SELECT DISTINCT/);
  assert.match(db.llamadas[0].text, /ORDER BY numero/);
});

test('conserva las asociaciones muchos a muchos de una misma clave', async () => {
  const esperado = [
    { clave: '010.000.0001.00', grupo: 5, grupoNombre: 'Endocrinología' },
    { clave: '010.000.0001.00', grupo: 16, grupoNombre: 'Oncología' },
  ];
  const db = crearDb(esperado);
  const service = new CnisGruposTerapeuticosService(db);

  assert.deepEqual(await service.obtenerArticulosConGrupo(), esperado);
  verificarRelacionCnis(db.llamadas[0].text);
  assert.match(db.llamadas[0].text, /g\.nombre AS "grupoNombre"/);
  assert.match(db.llamadas[0].text, /ORDER BY grupo, a\.clave/);
});

test('filtra el grupo con un parámetro y conserva descripciones nulas', async () => {
  const esperado = [{ clave: '010.000.0001.00', descripcion: null, presentacion: null }];
  const db = crearDb(esperado);
  const service = new CnisGruposTerapeuticosService(db);

  assert.deepEqual(await service.obtenerArticulosPorGrupo(16), esperado);
  verificarRelacionCnis(db.llamadas[0].text);
  assert.match(db.llamadas[0].text, /WHERE g\.numero = \$1/);
  assert.deepEqual(db.llamadas[0].values, [16]);
});

test('un grupo sin asociaciones devuelve una colección vacía', async () => {
  const service = new CnisGruposTerapeuticosService(crearDb([]));
  assert.deepEqual(await service.obtenerArticulosPorGrupo(999), []);
});

test('PostgreSQL ejecuta normalización, deduplicación y filtro con datos aislados', {
  skip: !process.env.CNIS_TEST_CONNECTION_STRING,
}, async () => {
  const { Pool } = require('pg');
  const dbReal = new Pool({ connectionString: process.env.CNIS_TEST_CONNECTION_STRING });
  const fixture = `
    WITH articulos_fixture(clave, clavea, descripcion, presentacion) AS (VALUES
      ('010.000.0001.00', 'ignorar', NULL::text, NULL::text),
      (' 010-000-0002-00 ', 'ignorar', 'Descripción operativa', 'Caja'),
      (' 010-000-0002-00 ', 'ignorar', 'Descripción operativa', 'Caja'),
      ('999', '010.000.0001.00', 'No existe en CNIS', 'Caja')),
    insumo_fixture(id, clave_normalizada) AS (VALUES
      (1, '010000000100'), (2, '010000000200'), (3, 'ausente')),
    insumo_grupo_fixture(insumo_id, grupo_id) AS (VALUES
      (1, 10), (2, 20), (2, 30), (2, 20)),
    grupo_fixture(id, numero, nombre) AS (VALUES
      (10, 1, 'Analgesia'), (20, 16, 'Oncología'),
      (30, 23, 'Cuidados Paliativos'), (40, 2, 'Sin artículos'))
  `;
  const dbFixture = {
    query: (text, values) => dbReal.query(
      fixture + text
        .replaceAll('public.articulos', 'articulos_fixture')
        .replaceAll('cnis.insumo_grupo', 'insumo_grupo_fixture')
        .replaceAll('cnis.insumo', 'insumo_fixture')
        .replaceAll('cnis.grupo', 'grupo_fixture'),
      values
    ),
  };

  try {
    const service = new CnisGruposTerapeuticosService(dbFixture);
    assert.deepEqual(await service.obtenerGruposUtilizados(), [
      { numero: 1, nombre: 'Analgesia' },
      { numero: 16, nombre: 'Oncología' },
      { numero: 23, nombre: 'Cuidados Paliativos' },
    ]);
    assert.deepEqual(await service.obtenerArticulosConGrupo(), [
      { clave: '010.000.0001.00', grupo: 1, grupoNombre: 'Analgesia' },
      { clave: ' 010-000-0002-00 ', grupo: 16, grupoNombre: 'Oncología' },
      { clave: ' 010-000-0002-00 ', grupo: 23, grupoNombre: 'Cuidados Paliativos' },
    ]);
    assert.deepEqual(await service.obtenerArticulosPorGrupo(16), [
      { clave: ' 010-000-0002-00 ', descripcion: 'Descripción operativa', presentacion: 'Caja' },
    ]);
    assert.deepEqual(await service.obtenerArticulosPorGrupo(999), []);
  } finally {
    await dbReal.end();
  }
});
