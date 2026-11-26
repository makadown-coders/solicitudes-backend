import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth';
import { requireRhAccess } from '../auth/requireRhAccess';
import RhController from '../controllers/rh.controller';
import RhAsistenciaController from '../controllers/rh-asistencia.controller';

const router = Router();
const controller = new RhController();
const asistenciaController = new RhAsistenciaController();

// Autogestión del empleado autenticado (/rh): requiere sesión válida y persona institucional activa,
// sin exigir rol administrativo RECURSOS_HUMANOS ni ADMIN_TIC.
router.get(
  '/mi-contexto',
  requireAuth,
  controller.miContexto.bind(controller)
);

router.get(
  '/mi-vacaciones',
  requireAuth,
  controller.miVacaciones.bind(controller)
);

router.get(
  '/unidades-autorizadas',
  requireAuth,
  requireRhAccess(),
  controller.unidadesAutorizadas.bind(controller)
);

router.get(
  '/unidades/:unidadId/personal',
  requireAuth,
  requireRhAccess(),
  controller.personalPorUnidad.bind(controller)
);

router.get(
  '/unidades/:unidadId/personal/:adscripcionId',
  requireAuth,
  requireRhAccess(),
  controller.fichaPersonalPorUnidad.bind(controller)
);

router.patch(
  '/unidades/:unidadId/personal/:adscripcionId/laboral',
  requireAuth,
  requireRhAccess(),
  controller.updateAdscripcionLaboralPorUnidad.bind(controller)
);

router.post(
  '/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores',
  requireAuth,
  requireRhAccess(),
  controller.revelarIdentificadoresPorUnidad.bind(controller)
);

router.patch(
  '/unidades/:unidadId/personal/:adscripcionId/identificacion',
  requireAuth,
  requireRhAccess(),
  controller.updateIdentificacionPersonalPorUnidad.bind(controller)
);

router.get(
  '/unidades/:unidadId/personas-candidatas',
  requireAuth,
  requireRhAccess(),
  controller.personasCandidatasPorUnidad.bind(controller)
);

router.post(
  '/unidades/:unidadId/adscripciones',
  requireAuth,
  requireRhAccess(),
  controller.createAdscripcionPorUnidad.bind(controller)
);

router.get(
  '/personas',
  requireAuth,
  requireRhAccess(),
  controller.listPersonasPadron.bind(controller)
);

router.post(
  '/personas',
  requireAuth,
  requireRhAccess(),
  controller.createPersona.bind(controller)
);

router.patch(
  '/personas/:personaId/estado',
  requireAuth,
  requireRhAccess(),
  controller.updatePersonaEstado.bind(controller)
);

router.patch(
  '/personas/:personaId/general',
  requireAuth,
  requireRhAccess(),
  controller.updatePersonaGeneral.bind(controller)
);

router.get(
  '/personas/:personaId/comisiones',
  requireAuth,
  requireRhAccess(),
  controller.listComisionesPersona.bind(controller)
);

router.post(
  '/personas/:personaId/comisiones',
  requireAuth,
  requireRhAccess(),
  controller.createComisionPersona.bind(controller)
);

router.patch(
  '/personas/:personaId/comisiones/:comisionId/concluir',
  requireAuth,
  requireRhAccess(),
  controller.concluirComisionPersona.bind(controller)
);

router.get(
  '/vacaciones/periodos',
  requireAuth,
  requireRhAccess(),
  controller.listVacacionPeriodos.bind(controller)
);

router.get(
  '/personas/:personaId/vacaciones/bolsas',
  requireAuth,
  requireRhAccess(),
  controller.listVacacionBolsasPersona.bind(controller)
);

router.patch(
  '/personas/:personaId/vacaciones/bolsas/:periodoId',
  requireAuth,
  requireRhAccess(),
  controller.upsertVacacionBolsaPersona.bind(controller)
);

router.get(
  '/personas/:personaId/vacaciones/kardex',
  requireAuth,
  requireRhAccess(),
  controller.getVacacionKardexPersona.bind(controller)
);

router.get(
  '/personas/:personaId/vacaciones',
  requireAuth,
  requireRhAccess(),
  controller.listVacacionesPersona.bind(controller)
);

router.post(
  '/personas/:personaId/vacaciones',
  requireAuth,
  requireRhAccess(),
  controller.createVacacionPersona.bind(controller)
);

router.patch(
  '/personas/:personaId/vacaciones/:registroId/anular',
  requireAuth,
  requireRhAccess(),
  controller.anularVacacionPersona.bind(controller)
);

router.get(
  '/personas/:personaId/adscripciones',
  requireAuth,
  requireRhAccess(),
  controller.listAdscripcionesPersona.bind(controller)
);

router.post(
  '/unidades/:unidadId/adscripciones/lote/validar',
  requireAuth,
  requireRhAccess(),
  controller.validarLoteAdscripcionesPorUnidad.bind(controller)
);

router.post(
  '/unidades/:unidadId/adscripciones/lote',
  requireAuth,
  requireRhAccess(),
  controller.createLoteAdscripcionesPorUnidad.bind(controller)
);

router.get(
  '/organigrama/puestos',
  requireAuth,
  requireRhAccess(),
  controller.listOrganigramaPuestos.bind(controller)
);

router.post(
  '/organigrama/puestos',
  requireAuth,
  requireRhAccess(),
  controller.createOrganigramaPuesto.bind(controller)
);

router.patch(
  '/organigrama/puestos/:puestoId',
  requireAuth,
  requireRhAccess(),
  controller.updateOrganigramaPuesto.bind(controller)
);

router.patch(
  '/organigrama/puestos/:puestoId/dependencia',
  requireAuth,
  requireRhAccess(),
  controller.changeOrganigramaDependencia.bind(controller)
);

router.patch(
  '/organigrama/puestos/:puestoId/estado',
  requireAuth,
  requireRhAccess(),
  controller.updateOrganigramaPuestoEstado.bind(controller)
);

// Control administrativo de entrega/recepción mensual de listas de asistencia (RH-ASIS-03)
router.get(
  '/asistencia/matriz-anual',
  requireAuth,
  requireRhAccess(),
  asistenciaController.matrizAnual.bind(asistenciaController)
);

router.get(
  '/asistencia/seguimiento',
  requireAuth,
  requireRhAccess(),
  asistenciaController.seguimientoMensual.bind(asistenciaController)
);

router.get(
  '/asistencia/resumen',
  requireAuth,
  requireRhAccess(),
  asistenciaController.resumenMensual.bind(asistenciaController)
);

router.patch(
  '/asistencia/personas/:personaId/periodos/:anio/:mes/recepcion',
  requireAuth,
  requireRhAccess(),
  asistenciaController.confirmarRecepcion.bind(asistenciaController)
);

router.patch(
  '/asistencia/personas/:personaId/periodos/:anio/:mes/estado',
  requireAuth,
  requireRhAccess(),
  asistenciaController.actualizarEstado.bind(asistenciaController)
);

// Endpoint temporal de importación histórica auditada 2026 (RH-ASIS-05B2)
router.post(
  '/asistencia/migracion-2026/importar',
  requireAuth,
  requireRhAccess(),
  asistenciaController.importarHistorico2026.bind(asistenciaController)
);

// Reporte institucional XLSX anual y mensual de asistencia (RH-ASIS-06)
router.get(
  '/asistencia/reporte-anual.xlsx',
  requireAuth,
  requireRhAccess(),
  asistenciaController.exportarReporteAnualXlsx.bind(asistenciaController)
);

export default router;
