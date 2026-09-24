import { Router } from 'express';
import ReporteRadarSemanalController from '../controllers/reporteRadarSemanal.controller';

const router = Router();
const controller = new ReporteRadarSemanalController();

router.get('/reporte', controller.reporte);
router.get('/reporte-excel', controller.reporteExcel);

export default router;
