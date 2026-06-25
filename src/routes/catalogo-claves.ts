import express from 'express';
import CatalogoClavesController from '../controllers/catalogo-claves.controller';

const router = express.Router();
const controller = new CatalogoClavesController();

router.get('/reporte', controller.reporte.bind(controller));

export default router;
