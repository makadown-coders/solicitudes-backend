import type { Response } from 'express';
import type { RhAuthenticatedRequest } from '../auth/requireRhAccess';
import { RhHttpError } from '../services/rh.service';
import RhAsistenciaService, {
  RH_ASISTENCIA_FILTROS_ESTADO,
  type RhAsistenciaEstadoFiltro,
  type RhAsistenciaSituacionFiltro,
} from '../services/rh-asistencia.service';
import RhAsistenciaMigracionService from '../services/rh-asistencia-migracion.service';
import RhAsistenciaReporteService from '../services/rh-asistencia-reporte.service';

function parsePositiveIntParam(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) {
    return null;
  }
  const parsed = Number(raw.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalPositiveIntQuery(raw: unknown): { ok: boolean; value: number | null } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) {
    return { ok: false, value: null };
  }
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { ok: false, value: null };
  }
  return { ok: true, value: parsed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const ALLOWED_RECEPCION_KEYS: ReadonlySet<string> = new Set([
  'fecha_recepcion',
  'unidad_medica_id',
  'adscripcion_laboral_id',
  'observaciones',
  'motivo_administrativo',
]);

const ALLOWED_ESTADO_KEYS: ReadonlySet<string> = new Set([
  'estado',
  'motivo_excepcion',
  'observaciones',
  'unidad_medica_id',
  'adscripcion_laboral_id',
  'motivo_administrativo',
]);

export default class RhAsistenciaController {
  private readonly service = new RhAsistenciaService();
  private readonly migracionService = new RhAsistenciaMigracionService();
  private readonly reporteService = new RhAsistenciaReporteService();

  private ensureRhGlobal(req: RhAuthenticatedRequest, res: Response, actionLabel: string): boolean {
    if (
      !req.rhAccess ||
      req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' ||
      req.rhAccess.scope !== 'GLOBAL'
    ) {
      res.status(403).json({
        error: `Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para ${actionLabel}`,
      });
      return false;
    }
    return true;
  }

  private handleError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof RhHttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[RhAsistenciaController] Error:', err);
    res.status(500).json({ error: fallbackMessage });
  }

  async matrizAnual(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    if (!this.ensureRhGlobal(req, res, 'consultar la matriz anual de listas de asistencia')) return;

    const query = (req.query ?? {}) as Record<string, unknown>;
    const anio = parsePositiveIntParam(query.anio);
    const unidad = parseOptionalPositiveIntQuery(query.unidadId);
    const page = parseOptionalPositiveIntQuery(query.page);
    const pageSize = parseOptionalPositiveIntQuery(query.pageSize);
    const situacion = typeof query.situacion === 'string'
      ? query.situacion.trim().toUpperCase() || 'TODOS'
      : query.situacion ?? 'TODOS';
    if (anio === null || anio < 2020 || anio > 2100) {
      res.status(400).json({ error: 'El parámetro "anio" debe ser un entero entre 2020 y 2100' });
      return;
    }
    if (!unidad.ok || (unidad.value !== null && unidad.value > 2147483647) || !page.ok || !pageSize.ok) {
      res.status(400).json({ error: 'Parámetros de unidad o paginación inválidos' });
      return;
    }
    if (situacion !== 'ACTIVOS' && situacion !== 'BAJAS' && situacion !== 'TODOS') {
      res.status(400).json({ error: 'Parámetro "situacion" inválido (ACTIVOS, BAJAS o TODOS)' });
      return;
    }
    if (query.q !== undefined && typeof query.q !== 'string') {
      res.status(400).json({ error: 'El parámetro "q" debe ser texto' });
      return;
    }
    try {
      const data = await this.service.getMatrizAnual({
        anio, unidadId: unidad.value, situacion: situacion as RhAsistenciaSituacionFiltro,
        q: typeof query.q === 'string' ? query.q : null,
        page: page.value ?? 1, pageSize: pageSize.value ?? 20,
      });
      res.status(200).json(data);
    } catch (err) {
      this.handleError(res, err, 'Error al consultar la matriz anual de asistencia');
    }
  }

  async seguimientoMensual(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    if (!this.ensureRhGlobal(req, res, 'consultar el seguimiento mensual de listas de asistencia')) {
      return;
    }

    const q = (req.query ?? {}) as Record<string, unknown>;
    const anio = parsePositiveIntParam(q.anio);
    const mes = parsePositiveIntParam(q.mes);
    if (anio === null || mes === null) {
      res.status(400).json({ error: 'Los parámetros "anio" y "mes" son obligatorios y deben ser enteros positivos' });
      return;
    }

    const unidadParsed = parseOptionalPositiveIntQuery(q.unidadId);
    if (!unidadParsed.ok) {
      res.status(400).json({ error: 'Parámetro "unidadId" inválido' });
      return;
    }

    let estado: RhAsistenciaEstadoFiltro | null = null;
    if (q.estado !== undefined && q.estado !== null && q.estado !== '') {
      if (typeof q.estado !== 'string') {
        res.status(400).json({ error: 'Parámetro "estado" inválido' });
        return;
      }
      const norm = q.estado.trim().toUpperCase() as RhAsistenciaEstadoFiltro;
      if (!RH_ASISTENCIA_FILTROS_ESTADO.has(norm)) {
        res.status(400).json({ error: 'Parámetro "estado" no reconocido' });
        return;
      }
      estado = norm;
    }

    const pageParsed = parseOptionalPositiveIntQuery(q.page);
    const pageSizeParsed = parseOptionalPositiveIntQuery(q.pageSize);
    if (!pageParsed.ok || !pageSizeParsed.ok) {
      res.status(400).json({ error: 'Parámetros de paginación inválidos' });
      return;
    }

    const searchText = typeof q.q === 'string' ? q.q.trim() || null : null;

    let situacion: RhAsistenciaSituacionFiltro | null = null;
    if (q.situacion !== undefined && q.situacion !== null && q.situacion !== '') {
      const normSit = typeof q.situacion === 'string' ? q.situacion.trim().toUpperCase() : '';
      if (normSit !== 'ACTIVOS' && normSit !== 'BAJAS' && normSit !== 'TODOS') {
        res.status(400).json({ error: 'Parámetro "situacion" inválido (ACTIVOS, BAJAS o TODOS)' });
        return;
      }
      situacion = normSit;
    }

    try {
      const data = await this.service.getSeguimientoMensual({
        anio,
        mes,
        unidadId: unidadParsed.value,
        estado,
        situacion,
        q: searchText,
        page: pageParsed.value ?? 1,
        pageSize: pageSizeParsed.value ?? 20,
      });
      res.status(200).json(data);
    } catch (err) {
      this.handleError(res, err, 'Error al consultar el seguimiento mensual de asistencia');
    }
  }

  async resumenMensual(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    if (!this.ensureRhGlobal(req, res, 'consultar el resumen mensual de listas de asistencia')) {
      return;
    }

    const q = (req.query ?? {}) as Record<string, unknown>;
    const anio = parsePositiveIntParam(q.anio);
    const mes = parsePositiveIntParam(q.mes);
    if (anio === null || mes === null) {
      res.status(400).json({ error: 'Los parámetros "anio" y "mes" son obligatorios y deben ser enteros positivos' });
      return;
    }

    const unidadParsed = parseOptionalPositiveIntQuery(q.unidadId);
    if (!unidadParsed.ok) {
      res.status(400).json({ error: 'Parámetro "unidadId" inválido' });
      return;
    }

    try {
      const data = await this.service.getResumenMensual(anio, mes, unidadParsed.value);
      res.status(200).json(data);
    } catch (err) {
      this.handleError(res, err, 'Error al consultar el resumen mensual de asistencia');
    }
  }

  async confirmarRecepcion(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    if (!this.ensureRhGlobal(req, res, 'confirmar la recepción de listas de asistencia')) {
      return;
    }

    const personaId = parsePositiveIntParam(req.params?.personaId);
    const anio = parsePositiveIntParam(req.params?.anio);
    const mes = parsePositiveIntParam(req.params?.mes);
    if (personaId === null || anio === null || mes === null) {
      res.status(400).json({ error: 'Parámetros de ruta personaId, anio o mes inválidos' });
      return;
    }

    const body = req.body === undefined ? {} : req.body;
    if (!isPlainObject(body)) {
      res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto JSON' });
      return;
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_RECEPCION_KEYS.has(key)) {
        res.status(400).json({ error: `Campo no permitido en recepción: "${key}"` });
        return;
      }
    }

    try {
      const result = await this.service.confirmarRecepcion(
        personaId,
        anio,
        mes,
        body as any,
        {
          userId: String(req.user?.sub ?? ''),
          ip: req.ip ?? null,
          userAgent: typeof req.get === 'function' ? req.get('user-agent') ?? null : null,
        }
      );
      res.status(200).json(result);
    } catch (err) {
      this.handleError(res, err, 'Error al confirmar la recepción de la lista de asistencia');
    }
  }

  async actualizarEstado(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    if (!this.ensureRhGlobal(req, res, 'actualizar el estado administrativo de listas de asistencia')) {
      return;
    }

    const personaId = parsePositiveIntParam(req.params?.personaId);
    const anio = parsePositiveIntParam(req.params?.anio);
    const mes = parsePositiveIntParam(req.params?.mes);
    if (personaId === null || anio === null || mes === null) {
      res.status(400).json({ error: 'Parámetros de ruta personaId, anio o mes inválidos' });
      return;
    }

    if (!isPlainObject(req.body)) {
      res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto JSON' });
      return;
    }

    for (const key of Object.keys(req.body)) {
      if (!ALLOWED_ESTADO_KEYS.has(key)) {
        res.status(400).json({ error: `Campo no permitido en actualización de estado: "${key}"` });
        return;
      }
    }

    try {
      const result = await this.service.actualizarEstadoAdministrativo(
        personaId,
        anio,
        mes,
        req.body as any,
        {
          userId: String(req.user?.sub ?? ''),
          ip: req.ip ?? null,
          userAgent: typeof req.get === 'function' ? req.get('user-agent') ?? null : null,
        }
      );
      res.status(200).json(result);
    } catch (err) {
      this.handleError(res, err, 'Error al actualizar el estado de la lista de asistencia');
    }
  }

  async importarHistorico2026(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    if (!this.ensureRhGlobal(req, res, 'importar registros históricos de listas de asistencia 2026')) {
      return;
    }

    if (!isPlainObject(req.body)) {
      res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto JSON' });
      return;
    }

    try {
      const result = await this.migracionService.importarHistorico2026(req.body as any, {
        userId: String(req.user?.sub ?? ''),
        ip: req.ip ?? null,
        userAgent: typeof req.get === 'function' ? req.get('user-agent') ?? null : null,
      });
      res.status(200).json(result);
    } catch (err) {
      this.handleError(res, err, 'Error al importar registros históricos de asistencia 2026');
    }
  }

  async exportarReporteAnualXlsx(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    if (!this.ensureRhGlobal(req, res, 'exportar el reporte anual de listas de asistencia')) {
      return;
    }

    const q = (req.query ?? {}) as Record<string, unknown>;
    const anio = parsePositiveIntParam(q.anio);
    if (anio === null) {
      res.status(400).json({ error: 'El parámetro "anio" es obligatorio y debe ser un entero positivo' });
      return;
    }

    const unidadParsed = parseOptionalPositiveIntQuery(q.unidadId);
    if (!unidadParsed.ok) {
      res.status(400).json({ error: 'Parámetro "unidadId" inválido' });
      return;
    }

    let situacion: RhAsistenciaSituacionFiltro = 'TODOS';
    if (q.situacion !== undefined && q.situacion !== null && q.situacion !== '') {
      const normSit = typeof q.situacion === 'string' ? q.situacion.trim().toUpperCase() : '';
      if (normSit !== 'ACTIVOS' && normSit !== 'BAJAS' && normSit !== 'TODOS') {
        res.status(400).json({ error: 'Parámetro "situacion" inválido (ACTIVOS, BAJAS o TODOS)' });
        return;
      }
      situacion = normSit;
    }

    try {
      const { buffer, fileName } = await this.reporteService.generarReporteAnualXlsx({
        anio,
        unidadId: unidadParsed.value,
        situacion,
      });
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(200).send(buffer);
    } catch (err) {
      this.handleError(res, err, 'Error al generar el reporte anual de listas de asistencia');
    }
  }
}
