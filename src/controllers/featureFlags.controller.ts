// src/controllers/featureFlags.controller.ts
import { Request, Response } from 'express';
import { FlagKey, FlagScope } from '../models/featureFlags';
import FeatureFlagsService from '../services/featureFlags.service';

export class FeatureFlagsController {

    private service: FeatureFlagsService;

    constructor() {
        this.service = new FeatureFlagsService();
    }

  async getEffective(req: Request, res: Response) {
    const cluesimb = req.query.cluesimb?.toString();
    const nivel = req.query.nivel === 'PRIMER_NIVEL' || req.query.nivel === 'SEGUNDO_NIVEL'
      ? (req.query.nivel as 'PRIMER_NIVEL'|'SEGUNDO_NIVEL') : undefined;

    const flags = await this.service.getEffectiveFlags({ cluesimb, nivel });
    res.json({ ok: true, flags });
  }

  async list(req: Request, res: Response) {
    const rows = await this.service.listAllFlags();
    res.json({ ok: true, rows });
  }

  async patch(req: Request, res: Response) {
    // soporte bulk: [{flag_key, scope, scope_id?, value}]
    const arr = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];
    for (const item of arr) {
      const { flag_key, scope, scope_id, value } = item || {};
      if (!flag_key || !scope || typeof value === 'undefined') {
        return res.status(400).json({ ok:false, error:'flag_key, scope, value son requeridos' });
      }
      if (!['global','nivel','clues'].includes(scope)) {
        return res.status(400).json({ ok:false, error:'scope inválido' });
      }
      // tipo por clave (booleans para los actuales)
      if (['SOLO_CPMS','BUSCAR_EXISTENCIA_EN_CLUES','APLICAR_ENCUESTAS','APLICAR_EQUIVALENCIAS'].includes(flag_key) && typeof value !== 'boolean') {
        return res.status(400).json({ ok:false, error:`${flag_key} debe ser boolean` });
      }
      const updatedBy = (req.user?.name ?? 'api') as string;
      const row = await this.service.upsertFlag({
        flag_key: flag_key as FlagKey,
        scope: scope as FlagScope,
        scope_id,
        value,
        updated_by: updatedBy, // si tienes auth
      });
      results.push(row);
    }
    res.json({ ok: true, updated: results.length, rows: results });
  }
}
