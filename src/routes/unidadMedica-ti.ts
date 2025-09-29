// src/routes/unidadMedica-ti.ts
import { Router } from 'express';
import UnidadMedicaTIController from '../controllers/unidadMedica-ti.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';

const router = Router();
const c = new UnidadMedicaTIController();

/**
 * GET /api/ti/unidades
 * Query: municipio_id, localidad_id, tipo_unidad_id, q, page, pageSize
 * Seguridad: cuando decidas, descomenta requireAuth/requireRole
 */
router.get('/',
  requireAuth, requireRole('ADMIN_TIC','OPER_TIC','CONSULTA_TIC'),
  c.search.bind(c)
);

export default router;
