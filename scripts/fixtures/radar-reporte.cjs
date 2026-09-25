function row(overrides = {}) {
  return {
    cluesimb: 'BC001', nombre_de_unidad: 'Unidad de prueba', clave: '010.000.0001.00', descripcion: 'Insumo',
    cpm: 10, en_cpm: true, existencia_actual: 0, snapshot_existencias: '2026-09-20T10:00:00Z',
    cobertura_cpm: 0, cobertura_dias: 0, solicitado_periodo: 20, ciclos_con_clave: 1, ciclos_unidad: 2,
    frecuencia_solicitud: .5, primera_solicitud: '2026-09-01', ultima_solicitud: '2026-09-01',
    solicitado_vigente: 0, ciclos_vigentes: 0, solicitud_vigente: false, dias_desde_ultima_solicitud: 23,
    fecha_fin_umbral: '2026-09-15', dias_restantes_umbral: 0, salida_posterior: true,
    piezas_salida_posterior: 2, ultima_salida_posterior: '2026-09-21', estado_operativo: 'HISTORICA_CON_SALIDA',
    homologos_disponibles: 0, existencia_homologos_equivalente: 0, mejor_homologo: null,
    ordenes_pendientes: 1, piezas_pendientes: 3, ordenes_por_vencer: 0, ordenes_vencidas: 1,
    recepciones_recientes: 0, piezas_recibidas_recientes: 0, proxima_entrega: null,
    cobertura_proyectada: 3, cobertura_proyectada_cpm: .3, segmento: 'CRITICA_CPM', prioridad: 100,
    razones: ['Sin existencia', 'Orden vencida'], ...overrides
  };
}


module.exports = row;
