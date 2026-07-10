import express from 'express';
import ReporteCpmSemanalController from '../controllers/reporteCpmSemanal.controller';

const router = express.Router();
const controller = new ReporteCpmSemanalController();

router.get('/reporte', controller.reporte.bind(controller));
router.get('/reporte-excel', controller.reporteExcel.bind(controller));
router.post('/init', controller.init.bind(controller));
router.post('/batch', controller.batch.bind(controller));

export default router;
