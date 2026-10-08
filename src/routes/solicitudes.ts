// src/routes/solicitudes-config.routes.ts
import { Router } from 'express';
import { SolicitudesController } from '../controllers/solicitudes.controller';

const r = Router();
const c = new SolicitudesController();

r.post('/primer-nivel/enviar', c.postEnviarNecesidadesPrimerNivel.bind(c));

// Solo admin en PATCH idealmente (middleware auth)
// r.get('/get-bitacora', c.getBitacora.bind(c));
r.post('/bitacora', c.postCrearBitacora.bind(c));
r.get('/bitacora', c.getBitacora.bind(c));
r.get('/bitacora/:id/detalle', c.getBitacoraDetalle.bind(c));
r.get('/movimientos', c.getMovimientos.bind(c));
r.get('/movimientos/resumen', c.getMovimientosResumen.bind(c));

export default r;
