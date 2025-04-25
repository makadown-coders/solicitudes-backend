// src/routes/articulos.routes.ts
import express from 'express';
import ArticulosController from '../controllers/articulos.controller';

const router = express.Router();
const articulosController = new ArticulosController();

router.get('/', articulosController.buscarArticulos);

export default router;