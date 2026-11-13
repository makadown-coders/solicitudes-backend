import type { Request, RequestHandler } from 'express';

export type RhAccessScope = 'GLOBAL' | 'CLUES';

export interface RhAccessContext {
  scope: RhAccessScope;
  clues: string[];
  grantedBy: 'RECURSOS_HUMANOS' | 'ADMIN_TIC';
}

export interface RhAuthenticatedRequest extends Request {
  rhAccess?: RhAccessContext;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Resuelve el alcance efectivo de Recursos Humanos a partir de `req.user.roles`.
 * - `RECURSOS_HUMANOS` con `{ scope: 'GLOBAL', id: null }` -> GLOBAL.
 * - `ADMIN_TIC` con `{ scope: 'GLOBAL', id: null }` -> GLOBAL.
 * - `RECURSOS_HUMANOS` con `{ scope: 'CLUES', id: '<CLUES>' }` -> CLUES (unión deduplicada).
 * - Si coexisten `RECURSOS_HUMANOS GLOBAL` y `RECURSOS_HUMANOS CLUES`, prevalece `GLOBAL`.
 * - Otros roles (`WISHLIST`, `ABASTO`, `ADMIN_TIC CLUES`, etc.) no conceden acceso.
 */
export function resolveRhAccess(rawRoles: unknown): RhAccessContext | null {
  const roles: unknown[] = Array.isArray(rawRoles) ? rawRoles : [];

  let hasRhGlobal = false;
  let hasAdminTicGlobal = false;
  const cluesSet = new Set<string>();

  for (const r of roles) {
    if (!isPlainObject(r)) continue;
    const code = typeof r.code === 'string' ? r.code.trim().toUpperCase() : '';
    const scope = typeof r.scope === 'string' ? r.scope.trim().toUpperCase() : '';
    const id = r.id;

    if (code === 'RECURSOS_HUMANOS' && scope === 'GLOBAL' && id === null) {
      hasRhGlobal = true;
    } else if (code === 'ADMIN_TIC' && scope === 'GLOBAL' && id === null) {
      hasAdminTicGlobal = true;
    } else if (code === 'RECURSOS_HUMANOS' && scope === 'CLUES' && typeof id === 'string') {
      const norm = id.trim().toUpperCase();
      if (norm) {
        cluesSet.add(norm);
      }
    }
  }

  if (hasRhGlobal) {
    return { scope: 'GLOBAL', clues: [], grantedBy: 'RECURSOS_HUMANOS' };
  }

  if (hasAdminTicGlobal) {
    return { scope: 'GLOBAL', clues: [], grantedBy: 'ADMIN_TIC' };
  }

  if (cluesSet.size > 0) {
    return {
      scope: 'CLUES',
      clues: Array.from(cluesSet).sort(),
      grantedBy: 'RECURSOS_HUMANOS',
    };
  }

  return null;
}

export const requireRhAccess = (): RequestHandler => {
  return (req, res, next) => {
    const access = resolveRhAccess((req as any).user?.roles);
    if (!access) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }
    (req as RhAuthenticatedRequest).rhAccess = access;
    next();
  };
};
