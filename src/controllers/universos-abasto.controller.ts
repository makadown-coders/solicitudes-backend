import { Request, Response } from 'express';
import UniversosAbastoService from '../services/universos-abasto.service';

export default class UniversosAbastoController {
  constructor(private readonly service = new UniversosAbastoService()) {}

  listarUnidades = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ data: await this.service.listarUnidades() });
    } catch (error) {
      console.error('Error al consultar unidades con universo:', error);
      res.status(500).json({ error: 'No fue posible consultar las unidades con universo' });
    }
  };

  listarClaves = async (req: Request, res: Response): Promise<void> => {
    try {
      const unidadId = this.parsePositiveInt(req.params.unidadId);
      const page = this.parseBoundedInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
      const pageSize = this.parseBoundedInt(req.query.pageSize, 25, 1, 100);
      const unidad = await this.service.obtenerUnidad(unidadId);
      if (!unidad) {
        res.status(404).json({ error: 'La unidad no tiene un universo hospitalario configurado' });
        return;
      }

      const result = await this.service.listarClaves(unidadId, {
        page,
        pageSize,
        search: this.parseText(req.query.search),
        tipoInsumo: this.parseText(req.query.tipoInsumo),
        activo: this.parseBoolean(req.query.activo),
      });
      res.json({ unidad, ...result });
    } catch (error) {
      if (error instanceof Error && error.message === 'Parámetro inválido') {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error al consultar claves del universo:', error);
      res.status(500).json({ error: 'No fue posible consultar las claves del universo' });
    }
  };

  buscarClavesCandidatas = async (req: Request, res: Response): Promise<void> => {
    try {
      const unidadId = this.parsePositiveInt(req.query.unidadId);
      const search = this.parseText(req.query.search);
      if (!search || search.length < 2) {
        res.status(400).json({ error: 'La búsqueda debe contener al menos 2 caracteres' });
        return;
      }
      const page = this.parseBoundedInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
      const pageSize = this.parseBoundedInt(req.query.pageSize, 10, 1, 25);
      const unidad = await this.service.obtenerUnidad(unidadId);
      if (!unidad) {
        res.status(404).json({ error: 'La unidad no tiene un universo hospitalario configurado' });
        return;
      }
      res.json(await this.service.buscarClavesCandidatas(unidadId, search, page, pageSize));
    } catch (error) {
      if (error instanceof Error && error.message === 'Parámetro inválido') {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error al buscar claves candidatas:', error);
      res.status(500).json({ error: 'No fue posible buscar claves en el catálogo operativo' });
    }
  };

  incorporarClave = async (req: Request, res: Response): Promise<void> => {
    try {
      const unidadId = this.parsePositiveInt(req.params.unidadId);
      const clave = this.parseText(req.body?.clave);
      if (!clave) {
        res.status(400).json({ error: 'La clave CNIS es obligatoria' });
        return;
      }
      const result = await this.service.incorporarClave(unidadId, {
        clave,
        tipoInsumoManual: this.parseText(req.body?.tipoInsumoManual),
      });
      if (result.ok) {
        res.status(201).json(result);
        return;
      }
      const errors: Record<string, [number, string]> = {
        UNIDAD_NO_EXISTE: [404, 'La unidad médica no existe'],
        CLAVE_NO_EXISTE: [404, 'La clave no existe en el catálogo operativo'],
        DUPLICADA: [409, 'La clave ya pertenece al universo de la unidad'],
        TIPO_MANUAL_REQUERIDO: [400, 'Selecciona un tipo válido para la clave 160'],
        CLASIFICACION_NO_DISPONIBLE: [422, 'Clasificación no disponible para esta clave'],
        CLASIFICACION_INCOMPATIBLE: [422, 'La clasificación CNIS no es compatible con el universo'],
        CLASIFICACION_AMBIGUA: [422, 'La clave tiene múltiples clasificaciones CNIS'],
      };
      if (!('reason' in result)) {
        res.status(500).json({ error: 'No fue posible incorporar la clave' });
        return;
      }
      const [status, message] = errors[result.reason] ?? [500, 'No fue posible incorporar la clave'];
      res.status(status).json({ error: message });
    } catch (error) {
      if (error instanceof Error && error.message === 'Parámetro inválido') {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error al incorporar clave al universo:', error);
      res.status(500).json({ error: 'No fue posible incorporar la clave al universo' });
    }
  };

  actualizarActivo = async (req: Request, res: Response): Promise<void> => {
    try {
      const unidadId = this.parsePositiveInt(req.params.unidadId);
      const claveCnis = this.parseText(req.params.claveCnis);
      if (!claveCnis) {
        res.status(400).json({ error: 'La clave CNIS es obligatoria' });
        return;
      }
      if (typeof req.body?.activo !== 'boolean') {
        res.status(400).json({ error: 'El campo activo debe ser booleano' });
        return;
      }

      const result = await this.service.actualizarActivo(unidadId, claveCnis, req.body.activo);
      if (!result) {
        res.status(404).json({ error: 'La clave no pertenece al universo de la unidad seleccionada' });
        return;
      }
      res.json({ data: result });
    } catch (error) {
      if (error instanceof Error && error.message === 'Parámetro inválido') {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error al actualizar la habilitación de la clave:', error);
      res.status(500).json({ error: 'No fue posible actualizar la habilitación de la clave' });
    }
  };

  obtenerAnalisisOperativo = async (req: Request, res: Response): Promise<void> => {
    try {
      const unidadId = this.parsePositiveInt(req.params.unidadId);
      const articulos = req.body?.articulos;
      if (!Array.isArray(articulos) || articulos.length === 0 || articulos.length > 1100) {
        res.status(400).json({ error: 'La solicitud debe incluir entre 1 y 1100 claves' });
        return;
      }

      const claves = new Set<string>();
      const solicitud = articulos.map((item: unknown) => {
        if (!item || typeof item !== 'object') throw new Error('Solicitud inválida');
        const valor = item as { clave?: unknown; cantidad?: unknown };
        const clave = this.parseText(valor.clave);
        if (!clave || typeof valor.cantidad !== 'number' || !Number.isFinite(valor.cantidad)
          || !Number.isInteger(valor.cantidad) || valor.cantidad <= 0 || valor.cantidad > 99999) {
          throw new Error('Solicitud inválida');
        }
        const normalizada = clave.toUpperCase();
        if (claves.has(normalizada)) throw new Error('Solicitud inválida');
        claves.add(normalizada);
        return { clave, cantidad: valor.cantidad };
      });

      const result = await this.service.obtenerAnalisisOperativo(unidadId, solicitud);
      if (!result) {
        res.status(404).json({ error: 'La unidad médica o alguna clave del universo no existe' });
        return;
      }
      res.json(result);
    } catch (error) {
      if (error instanceof Error && ['Parámetro inválido', 'Solicitud inválida'].includes(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error al preparar el análisis operativo:', error);
      res.status(500).json({ error: 'No fue posible preparar el análisis operativo' });
    }
  };

  private parsePositiveInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Parámetro inválido');
    return parsed;
  }

  private parseBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error('Parámetro inválido');
    return parsed;
  }

  private parseText(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value.trim() || undefined;
  }

  private parseBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error('Parámetro inválido');
  }
}
