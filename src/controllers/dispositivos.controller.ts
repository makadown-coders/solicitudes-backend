// src/controllers/dispositivos.controller.ts
import { Request, Response } from 'express';
import DispositivosService from '../services/dispositivos.service';

export default class DispositivosController {
  private svc = new DispositivosService();

  list = async (req: Request, res: Response) => {
    try {
      const pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
      const page = Math.max(Number(req.query.page ?? 1), 1);
      const unidad_medica_id = req.query.unidad_medica_id ? Number(req.query.unidad_medica_id) : null;
      const tipo_dispositivo_id = req.query.tipo_dispositivo_id ? Number(req.query.tipo_dispositivo_id) : null;
      const estado_dispositivo_id = req.query.estado_dispositivo_id ? Number(req.query.estado_dispositivo_id) : null;
      const q = req.query.q ? String(req.query.q) : null;

      const out = await this.svc.listPaged({
        unidad_medica_id, tipo_dispositivo_id, estado_dispositivo_id, q, page, pageSize
      });

      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Error al listar dispositivos' });
    }
  };

  create = async (req: Request, res: Response) => {
    try { res.status(201).json(await this.svc.create(req.body)); }
    catch (e: any) { res.status(400).json({ error: e?.message || 'Error al crear dispositivo' }); }
  };

  byId = async (req: Request, res: Response) => {
    try {
      const out = await this.svc.byId(Number(req.params.id));
      if (!out) return res.sendStatus(404);
      res.json(out);
    } catch { res.status(500).json({ message: 'Error al obtener dispositivo' }); }
  };

  updateBasic = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { ip, conexion, observaciones, serial, marca, modelo, nics } = req.body || {};
      const out = await this.svc.updateBasic({
        id,
        ip: ip ?? null,
        conexion: conexion ?? null,
        observaciones: observaciones ?? null,
        serial: serial ?? null,
        marca: marca ?? null,
        modelo: modelo ?? null,
        nics: nics ?? []
      });
      res.json({ ok: true, id: out.id });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('dispositivo_nic_mac_norm_uniq') || msg.includes('dispositivo_nic_uq_per_device')) {
        res.status(400).json({ ok: false, error: 'La MAC ya está registrada.' });
      }
    }
  };

  cambiarAsignacion = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { persona_id, lugar_especifico, estado_dispositivo_id, fecha_asignacion } = req.body || {};
      if (!persona_id && !lugar_especifico) {
        return res.status(400).json({ ok: false, error: 'persona_id o lugar_especifico requerido' });
      }
      const out = await this.svc.changeAssignment({
        dispositivo_id: id,
        persona_id: persona_id ?? null,
        lugar_especifico: lugar_especifico ?? null,
        estado_dispositivo_id: estado_dispositivo_id ?? null,
        fecha_asignacion: fecha_asignacion ?? null
      });
      res.json({ ok: true, asignacion_id: out.id });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  };

  agregarMonitor = async (req: Request, res: Response) => {
    try {
      const dispositivo_id = Number(req.params.id);
      const { serial, marca, modelo, es_principal } = req.body || {};
      const out = await this.svc.addMonitor({ dispositivo_id, serial: serial ?? null, marca: marca ?? null, modelo: modelo ?? null, es_principal: !!es_principal });
      res.json({ ok: true, id: out.id });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  };

  actualizarMonitor = async (req: Request, res: Response) => {
    try {
      const dispositivo_id = Number(req.params.id);
      const monitor_id = Number(req.params.monitorId);
      const { serial, marca, modelo, es_principal } = req.body || {};
      const out = await this.svc.updateMonitor({ id: monitor_id, dispositivo_id, serial: serial ?? null, marca: marca ?? null, modelo: modelo ?? null, es_principal: !!es_principal });
      res.json({ ok: true, id: out.id });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  };

  agregarPeriferico = async (req: Request, res: Response) => {
    try {
      const dispositivo_id = Number(req.params.id);
      const { tipo, serial, marca, modelo } = req.body || {};
      if (!tipo) return res.status(400).json({ ok: false, error: 'tipo requerido' });
      const out = await this.svc.addPeriferico({ dispositivo_id, tipo: String(tipo), serial: serial ?? null, marca: marca ?? null, modelo: modelo ?? null });
      res.json({ ok: true, id: out.id });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  };

  actualizarPeriferico = async (req: Request, res: Response) => {
    try {
      const dispositivo_id = Number(req.params.id);
      const periferico_id = Number(req.params.perifericoId);
      const { tipo, serial, marca, modelo } = req.body || {};
      const out = await this.svc.updatePeriferico({ id: periferico_id, dispositivo_id, tipo: tipo ?? null, serial: serial ?? null, marca: marca ?? null, modelo: modelo ?? null });
      res.json({ ok: true, id: out.id });
    } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
  };
}
