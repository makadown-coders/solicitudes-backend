import express from 'express';
import CitasController from '../controllers/citas.controller';

const router = express.Router();
const controller = new CitasController();

// NOTA: El unico endpoint activo es el de /full ya que postgres es el que maneja la base de datos
// y nos topamos con que 
// - tener version gratuita de backend es muy complicado porque como se duerme, a veces
//   hay intermitencia y da mala experiencia al usuario del front
// - al obtener los datos de power automate y guardarlos en postgres dentro del seed u otras
//   funciones, se tarda mucho, tanto que el backend se duerme y no es muy eficiente
router.get('/full', controller.obtenerDesdePowerAutomate64.bind(controller));

export default router;
