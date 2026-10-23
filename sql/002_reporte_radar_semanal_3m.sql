-- Vista materializada exclusiva del reporte semanal fijo de tres meses.
-- Aplicar una vez y refrescar antes de cada envío semanal.

BEGIN;

-- Reducen el costo del corte fijo y de la última solicitud por unidad.
CREATE INDEX IF NOT EXISTS ix_solicitud_bitacora_created_day
  ON public.solicitud_bitacora (created_day);
CREATE INDEX IF NOT EXISTS ix_solicitud_bitacora_clues_created_day_norm
  ON public.solicitud_bitacora (UPPER(TRIM(cluesimb)), created_day DESC);

DROP MATERIALIZED VIEW IF EXISTS public.mv_reporte_radar_semanal_3m CASCADE;
CREATE MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m AS

      WITH unidades_detalle AS (
        SELECT UPPER(TRIM(vumd.cluesimb)) AS cluesimb,
               MAX(vumd.nombre_de_unidad) AS nombre_de_unidad,
               MAX(vumd.nombre_municipio) AS nombre_municipio,
               BOOL_OR(COALESCE(vumd.es_segundo_nivel, false)) AS es_segundo_nivel,
               MAX(vumd.tipo_unidad) AS tipo_unidad,
               STRING_AGG(DISTINCT vumd.alias_sas, ' ') FILTER (WHERE NULLIF(TRIM(vumd.alias_sas), '') IS NOT NULL) AS alias_sas
        FROM public.v_unidad_medica_detalle vumd
        WHERE NULLIF(UPPER(TRIM(vumd.cluesimb)), '') IS NOT NULL
        GROUP BY UPPER(TRIM(vumd.cluesimb))
      ),
      ciclos AS (
        SELECT UPPER(TRIM(s.cluesimb)) AS cluesimb, COUNT(DISTINCT s.id)::int AS ciclos_unidad
        FROM public.solicitud_bitacora s
        WHERE s.created_day BETWEEN CURRENT_DATE - INTERVAL '3 months' AND CURRENT_DATE
        GROUP BY UPPER(TRIM(s.cluesimb))
      ),
      solicitudes_clave AS (
        SELECT s.id AS solicitud_id,
               s.created_day,
               UPPER(TRIM(s.cluesimb)) AS cluesimb,
               UPPER(TRIM(d.clave)) AS clave,
               COALESCE(SUM(d.cantidad), 0)::numeric AS cantidad
        FROM public.solicitud_bitacora s
        JOIN public.solicitud_bitacora_detalle d ON d.solicitud_id = s.id
        WHERE s.created_day BETWEEN CURRENT_DATE - INTERVAL '3 months' AND CURRENT_DATE
          AND NULLIF(UPPER(TRIM(d.clave)), '') IS NOT NULL
        GROUP BY s.id, s.created_day, UPPER(TRIM(s.cluesimb)), UPPER(TRIM(d.clave))
      ),
      demanda AS (
        SELECT sc.cluesimb,
               sc.clave,
               COALESCE(SUM(sc.cantidad), 0)::numeric AS solicitado_periodo,
               (ARRAY_AGG(sc.cantidad ORDER BY sc.created_day DESC, sc.solicitud_id DESC))[1]
                 AS solicitado_ultima_solicitud,
               COUNT(DISTINCT sc.solicitud_id)::int AS ciclos_con_clave,
               COALESCE(SUM(sc.cantidad) FILTER (
                 WHERE sc.created_day BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE
               ), 0)::numeric AS solicitado_vigente,
               COUNT(DISTINCT sc.solicitud_id) FILTER (
                 WHERE sc.created_day BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE
               )::int AS ciclos_vigentes,
               MIN(sc.created_day)::date AS primera_solicitud,
               MAX(sc.created_day)::date AS ultima_solicitud
        FROM solicitudes_clave sc
        GROUP BY sc.cluesimb, sc.clave
      ),
      cpm_ AS (
        SELECT UPPER(TRIM(um.cluesimb)) AS cluesimb,
               UPPER(TRIM(c.clave_cnis)) AS clave,
               COALESCE(MAX(c.cpm), 0)::numeric AS cpm
        FROM public.cpm c
        JOIN public.unidad_medica um ON um.id = c.unidad_medica_id
        WHERE NULLIF(UPPER(TRIM(um.cluesimb)), '') IS NOT NULL
          AND NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL
        GROUP BY UPPER(TRIM(um.cluesimb)), UPPER(TRIM(c.clave_cnis))
      ),
      universo AS (
        SELECT cluesimb, clave FROM demanda
        UNION
        SELECT cluesimb, clave FROM cpm_ WHERE cpm > 0
      ),
      existencias AS (
        SELECT UPPER(TRIM(t.cluesimb)) AS cluesimb,
               UPPER(TRIM(t.clave_cnis)) AS clave,
               COALESCE(SUM(t.existencia), 0)::numeric AS existencia_actual,
               MAX(t.cargado_en) AS snapshot_existencias
        FROM public.tmp_existencias t
        GROUP BY UPPER(TRIM(t.cluesimb)), UPPER(TRIM(t.clave_cnis))
      ),
      existencias_almacenes AS (
        SELECT UPPER(TRIM(t.clave_cnis)) AS clave,
               COALESCE(SUM(t.existencia) FILTER (
                 WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
                   SIMILAR TO '%(MEXICALI|AZM)%'
               ), 0)::numeric AS existencia_azm,
               COALESCE(SUM(t.existencia) FILTER (
                 WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
                   SIMILAR TO '%(TIJUANA|AZT)%'
               ), 0)::numeric AS existencia_azt,
               COALESCE(SUM(t.existencia) FILTER (
                 WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
                   SIMILAR TO '%(ENSENADA|AZE)%'
               ), 0)::numeric AS existencia_aze,
               MAX(t.cargado_en) AS snapshot_almacenes
        FROM public.tmp_existencias t
        JOIN unidades_detalle vumd
          ON UPPER(TRIM(vumd.cluesimb)) = UPPER(TRIM(t.cluesimb))
        WHERE vumd.tipo_unidad = 'ALMACENES'
        GROUP BY UPPER(TRIM(t.clave_cnis))
      ),
      aristas AS (
        SELECT UPPER(TRIM(h.clave)) AS clave,
               UPPER(TRIM(h.sustituto)) AS candidato,
               NULLIF(h.factor::numeric, 0) AS factor
        FROM public.homologos h
        WHERE NULLIF(UPPER(TRIM(h.clave)), '') IS NOT NULL
          AND NULLIF(UPPER(TRIM(h.sustituto)), '') IS NOT NULL
          AND h.factor::numeric > 0
        UNION ALL
        SELECT UPPER(TRIM(h.sustituto)), UPPER(TRIM(h.clave)),
               1 / NULLIF(h.factor::numeric, 0)
        FROM public.homologos h
        WHERE NULLIF(UPPER(TRIM(h.clave)), '') IS NOT NULL
          AND NULLIF(UPPER(TRIM(h.sustituto)), '') IS NOT NULL
          AND h.factor::numeric > 0
      ),
      homologos_stock AS (
        SELECT u.cluesimb, u.clave,
               COUNT(*) FILTER (WHERE COALESCE(e.existencia_actual, 0) > 0)::int AS homologos_disponibles,
               COALESCE(SUM(COALESCE(e.existencia_actual, 0) / a.factor), 0)::numeric AS existencia_homologos_equivalente,
               (ARRAY_AGG(a.candidato ORDER BY COALESCE(e.existencia_actual, 0) / a.factor DESC, a.candidato COLLATE "C" ASC)
                 FILTER (WHERE COALESCE(e.existencia_actual, 0) > 0))[1] AS mejor_homologo
        FROM universo u
        JOIN aristas a ON a.clave = u.clave
        LEFT JOIN existencias e ON e.cluesimb = u.cluesimb AND e.clave = a.candidato
        GROUP BY u.cluesimb, u.clave
      ),
      salidas_posteriores AS (
        SELECT d.cluesimb, d.clave,
               COALESCE(SUM(s.cantidad), 0)::numeric AS piezas_salida_posterior,
               MAX(s.fecha_entregado)::date AS ultima_salida_posterior
        FROM demanda d
        JOIN public.unidad_medica um ON UPPER(TRIM(um.cluesimb)) = d.cluesimb
        JOIN public.salida s ON s.unidad_destino_id = um.id
          AND UPPER(TRIM(s.clave_cnis)) = d.clave
          AND s.fecha_entregado::date >= d.ultima_solicitud
          AND s.fecha_entregado::date <= CURRENT_DATE
        GROUP BY d.cluesimb, d.clave
      ),
      ordenes AS (
        SELECT UPPER(TRIM(um.cluesimb)) AS cluesimb,
               UPPER(TRIM(c.clave_cnis)) AS clave,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
               )::int AS ordenes_pendientes,
               COALESCE(SUM(GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0)), 0)::numeric AS piezas_pendientes,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
                   AND c.fecha_limite_de_entrega BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
               )::int AS ordenes_por_vencer,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
                   AND c.fecha_limite_de_entrega < CURRENT_DATE
               )::int AS ordenes_vencidas,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
               )::int AS recepciones_recientes,
               COALESCE(SUM(c.pzas_recibidas_por_la_entidad) FILTER (
                 WHERE c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
               ), 0)::numeric AS piezas_recibidas_recientes,
               MIN(c.fecha_limite_de_entrega) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
                   AND c.fecha_limite_de_entrega >= CURRENT_DATE
               ) AS proxima_entrega
        FROM public.citas c
        JOIN public.unidad_medica um
          ON UPPER(TRIM(c.clues_destino)) IN (UPPER(TRIM(um.cluesimb)), UPPER(TRIM(um.cluessa)))
        WHERE NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL
          AND (c.fecha_emision >= CURRENT_DATE - INTERVAL '3 months'
            OR c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
            OR (c.fecha_limite_de_entrega >= CURRENT_DATE - INTERVAL '30 days'
              AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0))
        GROUP BY UPPER(TRIM(um.cluesimb)), UPPER(TRIM(c.clave_cnis))
      ),
      base AS (
        SELECT u.cluesimb, vumd.nombre_de_unidad,
               COALESCE(vumd.es_segundo_nivel, false) AS es_segundo_nivel,
               CASE
                 WHEN u.cluesimb = 'BCIMB000133' THEN 'MEXICALI'
                 WHEN UPPER(TRIM(vumd.nombre_municipio)) IN ('TIJUANA', 'TECATE', 'PLAYAS DE ROSARITO') THEN 'TIJUANA'
                 WHEN UPPER(TRIM(vumd.nombre_municipio)) IN ('MEXICALI', 'SAN FELIPE') THEN 'MEXICALI'
                 WHEN UPPER(TRIM(vumd.nombre_municipio)) IN ('ENSENADA', 'SAN QUINTIN', 'SAN QUINTÍN') THEN 'ENSENADA'
                 ELSE UPPER(TRIM(vumd.nombre_municipio))
               END AS jurisdiccion,
               u.clave, a.descripcion,
               COALESCE(c.cpm, 0)::numeric AS cpm,
               (COALESCE(c.cpm, 0) > 0) AS en_cpm,
               COALESCE(e.existencia_actual, 0)::numeric AS existencia_actual,
               e.snapshot_existencias,
               COALESCE(ea.existencia_azm, 0)::numeric AS existencia_azm,
               COALESCE(ea.existencia_azt, 0)::numeric AS existencia_azt,
               COALESCE(ea.existencia_aze, 0)::numeric AS existencia_aze,
               (COALESCE(ea.existencia_azm, 0) + COALESCE(ea.existencia_azt, 0) + COALESCE(ea.existencia_aze, 0))::numeric
                 AS existencia_almacenes,
               ea.snapshot_almacenes,
               CASE WHEN COALESCE(c.cpm, 0) > 0 THEN ROUND(COALESCE(e.existencia_actual, 0) / c.cpm, 2) END AS cobertura_cpm,
               CASE WHEN COALESCE(c.cpm, 0) > 0 THEN ROUND((COALESCE(e.existencia_actual, 0) / c.cpm) * 30, 1) END AS cobertura_dias,
               COALESCE(d.solicitado_periodo, 0)::numeric AS solicitado_periodo,
               COALESCE(d.solicitado_ultima_solicitud, 0)::numeric AS solicitado_ultima_solicitud,
               COALESCE(d.ciclos_con_clave, 0)::int AS ciclos_con_clave,
               COALESCE(ci.ciclos_unidad, 0)::int AS ciclos_unidad,
               CASE WHEN COALESCE(ci.ciclos_unidad, 0) > 0
                    THEN ROUND(d.ciclos_con_clave::numeric / ci.ciclos_unidad, 4) ELSE 0 END AS frecuencia_solicitud,
               d.primera_solicitud, d.ultima_solicitud,
               COALESCE(d.solicitado_vigente, 0)::numeric AS solicitado_vigente,
               COALESCE(d.ciclos_vigentes, 0)::int AS ciclos_vigentes,
               (COALESCE(d.ciclos_vigentes, 0) > 0) AS solicitud_vigente,
               CASE WHEN d.ultima_solicitud IS NOT NULL THEN (CURRENT_DATE - d.ultima_solicitud)::int END AS dias_desde_ultima_solicitud,
               CASE WHEN d.ultima_solicitud IS NOT NULL THEN (d.ultima_solicitud + 14)::date END AS fecha_fin_umbral,
               CASE WHEN d.ultima_solicitud IS NOT NULL THEN GREATEST((d.ultima_solicitud + 14 - CURRENT_DATE)::int, 0) END AS dias_restantes_umbral,
               (COALESCE(sp.piezas_salida_posterior, 0) > 0) AS salida_posterior,
               COALESCE(sp.piezas_salida_posterior, 0)::numeric AS piezas_salida_posterior,
               sp.ultima_salida_posterior,
               COALESCE(hs.homologos_disponibles, 0)::int AS homologos_disponibles,
               ROUND(COALESCE(hs.existencia_homologos_equivalente, 0), 2) AS existencia_homologos_equivalente,
               hs.mejor_homologo,
               COALESCE(o.ordenes_pendientes, 0)::int AS ordenes_pendientes,
               COALESCE(o.piezas_pendientes, 0)::numeric AS piezas_pendientes,
               COALESCE(o.ordenes_por_vencer, 0)::int AS ordenes_por_vencer,
               COALESCE(o.ordenes_vencidas, 0)::int AS ordenes_vencidas,
               COALESCE(o.recepciones_recientes, 0)::int AS recepciones_recientes,
               COALESCE(o.piezas_recibidas_recientes, 0)::numeric AS piezas_recibidas_recientes,
               o.proxima_entrega,
               ROUND(COALESCE(e.existencia_actual, 0) + COALESCE(hs.existencia_homologos_equivalente, 0) + COALESCE(o.piezas_pendientes, 0), 2) AS cobertura_proyectada,
               CASE WHEN COALESCE(c.cpm, 0) > 0 THEN ROUND(
                 (COALESCE(e.existencia_actual, 0) + COALESCE(hs.existencia_homologos_equivalente, 0) + COALESCE(o.piezas_pendientes, 0)) / c.cpm, 2
               ) END AS cobertura_proyectada_cpm
        FROM universo u
        LEFT JOIN demanda d ON d.cluesimb = u.cluesimb AND d.clave = u.clave
        LEFT JOIN ciclos ci ON ci.cluesimb = u.cluesimb
        LEFT JOIN cpm_ c ON c.cluesimb = u.cluesimb AND c.clave = u.clave
        LEFT JOIN existencias e ON e.cluesimb = u.cluesimb AND e.clave = u.clave
        LEFT JOIN existencias_almacenes ea ON ea.clave = u.clave
        LEFT JOIN homologos_stock hs ON hs.cluesimb = u.cluesimb AND hs.clave = u.clave
        LEFT JOIN salidas_posteriores sp ON sp.cluesimb = u.cluesimb AND sp.clave = u.clave
        LEFT JOIN ordenes o ON o.cluesimb = u.cluesimb AND o.clave = u.clave
        LEFT JOIN unidades_detalle vumd ON vumd.cluesimb = u.cluesimb
        LEFT JOIN public.articulos a ON UPPER(TRIM(a.clave)) = u.clave
      ),
      clasificado AS (
        SELECT b.*,
          CASE
            WHEN b.solicitud_vigente AND b.salida_posterior THEN 'VIGENTE_CON_SALIDA'
            WHEN b.solicitud_vigente THEN 'VIGENTE_EN_PROCESO'
            WHEN b.ultima_solicitud IS NOT NULL AND b.salida_posterior THEN 'HISTORICA_CON_SALIDA'
            WHEN b.ultima_solicitud IS NOT NULL THEN 'FUERA_UMBRAL_SIN_SALIDA'
            ELSE 'SIN_SOLICITUD_OBSERVADA'
          END AS estado_operativo,
          CASE
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0
              AND b.existencia_actual + b.existencia_homologos_equivalente >= b.cpm THEN 'CUBIERTA'
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0
              AND (b.existencia_actual <= 0 OR b.frecuencia_solicitud >= .5) THEN 'CRITICA_CPM'
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0 THEN 'ATENCION_CPM'
            WHEN b.cpm <= 0 AND b.solicitado_periodo > 0 AND b.existencia_actual <= 0 THEN 'DEMANDA_SIN_CPM'
            WHEN b.cpm > 0 AND b.solicitado_periodo <= 0 THEN 'CPM_SIN_SOLICITUD'
            WHEN b.cpm > 0 AND b.existencia_actual >= b.cpm THEN 'CUBIERTA'
            ELSE 'OBSERVAR'
          END AS segmento,
          CASE
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0 AND (b.existencia_actual <= 0 OR b.frecuencia_solicitud >= .5) THEN 100
            WHEN b.cpm <= 0 AND b.solicitado_periodo > 0 AND b.existencia_actual <= 0 THEN 90
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0 THEN 75
            WHEN b.cpm > 0 AND b.solicitado_periodo <= 0 THEN 45
            ELSE 20
          END::int AS prioridad
        FROM base b
      ),
      final AS (
        SELECT c.*,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN c.cpm > 0 AND c.existencia_actual < c.cpm THEN 'Existencia menor a un CPM' END,
            CASE WHEN c.cpm <= 0 AND c.solicitado_periodo > 0 THEN 'Demanda observada sin CPM' END,
            CASE WHEN c.cpm > 0 AND c.solicitado_periodo <= 0 THEN 'Sin solicitud observada en el periodo' END,
            CASE WHEN c.frecuencia_solicitud >= .5 THEN 'Solicitada en al menos la mitad de los ciclos' END,
            CASE WHEN c.existencia_actual <= 0 THEN 'Sin existencia en el snapshot actual' END,
            CASE WHEN c.homologos_disponibles > 0 THEN 'Cuenta con alternativas con existencia local' END,
            CASE WHEN c.ordenes_pendientes > 0 THEN 'Cuenta con orden de suministro pendiente para la unidad' END,
            CASE WHEN c.ordenes_por_vencer > 0 THEN 'Tiene órdenes con entrega prevista en los próximos 30 días' END,
            CASE WHEN c.ordenes_vencidas > 0 THEN 'Tiene órdenes vencidas con saldo pendiente' END,
            CASE WHEN c.recepciones_recientes > 0 THEN 'Registra recepciones durante los últimos 30 días' END,
            CASE WHEN c.solicitud_vigente THEN 'Solicitud dentro del umbral operativo de 14 días' END,
            CASE WHEN c.estado_operativo = 'FUERA_UMBRAL_SIN_SALIDA' THEN 'Solicitud fuera del umbral sin salida posterior observada' END,
            CASE WHEN c.salida_posterior THEN 'Registra salida posterior a la última solicitud' END
          ], NULL)::text[] AS razones
        FROM clasificado c
      )
      SELECT * FROM final;
    
CREATE INDEX idx_mv_reporte_radar_semanal_3m_par
  ON public.mv_reporte_radar_semanal_3m (cluesimb, clave);
CREATE INDEX idx_mv_reporte_radar_semanal_3m_orden
  ON public.mv_reporte_radar_semanal_3m (prioridad DESC, frecuencia_solicitud DESC, solicitado_periodo DESC);

DROP MATERIALIZED VIEW IF EXISTS public.mv_reporte_radar_semanal_3m_unidades_sin_solicitud;
CREATE MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m_unidades_sin_solicitud AS
WITH unidades_detalle AS (
  SELECT vumd.id,
         MAX(vumd.nombre_municipio) AS nombre_municipio,
         BOOL_OR(COALESCE(vumd.es_segundo_nivel, false)) AS es_segundo_nivel,
         MAX(vumd.tipo_unidad) AS tipo_unidad
  FROM public.v_unidad_medica_detalle vumd
  GROUP BY vumd.id
),
solicitudes AS (
  SELECT UPPER(TRIM(s.cluesimb)) AS cluesimb,
         MAX(s.created_day)::date AS ultima_solicitud_registrada,
         BOOL_OR(s.created_day BETWEEN CURRENT_DATE - INTERVAL '3 months' AND CURRENT_DATE) AS solicito_en_periodo
  FROM public.solicitud_bitacora s
  WHERE NULLIF(UPPER(TRIM(s.cluesimb)), '') IS NOT NULL
  GROUP BY UPPER(TRIM(s.cluesimb))
)
SELECT UPPER(TRIM(um.cluesimb)) AS cluesimb,
       um.nombre AS nombre_de_unidad,
       CASE
         WHEN UPPER(TRIM(um.cluesimb)) = 'BCIMB000133' THEN 'MEXICALI'
         WHEN UPPER(TRIM(ud.nombre_municipio)) IN ('TIJUANA', 'TECATE', 'PLAYAS DE ROSARITO') THEN 'TIJUANA'
         WHEN UPPER(TRIM(ud.nombre_municipio)) IN ('MEXICALI', 'SAN FELIPE') THEN 'MEXICALI'
         WHEN UPPER(TRIM(ud.nombre_municipio)) IN ('ENSENADA', 'SAN QUINTIN', 'SAN QUINTÍN') THEN 'ENSENADA'
         ELSE UPPER(TRIM(ud.nombre_municipio))
       END AS jurisdiccion,
       COALESCE(ud.es_segundo_nivel, false) AS es_segundo_nivel,
       ud.tipo_unidad,
       s.ultima_solicitud_registrada
FROM public.unidad_medica um
LEFT JOIN unidades_detalle ud ON ud.id = um.id
LEFT JOIN solicitudes s ON s.cluesimb = UPPER(TRIM(um.cluesimb))
WHERE um.activo = true
  AND NULLIF(UPPER(TRIM(um.cluesimb)), '') IS NOT NULL
  AND COALESCE(UPPER(TRIM(ud.tipo_unidad)), '') <> 'ALMACENES'
  AND COALESCE(s.solicito_en_periodo, false) = false;
CREATE UNIQUE INDEX idx_mv_reporte_radar_semanal_3m_unidades_sin_solicitud_clues
  ON public.mv_reporte_radar_semanal_3m_unidades_sin_solicitud (cluesimb);

DROP MATERIALIZED VIEW IF EXISTS public.mv_reporte_radar_semanal_3m_salidas;
CREATE MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m_salidas AS
SELECT r.cluesimb, r.clave, r.ultima_solicitud,
       s.id, s.fecha_entregado::text AS fecha_entregado, s.folio, s.folio_extra,
       COALESCE(s.cantidad, 0)::numeric AS cantidad, s.tipo, s.programa,
       COALESCE(origen.nombre, s.unidad_origen_texto) AS unidad_origen,
       COALESCE(destino.nombre, s.unidad_destino_texto) AS unidad_destino
FROM public.mv_reporte_radar_semanal_3m r
JOIN public.unidad_medica destino ON UPPER(TRIM(destino.cluesimb)) = r.cluesimb
JOIN public.salida s
  ON s.unidad_destino_id = destino.id
 AND UPPER(TRIM(s.clave_cnis)) = r.clave
 AND s.fecha_entregado::date BETWEEN r.ultima_solicitud AND CURRENT_DATE
LEFT JOIN public.unidad_medica origen ON origen.id = s.unidad_origen_id
WHERE r.ultima_solicitud IS NOT NULL
  AND (r.salida_posterior OR r.ordenes_pendientes > 0 OR r.recepciones_recientes > 0);
CREATE INDEX idx_mv_reporte_radar_semanal_3m_salidas_par
  ON public.mv_reporte_radar_semanal_3m_salidas (cluesimb, clave, fecha_entregado DESC);

DROP MATERIALIZED VIEW IF EXISTS public.mv_reporte_radar_semanal_3m_ordenes;
CREATE MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m_ordenes AS
SELECT r.cluesimb, r.clave, c.orden_de_suministro, c.proveedor,
       c.fecha_emision::text AS fecha_emision,
       c.fecha_limite_de_entrega::text AS fecha_limite_de_entrega,
       c.fecha_recepcion_max::text AS fecha_recepcion,
       COALESCE(c.no_de_piezas_emitidas, 0)::numeric AS piezas_emitidas,
       COALESCE(c.pzas_recibidas_por_la_entidad, 0)::numeric AS piezas_recibidas,
       GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0)::numeric AS piezas_pendientes,
       CASE
         WHEN GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) <= 0
           AND c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days' THEN 'CUMPLIDA_RECIENTE'
         WHEN c.fecha_limite_de_entrega < CURRENT_DATE
           AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0 THEN 'VENCIDA'
         WHEN c.fecha_limite_de_entrega BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
           AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0 THEN 'POR_VENCER'
         ELSE 'PENDIENTE'
       END AS estado_radar
FROM public.mv_reporte_radar_semanal_3m r
JOIN public.unidad_medica um ON UPPER(TRIM(um.cluesimb)) = r.cluesimb
JOIN public.citas c
  ON UPPER(TRIM(c.clues_destino)) IN (UPPER(TRIM(um.cluesimb)), UPPER(TRIM(um.cluessa)))
 AND UPPER(TRIM(c.clave_cnis)) = r.clave
WHERE (r.salida_posterior OR r.ordenes_pendientes > 0 OR r.recepciones_recientes > 0)
  AND (c.fecha_emision >= CURRENT_DATE - INTERVAL '3 months'
    OR c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
    OR (c.fecha_limite_de_entrega >= CURRENT_DATE - INTERVAL '30 days'
      AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0));
CREATE INDEX idx_mv_reporte_radar_semanal_3m_ordenes_par
  ON public.mv_reporte_radar_semanal_3m_ordenes (cluesimb, clave, fecha_limite_de_entrega DESC);

CREATE OR REPLACE PROCEDURE public.refrescar_reporte_radar_semanal_3m()
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m;
  REFRESH MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m_unidades_sin_solicitud;
  REFRESH MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m_salidas;
  REFRESH MATERIALIZED VIEW public.mv_reporte_radar_semanal_3m_ordenes;
  ANALYZE public.mv_reporte_radar_semanal_3m;
  ANALYZE public.mv_reporte_radar_semanal_3m_unidades_sin_solicitud;
  ANALYZE public.mv_reporte_radar_semanal_3m_salidas;
  ANALYZE public.mv_reporte_radar_semanal_3m_ordenes;
END;
$$;

COMMIT;

-- Ejecutar antes del envío semanal, fuera de la petición HTTP:
-- CALL public.refrescar_reporte_radar_semanal_3m();
