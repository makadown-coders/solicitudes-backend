import { Router } from 'express';
import CnisGruposTerapeuticosController from '../controllers/cnis-grupos-terapeuticos.controller';

const router = Router();
const controller = new CnisGruposTerapeuticosController();

router.get('/', controller.obtenerGruposUtilizados.bind(controller));
router.get('/articulos', controller.obtenerArticulosConGrupo.bind(controller));
router.get('/:numero/articulos', controller.obtenerArticulosPorGrupo.bind(controller));

export default router;
