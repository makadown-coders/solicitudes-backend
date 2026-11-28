const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pool } = require('../dist/db/pool');
const Controller = require('../dist/controllers/rh.controller').default;
const router = require('../dist/routes/rh').default;

const operador = '12345678-1234-4234-9234-123456789abc';
const acceso = { scope: 'GLOBAL', grantedBy: 'RECURSOS_HUMANOS' };
const ruta = '/unidades/:unidadId/personas/:personaId/supervision-directa';
const revision = '2026-11-27T00:00:00.123456Z';
const motivo = 'Validación RH';
const cambio = (persona_supervisora_id = 20, revision_esperada = null) =>
  ({ persona_supervisora_id, motivo, revision_esperada });
const relacion = (persona_supervisora_id, actualizado_en = revision) =>
  ({ persona_supervisora_id, nombre_supervisor: persona_supervisora_id ? 'Supervisor sintético' : null, motivo, actualizado_en });

async function request(method, personaId = 12, body, opciones = {}) {
  const req = {
    rhAccess: acceso, user: { sub: operador }, params: { unidadId: '177', personaId: String(personaId) },
    body, get() {}, ...opciones,
  };
  const res = {
    set(name, value) { assert.equal(name, 'Cache-Control'); assert.equal(value, 'no-store'); },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; },
  };
  await new Controller()[method === 'GET' ? 'getSupervisionDirecta' : 'patchSupervisionDirecta'](req, res);
  return res;
}

function base(t, opciones = {}) {
  const filas = new Map(opciones.filas ?? []);
  const auditorias = [];
  const eventos = [];
  let turno = Promise.resolve();
  let consecutivo = 123456;

  async function query(sql, args = [], tx) {
    const salida = (rows = []) => ({ rows });
    if (sql === 'BEGIN ISOLATION LEVEL READ COMMITTED') {
      eventos.push('begin');
      return salida();
    }
    if (sql.startsWith('SELECT id FROM public.unidad_medica')) {
      assert.deepEqual(args, [177]);
      assert.match(sql, /activo IS TRUE/);
      if (tx) {
        assert.match(sql, /FOR NO KEY UPDATE/);
        const espera = turno;
        turno = new Promise((resolve) => { tx.liberar = resolve; });
        await espera;
        tx.bloqueado = true;
        eventos.push('bloqueo');
      } else {
        assert.doesNotMatch(sql, /FOR NO KEY UPDATE/);
      }
      return salida(opciones.sinUnidad ? [] : [{ id: 177 }]);
    }
    if (tx) assert.ok(tx.bloqueado, 'Las operaciones requieren el bloqueo de la unidad');
    if (sql.includes('AS adscripciones')) {
      const [, persona] = args;
      assert.match(sql, /al.unidad_medica_id = \$1/);
      assert.match(sql, /al.activo IS TRUE AND al.vigente_desde <= CURRENT_DATE/);
      assert.match(sql, /al.vigente_hasta >= CURRENT_DATE/);
      const datos = opciones.personas?.[persona];
      const adscripciones = opciones.adscripciones?.[persona];
      const hoy = '2026-11-27';
      const vigentes = adscripciones?.filter(({ desde, hasta, activo }) =>
        activo && desde <= hoy && (hasta == null || hasta >= hoy));
      return salida(datos === null ? [] : [{
        nombre_completo: `Persona ${persona}`, activo: true, adscripciones: vigentes?.length ?? 1, ...datos,
      }]);
    }
    if (sql.startsWith('SELECT s.persona_supervisora_id')) {
      const [, persona] = args;
      const fila = tx?.cambio?.[0] === persona ? tx.cambio[1] : filas.get(persona);
      return salida(fila ? [fila] : []);
    }
    if (sql.startsWith('WITH RECURSIVE cadena')) {
      assert.match(sql, /s.unidad_medica_id = \$1/);
      assert.match(sql, /ANY\(c.ruta\)/);
      assert.match(sql, /NOT c.repetida/);
      const [, persona, supervisor] = args;
      const vistos = new Set();
      let nodo = supervisor;
      while (nodo != null) {
        if (nodo === persona || vistos.has(nodo)) return salida([{ ciclo: true }]);
        vistos.add(nodo);
        nodo = (tx?.cambio?.[0] === nodo ? tx.cambio[1] : filas.get(nodo))?.persona_supervisora_id;
      }
      return salida([{ ciclo: false }]);
    }
    if (sql.startsWith('WITH puestos AS')) {
      assert.match(sql, /v.estado = 'VIGENTE'/);
      assert.match(sql, /o.estado = 'OCUPADO'/);
      assert.match(sql, /padre.activo IS TRUE/);
      assert.match(sql, /p.activo IS TRUE AND p.id <> \$2/);
      assert.match(sql, /WHERE \(SELECT COUNT\(\*\) FROM puestos\) = 1/);
      return salida(opciones.estructura ? [opciones.estructura] : []);
    }
    if (sql.startsWith('INSERT INTO public.rh_supervision_directa')) {
      assert.ok(tx);
      assert.match(sql, /ON CONFLICT \(unidad_medica_id, persona_supervisada_id\)/);
      assert.match(sql, /GREATEST\(clock_timestamp\(\), s.actualizado_en \+ INTERVAL '1 microsecond'\)/);
      const [unidad, persona, supervisor, razon, actor] = args;
      assert.equal(unidad, 177);
      assert.equal(actor, operador);
      tx.cambio = [persona, { ...relacion(supervisor, `2026-11-27T00:00:00.${++consecutivo}Z`), motivo: razon }];
      eventos.push('escritura');
      return salida();
    }
    if (sql.startsWith('INSERT INTO public.app_audit_logs')) {
      assert.ok(tx?.cambio);
      assert.deepEqual(args.slice(0, 3), [operador, 'RH_ORG_UPDATE_SUPERVISION_DIRECTA', 'rh_supervision_directa']);
      eventos.push('auditoria');
      if (opciones.fallaAuditoria) throw new Error('Auditoría simulada');
      tx.auditoria = JSON.parse(args[5]);
      return salida();
    }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') {
      eventos.push(sql);
      if (sql === 'COMMIT' && tx.cambio) {
        assert.ok(tx.auditoria);
        filas.set(...tx.cambio);
        auditorias.push(tx.auditoria);
      }
      tx.liberar?.();
      return salida();
    }
    assert.fail(sql);
  }

  const directa = t.mock.method(pool, 'query', (sql, args) => {
    assert.match(sql, /^(SELECT|WITH)/);
    return query(sql, args);
  });
  const conectar = t.mock.method(pool, 'connect', async () => {
    const tx = {};
    return { query: (sql, args) => query(sql, args, tx), release() { eventos.push('release'); } };
  });
  return { filas, auditorias, eventos, directa, conectar };
}

test('GET distingue las tres situaciones y solo usa SELECT', async (t) => {
  const { eventos, conectar } = base(t, { filas: [[20, relacion(25)], [25, relacion(null)]] });
  for (const [personaId, estado, supervisor] of [
    [12, 'PENDIENTE', null], [20, 'ASIGNADO', 25], [25, 'SIN_JEFE_ASIGNADO', null],
  ]) {
    const res = await request('GET', personaId);
    assert.equal(res.code, 200);
    assert.equal(res.body.nombre_trabajador, `Persona ${personaId}`);
    assert.equal(res.body.estado, estado);
    assert.equal(res.body.persona_supervisora_id, supervisor);
    assert.equal(res.body.nombre_supervisor, supervisor ? 'Supervisor sintético' : null);
    assert.equal(res.body.revision, estado === 'PENDIENTE' ? null : revision);
    assert.equal(res.body.actualizado_en, res.body.revision);
    assert.equal(res.body.puesto_estructural, null);
    assert.equal(res.body.sugerencia, null);
  }
  assert.equal(conectar.mock.callCount(), 0);
  assert.deepEqual(eventos, []);
});

test('distingue la tabla de supervisión ausente de otros errores de esquema', async (t) => {
  t.mock.method(console, 'error', () => {});
  const consulta = t.mock.method(pool, 'query');
  for (const [tabla, status, codigo] of [
    ['rh_supervision_directa', 503, 'SUPERVISION_ESQUEMA_NO_DISPONIBLE'],
    ['rh_org_ocupacion', 500, 'ERROR_INTERNO'],
  ]) {
    consulta.mock.mockImplementation(async () => {
      throw Object.assign(new Error(`relation "public.${tabla}" does not exist`), { code: '42P01' });
    });
    const respuesta = await request('GET');
    assert.equal(respuesta.code, status);
    assert.equal(respuesta.body.codigo, codigo);
  }
});

test('primera asignación, sustitución, supervisor compartido, decisión NULL e idempotencia', async (t) => {
  const { auditorias, eventos } = base(t, { filas: [[30, relacion(20)]] });
  let rev = null;
  for (const [supervisor, estado] of [[20, 'ASIGNADO'], [25, 'ASIGNADO'], [null, 'SIN_JEFE_ASIGNADO']]) {
    const res = await request('PATCH', 12, cambio(supervisor, rev));
    assert.equal(res.code, 200);
    assert.equal(res.body.estado, estado);
    assert.notEqual(res.body.revision, rev);
    assert.equal(res.body.persona_supervisora_id, supervisor);
    rev = res.body.revision;
  }
  assert.deepEqual(auditorias.map((a) => [a.relacion_anterior_existia, a.supervisor_anterior_id, a.supervisor_nuevo_id]),
    [[false, null, 20], [true, 20, 25], [true, 25, null]]);
  assert.equal(auditorias[0].motivo, motivo);
  assert.equal(auditorias[0].unidad_medica_id, 177);
  assert.equal(auditorias[0].persona_supervisada_id, 12);
  assert.equal(auditorias.at(-1).actualizado_en, rev);
  assert.deepEqual(eventos.slice(-6), ['begin', 'bloqueo', 'escritura', 'auditoria', 'COMMIT', 'release']);
  const repetida = await request('PATCH', 12, cambio(null, rev));
  assert.equal(repetida.body.revision, rev);
  assert.equal(auditorias.length, 3);
  assert.equal((await request('PATCH', 12, cambio(null))).body.codigo, 'REVISION_OBSOLETA');
});

for (const [nombre, personas, codigo, status = 409] of [
  ['trabajador inexistente', { 12: null }, 'TRABAJADOR_NO_EXISTE', 404],
  ['trabajador inactivo', { 12: { activo: false } }, 'TRABAJADOR_INACTIVO'],
  ['supervisor inexistente', { 20: null }, 'SUPERVISOR_NO_EXISTE', 404],
  ['supervisor inactivo', { 20: { activo: false } }, 'SUPERVISOR_INACTIVO'],
  ['adscripción ausente', { 12: { adscripciones: 0 } }, 'TRABAJADOR_SIN_ADSCRIPCION_VIGENTE'],
  ['supervisor de otra unidad', { 20: { adscripciones: 0 } }, 'SUPERVISOR_SIN_ADSCRIPCION_VIGENTE'],
  ['adscripción ambigua del supervisor', { 20: { adscripciones: 2 } }, 'SUPERVISOR_ADSCRIPCION_AMBIGUA'],
  ['adscripción ambigua del trabajador', { 12: { adscripciones: 2 } }, 'TRABAJADOR_ADSCRIPCION_AMBIGUA'],
]) {
  test(nombre, async (t) => {
    const { eventos } = base(t, { personas });
    const res = await request('PATCH', 12, cambio());
    assert.equal(res.code, status);
    assert.equal(res.body.codigo, codigo);
    assert.deepEqual(eventos, ['begin', 'bloqueo', 'ROLLBACK', 'release']);
    if (codigo.startsWith('TRABAJADOR')) assert.equal((await request('GET')).body.codigo, codigo);
  });
}

for (const [nombre, desde, hasta] of [
  ['adscripción futura', '2026-11-28', null],
  ['adscripción vencida', '2026-11-01', '2026-11-26'],
]) {
  test(nombre, async (t) => {
    const { eventos } = base(t, { adscripciones: { 20: [{ desde, hasta, activo: true }] } });
    const res = await request('PATCH', 12, cambio());
    assert.equal(res.code, 409);
    assert.equal(res.body.codigo, 'SUPERVISOR_SIN_ADSCRIPCION_VIGENTE');
    assert.ok(!eventos.includes('escritura'));
  });
}

test('primera decisión sin jefe y adscripción vigente en ambos límites inclusivos', async (t) => {
  const { filas, auditorias } = base(t, {
    adscripciones: { 12: [{ desde: '2026-11-27', hasta: '2026-11-27', activo: true }] },
  });
  assert.equal((await request('GET')).body.estado, 'PENDIENTE');
  const res = await request('PATCH', 12, cambio(null));
  assert.equal(res.code, 200);
  assert.equal(res.body.estado, 'SIN_JEFE_ASIGNADO');
  assert.equal(filas.get(12).persona_supervisora_id, null);
  assert.equal(auditorias[0].relacion_anterior_existia, false);
});

for (const [nombre, filas] of [
  ['ciclo de dos', [[20, relacion(12)]]],
  ['ciclo de tres', [[20, relacion(25)], [25, relacion(12)]]],
  ['ciclo preexistente alcanzable', [[20, relacion(25)], [25, relacion(20)]]],
]) {
  test(nombre, async (t) => {
    const { eventos, auditorias } = base(t, { filas });
    const res = await request('PATCH', 12, cambio());
    assert.equal(res.code, 409);
    assert.equal(res.body.codigo, 'CICLO_SUPERVISION');
    assert.ok(!eventos.includes('escritura'));
    assert.equal(auditorias.length, 0);
  });
}

test('dos solicitudes cruzadas esperan el mismo bloqueo y solo una se confirma', async (t) => {
  const { auditorias, eventos } = base(t);
  const resultado = await Promise.all([request('PATCH', 12, cambio(20)), request('PATCH', 20, cambio(12))]);
  assert.deepEqual(resultado.map((res) => res.code).sort(), [200, 409]);
  assert.equal(resultado.find((res) => res.code === 409).body.codigo, 'CICLO_SUPERVISION');
  assert.equal(auditorias.length, 1);
  assert.ok(eventos.lastIndexOf('bloqueo') > eventos.indexOf('COMMIT'));
});

test('revierte una escritura si falla la auditoría', async (t) => {
  const { eventos, filas, auditorias } = base(t, { fallaAuditoria: true });
  t.mock.method(console, 'error', () => {});
  const res = await request('PATCH', 12, cambio());
  assert.equal(res.code, 500);
  assert.deepEqual(eventos.slice(-4), ['escritura', 'auditoria', 'ROLLBACK', 'release']);
  assert.equal(filas.size, 0);
  assert.equal(auditorias.length, 0);
});

for (const [nombre, sugerencia, filas, visible] of [
  ['padre ocupado elegible', { persona_id: 20, nombre_completo: 'Jefatura', puesto_id: 5, denominacion: 'Padre' }, [], true],
  ['padre vacante', null, [], false],
  ['padre ocupado que formaría ciclo', { persona_id: 20, puesto_id: 5 }, [[20, relacion(12)]], false],
]) {
  test(nombre, async (t) => {
    const puesto = { puesto_id: 6, denominacion: 'Hijo', puesto_padre_id: 5 };
    const { eventos } = base(t, { filas, estructura: { ...puesto, sugerencia } });
    const res = await request('GET');
    assert.equal(res.body.estado, 'PENDIENTE');
    assert.deepEqual(res.body.puesto_estructural, puesto);
    assert.deepEqual(res.body.sugerencia, visible ? sugerencia : null);
    assert.deepEqual(eventos, []);
  });
}

test('acceso exclusivo, rutas y validación previa a cualquier consulta', async (t) => {
  const db = base(t);
  for (const method of ['GET', 'PATCH']) {
    const layer = router.stack.find(({ route }) => route?.path === ruta && route.methods[method.toLowerCase()]);
    assert.equal(layer.route.stack[0].name, 'requireAuth');
    assert.equal(layer.route.stack.length, 3);
    for (const rhAccess of [undefined, { ...acceso, scope: 'CLUES' }, { ...acceso, grantedBy: 'ADMIN_TIC' }]) {
      assert.equal((await request(method, 12, cambio(), { rhAccess })).body.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal((await request(method, 12, cambio(), { user: null })).code, 401);
    assert.equal((await request(method, 12, cambio(), { params: { unidadId: '178', personaId: '12' } })).body.codigo, 'UNIDAD_FUERA_DE_PILOTO');
    assert.equal((await request(method, 'no-numérico')).body.codigo, 'IDENTIFICADOR_INVALIDO');
  }
  for (const [body, codigo] of [
    [{ ...cambio(), extra: true }, 'CUERPO_INVALIDO'], [{}, 'CUERPO_INVALIDO'],
    [cambio('20'), 'SUPERVISOR_INVALIDO'], [cambio(12), 'AUTORREFERENCIA'],
    [cambio(20, '2026-02-30T00:00:00.123456Z'), 'REVISION_INVALIDA'],
    [{ ...cambio(), motivo: '   ' }, 'MOTIVO_INVALIDO'],
    [{ ...cambio(), motivo: 'x'.repeat(501) }, 'MOTIVO_INVALIDO'],
  ]) {
    assert.equal((await request('PATCH', 12, body)).body.codigo, codigo);
  }
  assert.equal(db.directa.mock.callCount(), 0);
  assert.equal(db.conectar.mock.callCount(), 0);
});
