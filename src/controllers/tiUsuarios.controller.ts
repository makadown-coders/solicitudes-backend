import { Request, Response } from 'express';
import TiUsuariosService from '../services/tiUsuarios.service';

function isInvalidNonStringQuery(val: unknown): boolean {
  return val !== undefined && val !== null && typeof val !== 'string';
}

function extractSingleStringQuery(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  return null;
}

export default class TiUsuariosController {
  private readonly svc = new TiUsuariosService();

  listRoles = async (_req: Request, res: Response): Promise<void> => {
    try {
      const roles = await this.svc.listRoles();
      res.json(roles);
    } catch {
      res.status(500).json({ ok: false, error: 'Error al consultar roles' });
    }
  };

  listUsuarios = async (req: Request, res: Response): Promise<void> => {
    try {
      if (
        isInvalidNonStringQuery(req.query.q) ||
        isInvalidNonStringQuery(req.query.status) ||
        isInvalidNonStringQuery(req.query.page) ||
        isInvalidNonStringQuery(req.query.pageSize)
      ) {
        res.status(400).json({ ok: false, error: 'Parámetros de consulta inválidos' });
        return;
      }

      const rawPage = extractSingleStringQuery(req.query.page);
      const rawPageSize = extractSingleStringQuery(req.query.pageSize);

      let page = 1;
      if (rawPage !== null && rawPage.trim() !== '') {
        const parsedPage = Number(rawPage);
        if (!Number.isInteger(parsedPage) || parsedPage < 1) {
          res.status(400).json({ ok: false, error: 'Parámetro page inválido' });
          return;
        }
        page = parsedPage;
      }

      let pageSize = 20;
      if (rawPageSize !== null && rawPageSize.trim() !== '') {
        const parsedPageSize = Number(rawPageSize);
        if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1) {
          res.status(400).json({ ok: false, error: 'Parámetro pageSize inválido' });
          return;
        }
        pageSize = Math.min(parsedPageSize, 100);
      }

      const q = extractSingleStringQuery(req.query.q)?.trim() || null;
      const status = extractSingleStringQuery(req.query.status)?.trim() || null;

      if (q && q.length > 200) {
        res.status(400).json({ ok: false, error: 'Parámetro q excede la longitud permitida' });
        return;
      }

      if (status && status.length > 50) {
        res.status(400).json({ ok: false, error: 'Parámetro status inválido' });
        return;
      }

      const out = await this.svc.listUsuariosPaged({
        q,
        status,
        page,
        pageSize,
      });

      res.json(out);
    } catch {
      res.status(500).json({ ok: false, error: 'Error al listar usuarios' });
    }
  };
}
