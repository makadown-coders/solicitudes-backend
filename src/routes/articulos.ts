// src/routes/articulos.routes.ts
import express from 'express';
import ArticulosController from '../controllers/articulos.controller';

const router = express.Router();
const articulosController = new ArticulosController();

router.get('/', articulosController.buscarArticulos.bind(articulosController));
router.get('/all', articulosController.buscarArticulosAll.bind(articulosController));

// Nuevas rutas CRUD en Postgres (sin tocar endpoints existentes)
router.get('/crud', articulosController.listarCrud.bind(articulosController));
router.get('/crud/reportes/resumen', articulosController.reporteCrudResumen.bind(articulosController));
router.get('/crud/:id', articulosController.obtenerCrudById.bind(articulosController));
router.post('/crud', articulosController.crearCrud.bind(articulosController));
router.put('/crud/:id', articulosController.actualizarCrud.bind(articulosController));
router.delete('/crud/:id', articulosController.eliminarCrud.bind(articulosController));

export default router;
