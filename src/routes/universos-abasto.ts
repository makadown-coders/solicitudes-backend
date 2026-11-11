import { Router } from 'express';
import UniversosAbastoController from '../controllers/universos-abasto.controller';

const router = Router();
const controller = new UniversosAbastoController();

router.get('/unidades', controller.listarUnidades);
router.get('/catalogo/buscar', controller.buscarClavesCandidatas);
router.get('/unidades/:unidadId/claves', controller.listarClaves);
router.post('/unidades/:unidadId/analisis-operativo', controller.obtenerAnalisisOperativo);
router.post('/unidades/:unidadId/claves', controller.incorporarClave);
router.patch('/unidades/:unidadId/claves/:claveCnis/activo', controller.actualizarActivo);

export default router;
