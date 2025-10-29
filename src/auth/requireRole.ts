import type { RequestHandler } from 'express';

/**
 * Valida que req.user.roles incluya alguno de los roles requeridos.
 * En tu token local vienen como [{code, scope, id}] — aquí aceptamos
 * tanto strings como objetos {code}.
 */
export const requireRole = (...codes: string[]): RequestHandler => {
  return (req, res, next) => {
    // console.log('usuario checado:', (req as any).user);
    const roles: any[] = (req as any).user?.roles ?? [];
    // console.log('Roles del usuario:', roles);
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
