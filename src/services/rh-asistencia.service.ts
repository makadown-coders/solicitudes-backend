import { pool } from '../db/pool';
import { RhHttpError, type RhAuditMeta } from './rh.service';

export type RhAsistenciaEstadoControl =
  | 'PENDIENTE'
  | 'ENTREGADA_DECLARADA'
  | 'RECIBIDA'
  | 'OBSERVADA'
  | 'NO_APLICA';

export type RhAsistenciaMotivoExcepcion =
  | 'INGRESO_POSTERIOR'
  | 'BAJA_PREVIA'
  | 'TRANSFERENCIA'
  | 'COMISION_EXTERNA'
  | 'LICENCIA_INCAPACIDAD'
  | 'EXENCION_ADMINISTRATIVA'
  | 'OTRO';

export type RhAsistenciaEstadoFiltro =
  | RhAsistenciaEstadoControl
  | 'SIN_REGISTRO'
  | 'ELEGIBILIDAD_INCIERTA';

export type RhAsistenciaSituacionSeguimiento =
  | 'REGISTRO_EXPLICITO'
  | 'SIN_REGISTRO_CONTROL'
  | 'NO_APLICABLE_DOCUMENTADO'
  | 'ELEGIBILIDAD_INCIERTA';

export type RhAsistenciaUnidadOrigen =
  | 'CONTROL_MENSUAL'
  | 'ADSCRIPCION_VIGENTE'
  | 'DIRECTORIO_REFERENCIA'
  | 'SIN_UNIDAD';

export const RH_ASISTENCIA_ESTADOS_PERSISTENTES: ReadonlySet<RhAsistenciaEstadoControl> = new Set([
  'PENDIENTE',
  'ENTREGADA_DECLARADA',
  'RECIBIDA',
  'OBSERVADA',
  'NO_APLICA',
]);

export const RH_ASISTENCIA_MOTIVOS_EXCEPCION: ReadonlySet<RhAsistenciaMotivoExcepcion> = new Set([
  'INGRESO_POSTERIOR',
  'BAJA_PREVIA',
  'TRANSFERENCIA',
  'COMISION_EXTERNA',
  'LICENCIA_INCAPACIDAD',
  'EXENCION_ADMINISTRATIVA',
  'OTRO',
]);

export const RH_ASISTENCIA_FILTROS_ESTADO: ReadonlySet<RhAsistenciaEstadoFiltro> = new Set([
  'PENDIENTE',
  'ENTREGADA_DECLARADA',
  'RECIBIDA',
  'OBSERVADA',
  'NO_APLICA',
  'SIN_REGISTRO',
  'ELEGIBILIDAD_INCIERTA',
]);

export type RhAsistenciaSituacionFiltro = 'ACTIVOS' | 'BAJAS' | 'TODOS';

export interface RhAsistenciaSeguimientoQuery {
  anio: number;
  mes: number;
  unidadId?: number | null;
  estado?: RhAsistenciaEstadoFiltro | null;
  situacion?: RhAsistenciaSituacionFiltro | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
}

export interface RhAsistenciaSeguimientoItem {
  persona_id: number;
  nombre_completo: string;
  activo_actual: boolean;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  unidad_medica_id: number | null;
  unidad_medica_nombre: string | null;
  unidad_origen: RhAsistenciaUnidadOrigen;
  adscripcion_laboral_id: number | null;
  puesto_referencia: string | null;
  tiene_registro_control: boolean;
  control_id: number | null;
  estado_control: RhAsistenciaEstadoControl | null;
  situacion_seguimiento: RhAsistenciaSituacionSeguimiento;
  motivo_incertidumbre: string | null;
  fecha_recepcion: string | null;
  recibido_por: string | null;
  excepcion_administrativa: boolean;
  motivo_excepcion: RhAsistenciaMotivoExcepcion | null;
  observaciones: string | null;
  generado_docx_en: string | null;
  generaciones_docx_count: number;
  entrega_declarada_en: string | null;
  origen_registro: 'CAPTURA_SISTEMA' | 'MIGRACION_HISTORICA_EXCEL' | null;
  actualizado_en: string | null;
}

export interface RhAsistenciaResumenMensual {
  anio: number;
  mes: number;
  unidad_medica_id: number | null;
  total_personas_evaluadas: number;
  recepciones_confirmadas: number;
  observadas: number;
  declaradas_no_confirmadas: number;
  pendientes_explicitas: number;
  no_aplicables_documentadas: number;
  sin_registro_control: number;
  elegibilidad_incierta: number;
  universo_evaluable_referencia: number;
  porcentaje_recepcion_sobre_evaluable: number | null;
  denominador_nota: string;
}

export interface RhAsistenciaSeguimientoResult {
  anio: number;
  mes: number;
  unidad_medica_id: number | null;
  items: RhAsistenciaSeguimientoItem[];
  resumen: RhAsistenciaResumenMensual;
  page: number;
  pageSize: number;
  total: number;
}

export interface RhAsistenciaConfirmarRecepcionInput {
  fecha_recepcion?: string | null;
  unidad_medica_id?: number | null;
  adscripcion_laboral_id?: number | null;
  observaciones?: string | null;
  motivo_administrativo?: string | null;
}

export interface RhAsistenciaActualizarEstadoInput {
  estado: 'OBSERVADA' | 'NO_APLICA' | 'PENDIENTE';
  motivo_excepcion?: RhAsistenciaMotivoExcepcion | null;
  observaciones?: string | null;
  unidad_medica_id?: number | null;
  adscripcion_laboral_id?: number | null;
  motivo_administrativo?: string | null;
}

export interface RhAsistenciaControlMutationResult {
  registro: {
    id: number;
    persona_id: number;
    anio: number;
    mes: number;
    unidad_medica_id: number | null;
    adscripcion_laboral_id: number | null;
    estado: RhAsistenciaEstadoControl;
    fecha_recepcion: string | null;
    recibido_por: string | null;
    observaciones: string | null;
    excepcion_administrativa: boolean;
    motivo_excepcion: RhAsistenciaMotivoExcepcion | null;
    generado_docx_en: string | null;
    generaciones_docx_count: number;
    entrega_declarada_en: string | null;
    actualizado_en: string;
  };
  estado_anterior: RhAsistenciaEstadoControl | null;
  idempotente: boolean;
  evento_auditoria: string | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(str);
  return match ? match[1] : null;
}

function toIsoTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const str = String(value).trim();
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? str : parsed.toISOString();
}

function validatePeriodo(anio: number, mes: number): void {
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    throw new RhHttpError(400, 'El parámetro "anio" debe ser un entero entre 2020 y 2100');
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new RhHttpError(400, 'El parámetro "mes" debe ser un entero entre 1 y 12');
  }
}

function validatePersonaId(personaId: number): void {
  if (!Number.isSafeInteger(personaId) || personaId <= 0) {
    throw new RhHttpError(400, 'El parámetro "personaId" debe ser un entero positivo válido');
  }
}

function validateOperatorUuid(auditMeta: RhAuditMeta): string {
  const raw = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
  if (!raw || !UUID_REGEX.test(raw)) {
    throw new RhHttpError(401, 'No se pudo identificar el UUID del operador autenticado');
  }
  return raw;
}

function monthBounds(anio: number, mes: number): { firstDay: string; lastDay: string } {
  const mm = String(mes).padStart(2, '0');
  const lastDate = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dd = String(lastDate).padStart(2, '0');
  return {
    firstDay: `${anio}-${mm}-01`,
    lastDay: `${anio}-${mm}-${dd}`,
  };
}

interface RawSeguimientoRow {
  persona_id: number;
  nombre_completo: string;
  activo_actual: boolean;
  fecha_ingreso: unknown;
  fecha_baja: unknown;
  control_id: number | null;
  control_unidad_id: number | null;
  control_unidad_nombre: string | null;
  control_adscripcion_id: number | null;
  estado_control: RhAsistenciaEstadoControl | null;
  fecha_recepcion: unknown;
  recibido_por: string | null;
  excepcion_administrativa: boolean | null;
  motivo_excepcion: RhAsistenciaMotivoExcepcion | null;
  observaciones: string | null;
  generado_docx_en: unknown;
  generaciones_docx_count: number | null;
  entrega_declarada_en: unknown;
  origen_registro?: 'CAPTURA_SISTEMA' | 'MIGRACION_HISTORICA_EXCEL' | null;
  actualizado_en: unknown;
  adscripcion_ref_id: number | null;
  adscripcion_ref_unidad_id: number | null;
  adscripcion_ref_unidad_nombre: string | null;
  adscripcion_ref_puesto: string | null;
  directorio_unidad_id: number | null;
  directorio_unidad_nombre: string | null;
  cargo_directorio: string | null;
}

function evaluateRow(
  row: RawSeguimientoRow,
  anio: number,
  mes: number
): RhAsistenciaSeguimientoItem {
  const { firstDay, lastDay } = monthBounds(anio, mes);
  const fechaIngreso = toIsoDateOnly(row.fecha_ingreso);
  const fechaBaja = toIsoDateOnly(row.fecha_baja);
  const tieneRegistro = row.control_id !== null && row.control_id !== undefined;
  const estadoControl = tieneRegistro ? row.estado_control : null;

  let unidadId: number | null = null;
  let unidadNombre: string | null = null;
  let unidadOrigen: RhAsistenciaUnidadOrigen = 'SIN_UNIDAD';

  if (row.control_unidad_id !== null && row.control_unidad_id !== undefined) {
    unidadId = Number(row.control_unidad_id);
    unidadNombre = row.control_unidad_nombre ?? null;
    unidadOrigen = 'CONTROL_MENSUAL';
  } else if (row.adscripcion_ref_unidad_id !== null && row.adscripcion_ref_unidad_id !== undefined) {
    unidadId = Number(row.adscripcion_ref_unidad_id);
    unidadNombre = row.adscripcion_ref_unidad_nombre ?? null;
    unidadOrigen = 'ADSCRIPCION_VIGENTE';
  } else if (row.directorio_unidad_id !== null && row.directorio_unidad_id !== undefined) {
    unidadId = Number(row.directorio_unidad_id);
    unidadNombre = row.directorio_unidad_nombre ?? null;
    unidadOrigen = 'DIRECTORIO_REFERENCIA';
  }

  let situacion: RhAsistenciaSituacionSeguimiento;
  let motivoIncertidumbre: string | null = null;

  if (estadoControl === 'NO_APLICA') {
    situacion = 'NO_APLICABLE_DOCUMENTADO';
  } else if (tieneRegistro && estadoControl !== null) {
    situacion = 'REGISTRO_EXPLICITO';
  } else {
    // Sin registro de control: nunca se clasifica automáticamente como incumplimiento ni como NO_APLICA.
    const reasons: string[] = [];
    if (!fechaIngreso) {
      reasons.push('SIN_FECHA_INGRESO');
    } else if (fechaIngreso > lastDay) {
      reasons.push('INGRESO_POSTERIOR_REFERENCIA');
    }

    if (fechaBaja && fechaBaja < firstDay) {
      reasons.push('BAJA_PREVIA_REFERENCIA');
    } else if (!row.activo_actual) {
      reasons.push('INACTIVO_SIN_CONTEXTO_HISTORICO');
    }

    if (row.adscripcion_ref_id === null || row.adscripcion_ref_id === undefined) {
      reasons.push('SIN_ADSCRIPCION_FORMAL');
    }

    if (reasons.length > 0) {
      situacion = 'ELEGIBILIDAD_INCIERTA';
      motivoIncertidumbre = reasons.join(',');
    } else {
      situacion = 'SIN_REGISTRO_CONTROL';
    }
  }

  return {
    persona_id: Number(row.persona_id),
    nombre_completo: String(row.nombre_completo ?? ''),
    activo_actual: Boolean(row.activo_actual),
    fecha_ingreso: fechaIngreso,
    fecha_baja: fechaBaja,
    unidad_medica_id: unidadId,
    unidad_medica_nombre: unidadNombre,
    unidad_origen: unidadOrigen,
    adscripcion_laboral_id:
      row.control_adscripcion_id !== null && row.control_adscripcion_id !== undefined
        ? Number(row.control_adscripcion_id)
        : row.adscripcion_ref_id !== null && row.adscripcion_ref_id !== undefined
        ? Number(row.adscripcion_ref_id)
        : null,
    puesto_referencia: row.adscripcion_ref_puesto ?? row.cargo_directorio ?? null,
    tiene_registro_control: tieneRegistro,
    control_id: tieneRegistro ? Number(row.control_id) : null,
    estado_control: estadoControl,
    situacion_seguimiento: situacion,
    motivo_incertidumbre: motivoIncertidumbre,
    fecha_recepcion: toIsoTimestamp(row.fecha_recepcion),
    recibido_por: row.recibido_por ?? null,
    excepcion_administrativa: Boolean(row.excepcion_administrativa),
    motivo_excepcion: row.motivo_excepcion ?? null,
    observaciones: row.observaciones ?? null,
    generado_docx_en: toIsoTimestamp(row.generado_docx_en),
    generaciones_docx_count: Number(row.generaciones_docx_count ?? 0),
    entrega_declarada_en: toIsoTimestamp(row.entrega_declarada_en),
    origen_registro: tieneRegistro ? (row.origen_registro ?? 'CAPTURA_SISTEMA') : null,
    actualizado_en: toIsoTimestamp(row.actualizado_en),
  };
}

function buildResumen(
  anio: number,
  mes: number,
  unidadId: number | null,
  items: RhAsistenciaSeguimientoItem[]
): RhAsistenciaResumenMensual {
  let recepcionesConfirmadas = 0;
  let observadas = 0;
  let declaradasNoConfirmadas = 0;
  let pendientesExplicitas = 0;
  let noAplicablesDocumentadas = 0;
  let sinRegistroControl = 0;
  let elegibilidadIncierta = 0;

  for (const item of items) {
    if (item.estado_control === 'RECIBIDA') {
      recepcionesConfirmadas++;
    } else if (item.estado_control === 'OBSERVADA') {
      observadas++;
    } else if (item.estado_control === 'ENTREGADA_DECLARADA') {
      declaradasNoConfirmadas++;
    } else if (item.estado_control === 'PENDIENTE') {
      pendientesExplicitas++;
    } else if (item.estado_control === 'NO_APLICA') {
      noAplicablesDocumentadas++;
    } else if (item.situacion_seguimiento === 'ELEGIBILIDAD_INCIERTA') {
      elegibilidadIncierta++;
    } else {
      sinRegistroControl++;
    }
  }

  const totalEvaluadas = items.length;
  const universoEvaluable = Math.max(
    0,
    totalEvaluadas - noAplicablesDocumentadas - elegibilidadIncierta
  );
  const porcentajeRecepcion =
    universoEvaluable > 0
      ? Number(((recepcionesConfirmadas / universoEvaluable) * 100).toFixed(2))
      : null;

  return {
    anio,
    mes,
    unidad_medica_id: unidadId,
    total_personas_evaluadas: totalEvaluadas,
    recepciones_confirmadas: recepcionesConfirmadas,
    observadas,
    declaradas_no_confirmadas: declaradasNoConfirmadas,
    pendientes_explicitas: pendientesExplicitas,
    no_aplicables_documentadas: noAplicablesDocumentadas,
    sin_registro_control: sinRegistroControl,
    elegibilidad_incierta: elegibilidadIncierta,
    universo_evaluable_referencia: universoEvaluable,
    porcentaje_recepcion_sobre_evaluable: porcentajeRecepcion,
    denominador_nota:
      'El porcentaje de recepción excluye casos NO_APLICA documentados y casos con ELEGIBILIDAD_INCIERTA. No representa un porcentaje definitivo de incumplimiento ni asume fechas límite institucionales.',
  };
}

export default class RhAsistenciaService {
  async getMiHistorial(userId: string, anio: number, ahora = new Date()) {
    if (!UUID_REGEX.test(userId)) throw new RhHttpError(401, 'Sesión no válida');
    validatePeriodo(anio, 1);
    const { rows } = await pool.query<{
      cuenta_activa: boolean;
      persona_activa: boolean | null;
      fecha_ingreso: string | null;
      fecha_baja: string | null;
      mes: number | null;
      estado_control: RhAsistenciaEstadoControl | null;
      origen_registro: RhAsistenciaSeguimientoItem['origen_registro'];
      fecha_recepcion: unknown;
      tiene_adscripcion: boolean;
      vinculo_posterior_baja: boolean;
    }>(`
      SELECT identidad.cuenta_activa, p.activo AS persona_activa,
             p.fecha_ingreso::text, p.fecha_baja::text, m.mes,
             c.estado AS estado_control, c.origen_registro, c.fecha_recepcion,
             EXISTS (
               SELECT 1 FROM public.rh_adscripcion_laboral al
               WHERE al.persona_id = p.id
                 AND al.vigente_desde < m.inicio + interval '1 month'
                 AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= m.inicio)
             ) AS tiene_adscripcion,
             EXISTS (
               SELECT 1 FROM public.rh_adscripcion_laboral al
               WHERE al.persona_id = p.id
                 AND al.vigente_desde < m.inicio + interval '1 month'
                 AND (al.vigente_hasta IS NULL OR al.vigente_hasta > p.fecha_baja)
             ) AS vinculo_posterior_baja
      FROM public.app_users u
      CROSS JOIN LATERAL (SELECT upper(btrim(u.status::text)) = 'ACTIVE' AS cuenta_activa) identidad
      LEFT JOIN public.persona p ON p.id = u.persona_id AND p.activo IS TRUE
      LEFT JOIN LATERAL (
        SELECT mes, make_date($2::int, mes, 1) AS inicio
        FROM generate_series(1, 12) AS serie(mes)
      ) m ON p.id IS NOT NULL AND identidad.cuenta_activa
      LEFT JOIN public.rh_asistencia_entrega_mensual c
        ON c.persona_id = p.id AND c.anio = $2 AND c.mes = m.mes
      WHERE u.id = $1::uuid
      ORDER BY m.mes
    `, [userId, anio]);
    if (!rows.length) throw new RhHttpError(401, 'Cuenta de usuario no encontrada');
    if (!rows[0].cuenta_activa || rows[0].persona_activa !== true) {
      throw new RhHttpError(403, 'Tu cuenta debe estar activa y vinculada a una persona institucional activa');
    }

    const partes = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Tijuana', year: 'numeric', month: 'numeric',
    }).formatToParts(ahora);
    const anioLocal = Number(partes.find(({ type }) => type === 'year')?.value);
    const mesLocal = Number(partes.find(({ type }) => type === 'month')?.value);
    const ultimoMesCerrado = anio < anioLocal ? 12 : anio > anioLocal ? 0 : mesLocal - 1;
    const resumen = {
      sin_recepcion_registrada: [] as number[],
      requieren_atencion: [] as number[],
      no_corresponden: [] as number[],
      recibidas: [] as number[],
    };
    const meses = rows.map((row) => {
      const mes = Number(row.mes);
      const { firstDay, lastDay } = monthBounds(anio, mes);
      const ingreso = row.fecha_ingreso;
      const baja = row.fecha_baja;
      const estado = row.estado_control;
      const antesDelIngreso = Boolean(ingreso && ingreso > lastDay);
      const despuesDeLaBaja = Boolean(baja && baja < firstDay);
      let elegibilidad: 'EVALUABLE' | 'NO_CORRESPONDE' | 'INCIERTA' = 'INCIERTA';
      if (estado === 'RECIBIDA') {
        if (!antesDelIngreso && !despuesDeLaBaja) elegibilidad = 'EVALUABLE';
      } else if (estado === 'NO_APLICA') {
        elegibilidad = 'NO_CORRESPONDE';
      } else if (antesDelIngreso) {
        if (!estado && !row.tiene_adscripcion) elegibilidad = 'NO_CORRESPONDE';
      } else if (despuesDeLaBaja) {
        if (!estado && !row.vinculo_posterior_baja && (!ingreso || (baja && ingreso <= baja))) {
          elegibilidad = 'NO_CORRESPONDE';
        }
      } else if (estado || (ingreso && row.tiene_adscripcion)) {
        elegibilidad = 'EVALUABLE';
      }
      const esMesCerrado = mes <= ultimoMesCerrado;
      const requiereAtencion = estado === 'OBSERVADA' || estado === 'ENTREGADA_DECLARADA' ||
        (esMesCerrado && elegibilidad === 'INCIERTA');
      if (esMesCerrado) {
        if (estado === 'RECIBIDA') resumen.recibidas.push(mes);
        if (requiereAtencion) resumen.requieren_atencion.push(mes);
        else if (elegibilidad === 'NO_CORRESPONDE') resumen.no_corresponden.push(mes);
        else if (estado !== 'RECIBIDA') resumen.sin_recepcion_registrada.push(mes);
      }
      return {
        mes, estado_control: estado, elegibilidad, origen_registro: row.origen_registro,
        fecha_recepcion: toIsoTimestamp(row.fecha_recepcion),
        es_mes_cerrado: esMesCerrado, requiere_atencion: requiereAtencion,
      };
    });
    return { anio, ultimo_mes_cerrado: ultimoMesCerrado, meses, resumen };
  }

  async getMatrizAnual(query: Omit<RhAsistenciaSeguimientoQuery, 'mes' | 'estado'>) {
    const { anio, unidadId = null, situacion = 'TODOS', page = 1 } = query;
    validatePeriodo(anio, 1);
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const q = normalizeText(query.q);
    const result = await pool.query<Pick<RawSeguimientoRow,
      'persona_id' | 'nombre_completo' | 'activo_actual' | 'fecha_baja' | 'fecha_ingreso' |
      'cargo_directorio' | 'directorio_unidad_id' | 'directorio_unidad_nombre' |
      'control_id' | 'control_unidad_id' | 'estado_control' | 'fecha_recepcion' |
      'origen_registro' | 'excepcion_administrativa' | 'motivo_excepcion' |
      'adscripcion_ref_id' | 'adscripcion_ref_unidad_id'
    > & { mes: number; total: string }>(`
      WITH universo AS (
        SELECT p.id AS persona_id, p.nombre_completo, p.activo AS activo_actual,
               p.fecha_baja, p.fecha_ingreso, p.cargo AS cargo_directorio,
               p.unidad_medica_id AS directorio_unidad_id
        FROM public.persona p
        WHERE ($3::text IS NULL OR p.nombre_completo ILIKE $3)
          AND CASE $4::text
            WHEN 'ACTIVOS' THEN p.activo IS TRUE AND p.fecha_baja IS NULL
            WHEN 'BAJAS' THEN p.activo IS FALSE OR p.fecha_baja IS NOT NULL
            ELSE TRUE
          END
          AND ($2::int IS NULL OR EXISTS (
            SELECT 1 FROM public.rh_asistencia_entrega_mensual c
            WHERE c.persona_id = p.id AND c.anio = $1::int AND c.unidad_medica_id = $2
          ) OR EXISTS (
            SELECT 1 FROM public.rh_adscripcion_laboral al
            WHERE al.persona_id = p.id AND al.unidad_medica_id = $2
              AND al.vigente_desde < make_date($1 + 1, 1, 1)
              AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= make_date($1, 1, 1))
          ))
      ), pagina AS (
        SELECT * FROM universo ORDER BY nombre_completo, persona_id
        LIMIT $5 OFFSET (($6::bigint - 1) * $5::bigint)
      )
      SELECT totales.total, p.*, um.nombre AS directorio_unidad_nombre, m.mes,
             c.id AS control_id, c.unidad_medica_id AS control_unidad_id,
             c.estado AS estado_control, c.fecha_recepcion, c.origen_registro,
             c.excepcion_administrativa, c.motivo_excepcion,
             al_ref.id AS adscripcion_ref_id, al_ref.unidad_medica_id AS adscripcion_ref_unidad_id
      FROM (SELECT COUNT(*) AS total FROM universo) totales
      LEFT JOIN pagina p ON TRUE
      LEFT JOIN public.unidad_medica um ON um.id = p.directorio_unidad_id
      LEFT JOIN generate_series(1, 12) AS m(mes) ON p.persona_id IS NOT NULL
      LEFT JOIN public.rh_asistencia_entrega_mensual c
        ON c.persona_id = p.persona_id AND c.anio = $1 AND c.mes = m.mes
      LEFT JOIN LATERAL (
        SELECT al.id, al.unidad_medica_id
        FROM public.rh_adscripcion_laboral al
        WHERE al.persona_id = p.persona_id
          AND al.vigente_desde < make_date($1, m.mes, 1) + interval '1 month'
          AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= make_date($1, m.mes, 1))
        ORDER BY al.activo DESC, al.vigente_desde DESC, al.id DESC
        LIMIT 1
      ) al_ref ON TRUE
      ORDER BY p.nombre_completo, p.persona_id, m.mes
    `, [anio, unidadId, q ? `%${q}%` : null, situacion, pageSize, page]);

    type Celda = Pick<RhAsistenciaSeguimientoItem,
      'estado_control' | 'situacion_seguimiento' | 'origen_registro' | 'control_id' |
      'fecha_recepcion' | 'excepcion_administrativa' | 'motivo_excepcion' | 'unidad_medica_id'
    > & { mes: number };
    const personas = new Map<number, {
      persona_id: number;
      nombre_completo: string;
      puesto_referencia: string | null;
      unidad_medica_id: number | null;
      unidad_medica_nombre: string | null;
      situacion_actual: 'ACTIVO' | 'BAJA' | null;
      fecha_ingreso: string | null;
      meses: Celda[];
    }>();
    for (const row of result.rows) {
      if (row.persona_id === null) continue;
      const personaId = Number(row.persona_id);
      let persona = personas.get(personaId);
      if (!persona) {
        persona = {
          persona_id: personaId,
          nombre_completo: row.nombre_completo,
          puesto_referencia: row.cargo_directorio,
          fecha_ingreso: toIsoDateOnly(row.fecha_ingreso),
          unidad_medica_id: row.directorio_unidad_id,
          unidad_medica_nombre: row.directorio_unidad_nombre,
          situacion_actual: row.fecha_baja || row.activo_actual === false
            ? 'BAJA' : row.activo_actual ? 'ACTIVO' : null,
          meses: [],
        };
        personas.set(personaId, persona);
      }
      const celda = evaluateRow({
        ...row,
        directorio_unidad_id: null,
        directorio_unidad_nombre: null,
        control_unidad_nombre: null,
        control_adscripcion_id: null,
        adscripcion_ref_unidad_nombre: null,
        adscripcion_ref_puesto: null,
        recibido_por: null,
        observaciones: null,
        generado_docx_en: null,
        generaciones_docx_count: null,
        entrega_declarada_en: null,
        actualizado_en: null,
      }, anio, row.mes);
      persona.meses.push({
        mes: row.mes,
        unidad_medica_id: celda.unidad_medica_id,
        estado_control: celda.estado_control,
        situacion_seguimiento: celda.situacion_seguimiento,
        origen_registro: celda.origen_registro,
        control_id: celda.control_id,
        fecha_recepcion: celda.fecha_recepcion,
        excepcion_administrativa: celda.excepcion_administrativa,
        motivo_excepcion: celda.motivo_excepcion,
      });
    }
    return {
      anio, unidad_medica_id: unidadId, situacion, items: Array.from(personas.values()),
      page, pageSize, total: Number(result.rows[0]?.total ?? 0),
    };
  }

  /**
   * Consulta de solo lectura para seguimiento mensual de listas de asistencia.
   * Nunca crea registros en `rh_asistencia_entrega_mensual`.
   */
  async getSeguimientoMensual(
    query: RhAsistenciaSeguimientoQuery
  ): Promise<RhAsistenciaSeguimientoResult> {
    validatePeriodo(query.anio, query.mes);

    const unidadId =
      query.unidadId !== undefined && query.unidadId !== null ? Number(query.unidadId) : null;
    if (unidadId !== null && (!Number.isSafeInteger(unidadId) || unidadId <= 0)) {
      throw new RhHttpError(400, 'El parámetro "unidadId" debe ser un entero positivo válido');
    }

    const estadoFiltro = query.estado ?? null;
    if (estadoFiltro !== null && !RH_ASISTENCIA_FILTROS_ESTADO.has(estadoFiltro)) {
      throw new RhHttpError(400, 'El parámetro "estado" no es válido');
    }

    const q = normalizeText(query.q);
    const page = Math.max(1, Number.isInteger(query.page) ? Number(query.page) : 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.isInteger(query.pageSize) ? Number(query.pageSize) : 20)
    );

    const { firstDay, lastDay } = monthBounds(query.anio, query.mes);

    const params: unknown[] = [query.anio, query.mes, firstDay, lastDay];
    const whereClauses: string[] = [];

    if (q) {
      params.push(`%${q}%`);
      whereClauses.push(`p.nombre_completo ILIKE $${params.length}`);
    }

    if (unidadId !== null) {
      params.push(unidadId);
      whereClauses.push(
        `COALESCE(c.unidad_medica_id, al_ref.unidad_medica_id, p.unidad_medica_id) = $${params.length}`
      );
    }

    if (query.situacion === 'ACTIVOS') {
      whereClauses.push('(p.activo IS TRUE AND p.fecha_baja IS NULL)');
    } else if (query.situacion === 'BAJAS') {
      whereClauses.push('(p.activo IS FALSE OR p.fecha_baja IS NOT NULL)');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT
        p.id AS persona_id,
        p.nombre_completo,
        p.activo AS activo_actual,
        p.fecha_ingreso,
        p.fecha_baja,
        c.id AS control_id,
        c.unidad_medica_id AS control_unidad_id,
        um_c.nombre AS control_unidad_nombre,
        c.adscripcion_laboral_id AS control_adscripcion_id,
        c.estado AS estado_control,
        c.fecha_recepcion,
        c.recibido_por,
        c.excepcion_administrativa,
        c.motivo_excepcion,
        c.observaciones,
        c.generado_docx_en,
        c.generaciones_docx_count,
        c.entrega_declarada_en,
        c.origen_registro,
        c.actualizado_en,
        al_ref.id AS adscripcion_ref_id,
        al_ref.unidad_medica_id AS adscripcion_ref_unidad_id,
        um_al.nombre AS adscripcion_ref_unidad_nombre,
        al_ref.puesto AS adscripcion_ref_puesto,
        p.unidad_medica_id AS directorio_unidad_id,
        um_dir.nombre AS directorio_unidad_nombre,
        p.cargo AS cargo_directorio
      FROM public.persona p
      LEFT JOIN public.rh_asistencia_entrega_mensual c
        ON c.persona_id = p.id
       AND c.anio = $1
       AND c.mes = $2
      LEFT JOIN public.unidad_medica um_c
        ON um_c.id = c.unidad_medica_id
      LEFT JOIN LATERAL (
        SELECT al.id, al.unidad_medica_id, al.puesto
        FROM public.rh_adscripcion_laboral al
        WHERE al.persona_id = p.id
          AND al.vigente_desde <= $4::date
          AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= $3::date)
        ORDER BY al.activo DESC, al.vigente_desde DESC, al.id DESC
        LIMIT 1
      ) al_ref ON TRUE
      LEFT JOIN public.unidad_medica um_al
        ON um_al.id = al_ref.unidad_medica_id
      LEFT JOIN public.unidad_medica um_dir
        ON um_dir.id = p.unidad_medica_id
      ${whereSql}
      ORDER BY p.nombre_completo ASC, p.id ASC
    `;

    const result = await pool.query<RawSeguimientoRow>(sql, params);
    const evaluatedAll = result.rows.map((r) => evaluateRow(r, query.anio, query.mes));
    const resumen = buildResumen(query.anio, query.mes, unidadId, evaluatedAll);

    const filtered = estadoFiltro
      ? evaluatedAll.filter((item) => {
          if (estadoFiltro === 'SIN_REGISTRO') {
            return !item.tiene_registro_control;
          }
          if (estadoFiltro === 'ELEGIBILIDAD_INCIERTA') {
            return item.situacion_seguimiento === 'ELEGIBILIDAD_INCIERTA';
          }
          return item.estado_control === estadoFiltro;
        })
      : evaluatedAll;

    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const pagedItems = filtered.slice(offset, offset + pageSize);

    return {
      anio: query.anio,
      mes: query.mes,
      unidad_medica_id: unidadId,
      items: pagedItems,
      resumen,
      page,
      pageSize,
      total,
    };
  }

  /**
   * Consulta agregada mensual de solo lectura.
   */
  async getResumenMensual(
    anio: number,
    mes: number,
    unidadId?: number | null,
    situacion?: RhAsistenciaSituacionFiltro | null
  ): Promise<RhAsistenciaResumenMensual> {
    const seg = await this.getSeguimientoMensual({
      anio,
      mes,
      unidadId: unidadId ?? null,
      situacion: situacion ?? null,
      page: 1,
      pageSize: 1,
    });
    return seg.resumen;
  }

  /**
   * Confirma recepción física de la lista mensual para una persona y periodo.
   * Transaccional, con bloqueo de fila/llave, idempotencia y auditoría en public.app_audit_logs.
   */
  async confirmarRecepcion(
    personaId: number,
    anio: number,
    mes: number,
    input: RhAsistenciaConfirmarRecepcionInput,
    auditMeta: RhAuditMeta
  ): Promise<RhAsistenciaControlMutationResult> {
    validatePersonaId(personaId);
    validatePeriodo(anio, mes);
    const operatorId = validateOperatorUuid(auditMeta);

    const observaciones = normalizeText(input.observaciones);
    const motivoAdmin = normalizeText(input.motivo_administrativo);

    let fechaRecepcionIso: string | null = null;
    if (input.fecha_recepcion !== undefined && input.fecha_recepcion !== null) {
      const parsed = new Date(String(input.fecha_recepcion));
      if (Number.isNaN(parsed.getTime())) {
        throw new RhHttpError(400, 'El campo "fecha_recepcion" no es una fecha/hora válida');
      }
      fechaRecepcionIso = parsed.toISOString();
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Serializa operaciones concurrentes sobre la misma llave lógica (persona_id, anio, mes)
      await client.query(
        'SELECT pg_advisory_xact_lock($1::int, $2::int)',
        [personaId, anio * 100 + mes]
      );

      const personaRes = await client.query<{ id: number; unidad_medica_id: number | null }>(
        'SELECT id, unidad_medica_id FROM public.persona WHERE id = $1',
        [personaId]
      );
      if (personaRes.rows.length === 0) {
        throw new RhHttpError(404, 'La persona especificada no existe en el padrón institucional');
      }

      const existingRes = await client.query<{
        id: number;
        persona_id: number;
        anio: number;
        mes: number;
        unidad_medica_id: number | null;
        adscripcion_laboral_id: number | null;
        estado: RhAsistenciaEstadoControl;
        fecha_recepcion: unknown;
        recibido_por: string | null;
        observaciones: string | null;
        excepcion_administrativa: boolean;
        motivo_excepcion: RhAsistenciaMotivoExcepcion | null;
        generado_docx_en: unknown;
        generaciones_docx_count: number;
        entrega_declarada_en: unknown;
        actualizado_en: unknown;
      }>(
        `SELECT *
         FROM public.rh_asistencia_entrega_mensual
         WHERE persona_id = $1 AND anio = $2 AND mes = $3
         FOR UPDATE`,
        [personaId, anio, mes]
      );

      const existing = existingRes.rows[0] ?? null;

      if (existing && existing.estado === 'RECIBIDA') {
        const existingFechaIso = toIsoTimestamp(existing.fecha_recepcion);
        const sameFecha = !fechaRecepcionIso || fechaRecepcionIso === existingFechaIso;
        const sameObs = observaciones === null || observaciones === (existing.observaciones ?? null);

        if (sameFecha && sameObs) {
          await client.query('COMMIT');
          return {
            registro: {
              id: Number(existing.id),
              persona_id: Number(existing.persona_id),
              anio: Number(existing.anio),
              mes: Number(existing.mes),
              unidad_medica_id: existing.unidad_medica_id !== null ? Number(existing.unidad_medica_id) : null,
              adscripcion_laboral_id:
                existing.adscripcion_laboral_id !== null ? Number(existing.adscripcion_laboral_id) : null,
              estado: existing.estado,
              fecha_recepcion: existingFechaIso,
              recibido_por: existing.recibido_por,
              observaciones: existing.observaciones,
              excepcion_administrativa: Boolean(existing.excepcion_administrativa),
              motivo_excepcion: existing.motivo_excepcion,
              generado_docx_en: toIsoTimestamp(existing.generado_docx_en),
              generaciones_docx_count: Number(existing.generaciones_docx_count ?? 0),
              entrega_declarada_en: toIsoTimestamp(existing.entrega_declarada_en),
              actualizado_en: toIsoTimestamp(existing.actualizado_en) ?? new Date().toISOString(),
            },
            estado_anterior: 'RECIBIDA',
            idempotente: true,
            evento_auditoria: null,
          };
        }

        if (!motivoAdmin) {
          throw new RhHttpError(
            400,
            'Para corregir una recepción ya registrada es obligatorio indicar "motivo_administrativo"'
          );
        }
      }

      if (
        existing &&
        (existing.estado === 'NO_APLICA' || existing.estado === 'OBSERVADA') &&
        !motivoAdmin
      ) {
        throw new RhHttpError(
          400,
          'Para cambiar un estado administrativo previo a RECIBIDA es obligatorio indicar "motivo_administrativo"'
        );
      }

      const resolvedUnidadId =
        input.unidad_medica_id !== undefined
          ? input.unidad_medica_id
          : existing?.unidad_medica_id ?? personaRes.rows[0].unidad_medica_id ?? null;

      const resolvedAdscripcionId =
        input.adscripcion_laboral_id !== undefined
          ? input.adscripcion_laboral_id
          : existing?.adscripcion_laboral_id ?? null;

      const effectiveFecha = fechaRecepcionIso ?? new Date().toISOString();
      const effectiveObs = observaciones !== null ? observaciones : existing?.observaciones ?? null;

      let savedRow: typeof existing;
      if (!existing) {
        const insertRes = await client.query(
          `INSERT INTO public.rh_asistencia_entrega_mensual (
             persona_id, anio, mes, unidad_medica_id, adscripcion_laboral_id,
             estado, fecha_recepcion, recibido_por, observaciones,
             excepcion_administrativa, motivo_excepcion,
             creado_por, actualizado_por
           )
           VALUES ($1, $2, $3, $4, $5, 'RECIBIDA', $6::timestamptz, $7::uuid, $8, FALSE, NULL, $7::uuid, $7::uuid)
           RETURNING *`,
          [
            personaId,
            anio,
            mes,
            resolvedUnidadId,
            resolvedAdscripcionId,
            effectiveFecha,
            operatorId,
            effectiveObs,
          ]
        );
        savedRow = insertRes.rows[0];
      } else {
        const updateRes = await client.query(
          `UPDATE public.rh_asistencia_entrega_mensual
           SET unidad_medica_id = $2,
               adscripcion_laboral_id = $3,
               estado = 'RECIBIDA',
               fecha_recepcion = $4::timestamptz,
               recibido_por = $5::uuid,
               observaciones = $6,
               excepcion_administrativa = FALSE,
               motivo_excepcion = NULL,
               actualizado_por = $5::uuid,
               actualizado_en = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            existing.id,
            resolvedUnidadId,
            resolvedAdscripcionId,
            effectiveFecha,
            operatorId,
            effectiveObs,
          ]
        );
        savedRow = updateRes.rows[0];
      }

      const evento =
        existing?.estado === 'RECIBIDA'
          ? 'RH_ASISTENCIA_RECEPCION_CORREGIDA'
          : 'RH_ASISTENCIA_RECEPCION_CONFIRMADA';

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
        [
          operatorId,
          evento,
          `rh_asistencia_entrega_mensual:${savedRow.id}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({
            persona_id: personaId,
            anio,
            mes,
            estado_anterior: existing?.estado ?? null,
            estado_nuevo: 'RECIBIDA',
            fecha_recepcion: toIsoTimestamp(savedRow.fecha_recepcion),
            motivo_administrativo: motivoAdmin,
            operador_user_id: operatorId,
            registrado_en: new Date().toISOString(),
          }),
        ]
      );

      await client.query('COMMIT');

      return {
        registro: {
          id: Number(savedRow.id),
          persona_id: Number(savedRow.persona_id),
          anio: Number(savedRow.anio),
          mes: Number(savedRow.mes),
          unidad_medica_id: savedRow.unidad_medica_id !== null ? Number(savedRow.unidad_medica_id) : null,
          adscripcion_laboral_id:
            savedRow.adscripcion_laboral_id !== null ? Number(savedRow.adscripcion_laboral_id) : null,
          estado: savedRow.estado,
          fecha_recepcion: toIsoTimestamp(savedRow.fecha_recepcion),
          recibido_por: savedRow.recibido_por,
          observaciones: savedRow.observaciones,
          excepcion_administrativa: Boolean(savedRow.excepcion_administrativa),
          motivo_excepcion: savedRow.motivo_excepcion,
          generado_docx_en: toIsoTimestamp(savedRow.generado_docx_en),
          generaciones_docx_count: Number(savedRow.generaciones_docx_count ?? 0),
          entrega_declarada_en: toIsoTimestamp(savedRow.entrega_declarada_en),
          actualizado_en: toIsoTimestamp(savedRow.actualizado_en) ?? new Date().toISOString(),
        },
        estado_anterior: existing?.estado ?? null,
        idempotente: false,
        evento_auditoria: evento,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza estado administrativo (OBSERVADA, NO_APLICA o PENDIENTE) con validaciones
   * de motivo, limpieza de campos incompatibles y auditoría transaccional.
   */
  async actualizarEstadoAdministrativo(
    personaId: number,
    anio: number,
    mes: number,
    input: RhAsistenciaActualizarEstadoInput,
    auditMeta: RhAuditMeta
  ): Promise<RhAsistenciaControlMutationResult> {
    validatePersonaId(personaId);
    validatePeriodo(anio, mes);
    const operatorId = validateOperatorUuid(auditMeta);

    const targetEstado = input.estado;
    if (targetEstado !== 'OBSERVADA' && targetEstado !== 'NO_APLICA' && targetEstado !== 'PENDIENTE') {
      throw new RhHttpError(
        400,
        'El estado permitido en esta operación debe ser OBSERVADA, NO_APLICA o PENDIENTE'
      );
    }

    const observaciones = normalizeText(input.observaciones);
    const motivoAdmin = normalizeText(input.motivo_administrativo);
    const motivoExcepcion = input.motivo_excepcion ?? null;

    if (targetEstado === 'OBSERVADA' && !observaciones) {
      throw new RhHttpError(400, 'Para marcar OBSERVADA es obligatorio capturar "observaciones"');
    }

    if (targetEstado === 'NO_APLICA') {
      if (!motivoExcepcion || !RH_ASISTENCIA_MOTIVOS_EXCEPCION.has(motivoExcepcion)) {
        throw new RhHttpError(
          400,
          'Para marcar NO_APLICA es obligatorio proporcionar un "motivo_excepcion" válido'
        );
      }
      if (motivoExcepcion === 'OTRO' && !observaciones) {
        throw new RhHttpError(
          400,
          'Cuando "motivo_excepcion" es OTRO, es obligatorio capturar "observaciones"'
        );
      }
    } else if (motivoExcepcion !== null) {
      throw new RhHttpError(
        400,
        'El campo "motivo_excepcion" solo puede enviarse cuando el estado es NO_APLICA'
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock($1::int, $2::int)',
        [personaId, anio * 100 + mes]
      );

      const personaRes = await client.query<{ id: number; unidad_medica_id: number | null }>(
        'SELECT id, unidad_medica_id FROM public.persona WHERE id = $1',
        [personaId]
      );
      if (personaRes.rows.length === 0) {
        throw new RhHttpError(404, 'La persona especificada no existe en el padrón institucional');
      }

      const existingRes = await client.query(
        `SELECT *
         FROM public.rh_asistencia_entrega_mensual
         WHERE persona_id = $1 AND anio = $2 AND mes = $3
         FOR UPDATE`,
        [personaId, anio, mes]
      );
      const existing = existingRes.rows[0] ?? null;

      if (existing) {
        const sameEstado = existing.estado === targetEstado;
        const sameMotivo = (existing.motivo_excepcion ?? null) === (targetEstado === 'NO_APLICA' ? motivoExcepcion : null);
        const sameObs = (existing.observaciones ?? null) === observaciones;

        if (sameEstado && sameMotivo && sameObs) {
          await client.query('COMMIT');
          return {
            registro: {
              id: Number(existing.id),
              persona_id: Number(existing.persona_id),
              anio: Number(existing.anio),
              mes: Number(existing.mes),
              unidad_medica_id: existing.unidad_medica_id !== null ? Number(existing.unidad_medica_id) : null,
              adscripcion_laboral_id:
                existing.adscripcion_laboral_id !== null ? Number(existing.adscripcion_laboral_id) : null,
              estado: existing.estado,
              fecha_recepcion: toIsoTimestamp(existing.fecha_recepcion),
              recibido_por: existing.recibido_por,
              observaciones: existing.observaciones,
              excepcion_administrativa: Boolean(existing.excepcion_administrativa),
              motivo_excepcion: existing.motivo_excepcion,
              generado_docx_en: toIsoTimestamp(existing.generado_docx_en),
              generaciones_docx_count: Number(existing.generaciones_docx_count ?? 0),
              entrega_declarada_en: toIsoTimestamp(existing.entrega_declarada_en),
              actualizado_en: toIsoTimestamp(existing.actualizado_en) ?? new Date().toISOString(),
            },
            estado_anterior: existing.estado,
            idempotente: true,
            evento_auditoria: null,
          };
        }

        if (!motivoAdmin) {
          throw new RhHttpError(
            400,
            'Para modificar o revertir un estado ya registrado es obligatorio indicar "motivo_administrativo"'
          );
        }
      }

      const resolvedUnidadId =
        input.unidad_medica_id !== undefined
          ? input.unidad_medica_id
          : existing?.unidad_medica_id ?? personaRes.rows[0].unidad_medica_id ?? null;

      const resolvedAdscripcionId =
        input.adscripcion_laboral_id !== undefined
          ? input.adscripcion_laboral_id
          : existing?.adscripcion_laboral_id ?? null;

      const isExcepcion = targetEstado === 'NO_APLICA';
      const effectiveMotivoExcepcion = isExcepcion ? motivoExcepcion : null;

      let savedRow: any;
      if (!existing) {
        const insertRes = await client.query(
          `INSERT INTO public.rh_asistencia_entrega_mensual (
             persona_id, anio, mes, unidad_medica_id, adscripcion_laboral_id,
             estado, fecha_recepcion, recibido_por, observaciones,
             excepcion_administrativa, motivo_excepcion,
             creado_por, actualizado_por
           )
           VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9, $10::uuid, $10::uuid)
           RETURNING *`,
          [
            personaId,
            anio,
            mes,
            resolvedUnidadId,
            resolvedAdscripcionId,
            targetEstado,
            observaciones,
            isExcepcion,
            effectiveMotivoExcepcion,
            operatorId,
          ]
        );
        savedRow = insertRes.rows[0];
      } else {
        const updateRes = await client.query(
          `UPDATE public.rh_asistencia_entrega_mensual
           SET unidad_medica_id = $2,
               adscripcion_laboral_id = $3,
               estado = $4,
               fecha_recepcion = NULL,
               recibido_por = NULL,
               observaciones = $5,
               excepcion_administrativa = $6,
               motivo_excepcion = $7,
               actualizado_por = $8::uuid,
               actualizado_en = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            existing.id,
            resolvedUnidadId,
            resolvedAdscripcionId,
            targetEstado,
            observaciones,
            isExcepcion,
            effectiveMotivoExcepcion,
            operatorId,
          ]
        );
        savedRow = updateRes.rows[0];
      }

      let evento: string;
      if (existing?.estado === 'RECIBIDA') {
        evento = 'RH_ASISTENCIA_RECEPCION_CORREGIDA';
      } else if (targetEstado === 'OBSERVADA') {
        evento = 'RH_ASISTENCIA_OBSERVADA';
      } else if (targetEstado === 'NO_APLICA') {
        evento = 'RH_ASISTENCIA_EXCEPCION_REGISTRADA';
      } else {
        evento = 'RH_ASISTENCIA_ESTADO_CAMBIADO';
      }

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
        [
          operatorId,
          evento,
          `rh_asistencia_entrega_mensual:${savedRow.id}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({
            persona_id: personaId,
            anio,
            mes,
            estado_anterior: existing?.estado ?? null,
            estado_nuevo: targetEstado,
            motivo_excepcion: effectiveMotivoExcepcion,
            motivo_administrativo: motivoAdmin,
            operador_user_id: operatorId,
            registrado_en: new Date().toISOString(),
          }),
        ]
      );

      await client.query('COMMIT');

      return {
        registro: {
          id: Number(savedRow.id),
          persona_id: Number(savedRow.persona_id),
          anio: Number(savedRow.anio),
          mes: Number(savedRow.mes),
          unidad_medica_id: savedRow.unidad_medica_id !== null ? Number(savedRow.unidad_medica_id) : null,
          adscripcion_laboral_id:
            savedRow.adscripcion_laboral_id !== null ? Number(savedRow.adscripcion_laboral_id) : null,
          estado: savedRow.estado,
          fecha_recepcion: toIsoTimestamp(savedRow.fecha_recepcion),
          recibido_por: savedRow.recibido_por,
          observaciones: savedRow.observaciones,
          excepcion_administrativa: Boolean(savedRow.excepcion_administrativa),
          motivo_excepcion: savedRow.motivo_excepcion,
          generado_docx_en: toIsoTimestamp(savedRow.generado_docx_en),
          generaciones_docx_count: Number(savedRow.generaciones_docx_count ?? 0),
          entrega_declarada_en: toIsoTimestamp(savedRow.entrega_declarada_en),
          actualizado_en: toIsoTimestamp(savedRow.actualizado_en) ?? new Date().toISOString(),
        },
        estado_anterior: existing?.estado ?? null,
        idempotente: false,
        evento_auditoria: evento,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
