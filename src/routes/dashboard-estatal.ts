import express from 'express';
import DashboardEstatalController from '../controllers/dashboard-estatal.controller';

const router = express.Router();
const controller = new DashboardEstatalController();

router.get('/claves', controller.claves.bind(controller));
router.get('/resumen-clave', controller.resumenClave.bind(controller));
router.get('/top', controller.top.bind(controller));
router.get('/ordenes-pendientes', controller.ordenesPendientes.bind(controller));

export default router;
