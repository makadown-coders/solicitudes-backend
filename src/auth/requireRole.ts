import type { RequestHandler } from 'express';

/**
 * Valida que req.user.roles incluya alguno de los roles requeridos.
 * En tu token local vienen como [{code, scope, id}] — aquí aceptamos
 * tanto strings como objetos {code}.
 */
export const requireRole = (...codes: string[]): RequestHandler => {
  return (req, res, next) => {
    const roles: any[] = (req as any).user?.roles ?? [];
    const has = roles.some(r => typeof r === 'string'
      ? codes.includes(r)
      : r && typeof r.code === 'string' && codes.includes(r.code));
    if (!has) {
        res.status(403).json({ error: 'Permiso insuficiente' });
        return;
    }
    next();
    return;
  };
};

/** Limita consultas por unidad cuando el rol es OPER_TIC con scope */
export const scopeUnidadQuery = (param = 'unidad_medica_id'): RequestHandler => {
  return (req, _res, next) => {
    const roles: any[] = (req as any).user?.roles ?? [];
    const oper = roles.find(r => (r?.code ?? r) === 'OPER_TIC');
    if (oper?.id) req.query[param] = String(oper.id);
    next();
    return;
  };
};

/**
 * Exige una asignación explícita y válida de administración global TI en el JWT:
 * `{ code: 'ADMIN_TIC', scope: 'GLOBAL', id: null }`.
 * Deniega por defecto (`403`) cualquier alcance distinto (`CLUES`, `DEPTO`),
 * cualquier `id` distinto de `null` (incluyendo `undefined`, `""`, `"*"` o números),
 * o roles representados como strings sin metadatos de alcance.
 *
 * Nota de evolución: Este diseño protege la operación administrativa actual basada
 * exclusivamente en `ADMIN_TIC GLOBAL` y deberá ampliarse si en el futuro se
 * habilitan operadores (`OPER_TIC`) o lectores TI acotados por `CLUES`.
 */
export const requireTiAdminGlobal = (): RequestHandler => {
  return (req, res, next) => {
    const rawRoles = (req as any).user?.roles;
    const roles: unknown[] = Array.isArray(rawRoles) ? rawRoles : [];

    const hasValidAdminGlobal = roles.some(
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        !Array.isArray(r) &&
        (r as Record<string, unknown>).code === 'ADMIN_TIC' &&
        (r as Record<string, unknown>).scope === 'GLOBAL' &&
        (r as Record<string, unknown>).id === null
    );

    if (!hasValidAdminGlobal) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    next();
    return;
  };
};
