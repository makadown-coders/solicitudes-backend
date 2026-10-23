// src/routes/solicitudes-config.routes.ts
import { Router } from 'express';
import { SolicitudesController } from '../controllers/solicitudes.controller';
import { NecesidadesPrimerNivelApsController } from '../controllers/necesidades-primer-nivel-aps.controller';
import { NecesidadesPrimerNivelProgramasPreventivosController } from '../controllers/necesidades-primer-nivel-programas-preventivos.controller';
import ConcentradoPrimerNivelController from '../controllers/concentrado-primer-nivel.controller';

const r = Router();
const c = new SolicitudesController();
const aps = new NecesidadesPrimerNivelApsController();
const preventivos = new NecesidadesPrimerNivelProgramasPreventivosController();
const concentradoPrimerNivel = new ConcentradoPrimerNivelController();

r.post('/primer-nivel/enviar', c.postEnviarNecesidadesPrimerNivel.bind(c));
r.post('/primer-nivel/vista-previa-excel', c.postVistaPreviaNecesidadesPrimerNivel.bind(c));
r.get('/primer-nivel/concentrado', concentradoPrimerNivel.consultar);
r.get('/primer-nivel/concentrado/export', concentradoPrimerNivel.exportar);
r.get('/primer-nivel/aps/estructura', aps.getEstructura.bind(aps));
r.get('/primer-nivel/aps/medicamentos', aps.getMedicamentos.bind(aps));
r.get('/primer-nivel/aps/medicamentos/:codigo', aps.getMedicamento.bind(aps));
r.post('/primer-nivel/aps/resolver', aps.postResolver.bind(aps));
r.get('/primer-nivel/programas-preventivos', preventivos.getProgramas.bind(preventivos));
r.post('/primer-nivel/programas-preventivos/resolver', preventivos.postResolver.bind(preventivos));
r.get('/primer-nivel/programas-preventivos/:codigo', preventivos.getPrograma.bind(preventivos));

// Solo admin en PATCH idealmente (middleware auth)
// r.get('/get-bitacora', c.getBitacora.bind(c));
r.post('/bitacora', c.postCrearBitacora.bind(c));
r.get('/bitacora', c.getBitacora.bind(c));
r.get('/bitacora/:id/detalle', c.getBitacoraDetalle.bind(c));
r.get('/movimientos', c.getMovimientos.bind(c));
r.get('/movimientos/resumen', c.getMovimientosResumen.bind(c));

export default r;
