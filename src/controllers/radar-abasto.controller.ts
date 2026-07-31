import { Request, Response } from 'express';
import { parseIntSafe } from '../helpers/helper';
import RadarAbastoService from '../services/radar-abasto.service';

export default class RadarAbastoController {
  private service = new RadarAbastoService();

  /** POST /api/radar-abasto/eventos */
  crearEvento = async (req: Request, res: Response): Promise<void> => {
    try {
      const out = await this.service.crearEvento(req.body ?? {});
      res.status(201).json(out);
    } catch (e: any) {
      res.status(400).json({ error: 'crear_evento_failed', detail: e?.message });
    }
  };

  /** GET /api/radar-abasto/eventos */
  listarEventos = async (req: Request, res: Response): Promise<void> => {
    try {
      const out = await this.service.listarEventos({
        desde: req.query.desde?.toString(),
        hasta: req.query.hasta?.toString(),
        clues: req.query.clues?.toString(),
        estado: req.query.estado?.toString() as any,
        riesgoMin: req.query.riesgo_min?.toString() as any,
        page: parseIntSafe(req.query.page, 1),
        pageSize: parseIntSafe(req.query.pageSize, 20),
      });
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: 'listar_eventos_failed', detail: e?.message });
    }
  };

  /** GET /api/radar-abasto/global/snapshot */
  listarGlobalSnapshot = async (req: Request, res: Response): Promise<void> => {
    try {
      const out = await this.service.listarGlobalSnapshot({
        search: req.query.search?.toString(),
        clues: req.query.clues?.toString(),
        tipo_pedido: req.query.tipo_pedido?.toString(),
        tipos_insumo: req.query.tipos_insumo?.toString(),
        page: parseIntSafe(req.query.page, 1),
        pageSize: parseIntSafe(req.query.pageSize, 50),
      });
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: 'listar_global_snapshot_failed', detail: e?.message });
    }
  };

  /** GET /api/radar-abasto/global/timeline */
  listarGlobalTimeline = async (req: Request, res: Response): Promise<void> => {
    try {
      const out = await this.service.listarGlobalTimeline({
        search: req.query.search?.toString(),
        clues: req.query.clues?.toString(),
        tipo_pedido: req.query.tipo_pedido?.toString(),
        tipos_insumo: req.query.tipos_insumo?.toString(),
        months: parseIntSafe(req.query.months, 3),
        page: parseIntSafe(req.query.page, 1),
        pageSize: parseIntSafe(req.query.pageSize, 100),
      });
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: 'listar_global_timeline_failed', detail: e?.message });
    }
  };

  /** GET /api/radar-abasto/global/claves-riesgo */
  listarGlobalClavesRiesgo = async (req: Request, res: Response): Promise<void> => {
    try {
      const out = await this.service.listarGlobalClavesRiesgo({
        search: req.query.search?.toString(),
        clues: req.query.clues?.toString(),
        tipo_pedido: req.query.tipo_pedido?.toString(),
        tipos_insumo: req.query.tipos_insumo?.toString(),
        months: parseIntSafe(req.query.months, 3),
        minSolicitado: parseIntSafe(req.query.minSolicitado, 1),
        page: parseIntSafe(req.query.page, 1),
        pageSize: parseIntSafe(req.query.pageSize, 100),
      });
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: 'listar_global_claves_riesgo_failed', detail: e?.message });
    }
  };

  /** GET /api/radar-abasto/eventos/:id */
  getEventoDetalle = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseIntSafe(req.params.id, 0);
      const out = await this.service.getEventoDetalle(id);
      if (!out) {
        res.status(404).json({ error: 'evento_not_found' });
        return;
      }
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: 'get_evento_detalle_failed', detail: e?.message });
    }
  };

  /** PATCH /api/radar-abasto/eventos/:id */
  patchEvento = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseIntSafe(req.params.id, 0);
      const ok = await this.service.patchEvento(id, {
        estado: req.body?.estado,
        motivo: req.body?.motivo,
        observaciones: req.body?.observaciones,
      });
      if (!ok) {
        res.status(404).json({ error: 'evento_not_found' });
        return;
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: 'patch_evento_failed', detail: e?.message });
    }
  };

  /** POST /api/radar-abasto/eventos/:id/recalcular */
  recalcularEvento = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseIntSafe(req.params.id, 0);
      const ok = await this.service.recalcularEvento(id);
      if (!ok) {
        res.status(404).json({ error: 'evento_not_found' });
        return;
      }
      res.json({ ok: true, recalculated_at: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ error: 'recalcular_evento_failed', detail: e?.message });
    }
  };
}
