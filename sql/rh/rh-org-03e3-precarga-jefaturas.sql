-- RH-ORG-03E3 | Precarga manual de 52 jefaturas de Coordinación Estatal
--
-- Ejecutar el archivo completo en DEV, en una sesión nueva y con un cliente
-- que se detenga al primer error. La cuenta de BD necesita permisos para
-- consultar/bloquear las fuentes y registrar las relaciones y la auditoría.
--
-- Sustituir únicamente NULL::uuid en v_operador por el ID institucional
-- ('uuid-real'::uuid) del operador autorizado responsable de la carga.
-- Verificar personalmente la identidad del operador antes de ejecutar.
--
-- Primera prueba: sustituir COMMIT; de la última línea por ROLLBACK;.
-- Comparar los 52 pares resultantes con la vista previa revisada por RH.
-- Solo después de revisar la prueba, restaurar COMMIT; y volver a ejecutar
-- el archivo completo en una ventana sin ediciones de los datos fuente.
--
-- Este archivo no crea tablas permanentes. No ejecutar una parte aislada.

BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '3s';

DO $precarga$
DECLARE
    v_operador constant uuid :=  '3ff55867-0395-48df-8404-9a03ea562df9';
    v_motivo constant text :=
        'Precarga inicial de jefaturas directas validada por RH desde estructura organizacional vigente de Coordinación Estatal';
    v_versiones bigint;
    v_version_id integer;
    v_puestos bigint;
    v_candidatas bigint;
    v_invalidas bigint;
BEGIN
    IF v_operador IS NULL THEN
        RAISE EXCEPTION 'Indique el UUID institucional del operador RH GLOBAL en v_operador';
    END IF;

    -- Mismo bloqueo que RH-ORG-03C. Impide que el PATCH cambie supervisiones
    -- de la unidad mientras se valida y escribe el lote.
    PERFORM id
      FROM public.unidad_medica
     WHERE id = 177 AND activo IS TRUE
       FOR NO KEY UPDATE NOWAIT;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La unidad 177 no existe o está inactiva';
    END IF;

    -- Los editores de organigrama y adscripciones bloquean sus propias filas.
    -- Un bloqueo por filas no evitaría insertar ocupaciones o adscripciones
    -- nuevas. SHARE impide escrituras sobre todas las fuentes del diagnóstico.
    -- NOWAIT evita esperar por escritores que ya tengan otro bloqueo.
    LOCK TABLE public.rh_org_version, public.rh_org_puesto,
               public.rh_org_ocupacion, public.rh_adscripcion_laboral,
               public.persona, public.app_users, public.app_user_roles,
               public.app_roles IN SHARE MODE NOWAIT;

    -- También excluye escritores directos que no tomen el bloqueo de unidad.
    LOCK TABLE public.rh_supervision_directa IN SHARE ROW EXCLUSIVE MODE NOWAIT;

    IF NOT EXISTS (
        SELECT 1
          FROM public.app_users u
          JOIN public.app_user_roles ur ON ur.user_id = u.id
          JOIN public.app_roles r ON r.id = ur.role_id
         WHERE u.id = v_operador
           AND u.status = 'ACTIVE'
           AND upper(btrim(r.code)) = 'RECURSOS_HUMANOS'
           AND upper(btrim(ur.scope_type::text)) = 'GLOBAL'
           AND COALESCE(btrim(ur.scope_id::text), '') IN ('', '*')
    ) THEN
        RAISE EXCEPTION 'El operador indicado no tiene una cuenta activa con RECURSOS_HUMANOS GLOBAL';
    END IF;

    SELECT count(*), min(id)
      INTO v_versiones, v_version_id
      FROM public.rh_org_version
     WHERE unidad_medica_id = 177 AND activo IS TRUE AND estado = 'VIGENTE';
    IF v_versiones <> 1 OR v_version_id IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Se esperaba únicamente la versión 1 vigente de la unidad 177; versiones %, id %',
            v_versiones, v_version_id;
    END IF;

    SELECT count(*) INTO v_puestos
      FROM public.rh_org_puesto
     WHERE version_id = v_version_id;
    IF v_puestos <> 62 THEN
        RAISE EXCEPTION 'Se esperaban 62 puestos; se encontraron %', v_puestos;
    END IF;

    CREATE TEMP TABLE rh_03e3_candidatas ON COMMIT DROP AS
    SELECT hijo.id AS puesto_subordinado_id, padre.id AS puesto_superior_id,
           oh.persona_id AS persona_supervisada_id,
           op.persona_id AS persona_supervisora_id
      FROM public.rh_org_puesto hijo
      JOIN public.rh_org_puesto padre
        ON padre.id = hijo.puesto_padre_id AND padre.version_id = hijo.version_id
      JOIN public.rh_org_ocupacion oh ON oh.puesto_id = hijo.id AND oh.estado = 'OCUPADO'
      JOIN public.rh_org_ocupacion op ON op.puesto_id = padre.id AND op.estado = 'OCUPADO'
     WHERE hijo.version_id = v_version_id AND hijo.activo IS TRUE AND padre.activo IS TRUE;

    SELECT count(*) INTO v_candidatas FROM pg_temp.rh_03e3_candidatas;
    IF v_candidatas <> 52 OR v_puestos - v_candidatas <> 10 THEN
        RAISE EXCEPTION 'Se esperaban 52 candidatas y 10 puestos excluidos; encontrados % y %',
            v_candidatas, v_puestos - v_candidatas;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_temp.rh_03e3_candidatas
         WHERE persona_supervisada_id IS NULL OR persona_supervisora_id IS NULL
            OR persona_supervisada_id = persona_supervisora_id
    ) THEN
        RAISE EXCEPTION 'El lote contiene una ocupación sin persona o una autorreferencia';
    END IF;

    IF EXISTS (
        SELECT persona_supervisada_id FROM pg_temp.rh_03e3_candidatas
         GROUP BY persona_supervisada_id HAVING count(*) > 1
    ) OR EXISTS (
        SELECT c.persona_supervisada_id
          FROM pg_temp.rh_03e3_candidatas c
          JOIN public.rh_org_ocupacion o ON o.persona_id = c.persona_supervisada_id
               AND o.estado = 'OCUPADO'
          JOIN public.rh_org_puesto p ON p.id = o.puesto_id
               AND p.version_id = v_version_id AND p.activo IS TRUE
         GROUP BY c.persona_supervisada_id HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'El lote contiene trabajadores repetidos o con varios puestos activos ocupados';
    END IF;

    WITH participantes AS (
        SELECT persona_supervisada_id AS id FROM pg_temp.rh_03e3_candidatas
        UNION
        SELECT persona_supervisora_id FROM pg_temp.rh_03e3_candidatas
    )
    SELECT count(*) INTO v_invalidas
      FROM participantes x
      LEFT JOIN public.persona p ON p.id = x.id
     WHERE p.activo IS NOT TRUE
        OR (SELECT count(*)
              FROM public.rh_adscripcion_laboral a
             WHERE a.persona_id = x.id AND a.unidad_medica_id = 177
               AND a.activo IS TRUE AND a.vigente_desde <= CURRENT_DATE
               AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= CURRENT_DATE)) <> 1;
    IF v_invalidas <> 0 THEN
        RAISE EXCEPTION 'Hay % participantes inexistentes, inactivos o sin una adscripción vigente única en 177', v_invalidas;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.rh_supervision_directa s
          JOIN pg_temp.rh_03e3_candidatas c ON c.persona_supervisada_id = s.persona_supervisada_id
         WHERE s.unidad_medica_id = 177
    ) THEN
        RAISE EXCEPTION 'Ya existe una decisión de supervisión en el lote. Se cancela sin sobrescribir';
    END IF;

    -- Se evalúa el grafo combinado. Una cadena que repita un nodo se marca
    -- como cíclica y deja de expandirse. NULL termina la cadena.
    IF EXISTS (
        WITH RECURSIVE grafo (persona_id, supervisor_id) AS (
            SELECT persona_supervisada_id, persona_supervisora_id
              FROM public.rh_supervision_directa
             WHERE unidad_medica_id = 177 AND persona_supervisora_id IS NOT NULL
            UNION ALL
            SELECT persona_supervisada_id, persona_supervisora_id FROM pg_temp.rh_03e3_candidatas
        ), cadena (nodo, camino, ciclo) AS (
            SELECT g.supervisor_id, ARRAY[g.persona_id, g.supervisor_id],
                   g.supervisor_id = g.persona_id
              FROM grafo g
            UNION ALL
            SELECT g.supervisor_id, array_append(c.camino, g.supervisor_id),
                   g.supervisor_id = ANY(c.camino)
              FROM cadena c JOIN grafo g ON g.persona_id = c.nodo
             WHERE NOT c.ciclo
        )
        SELECT 1 FROM cadena WHERE ciclo
    ) THEN
        RAISE EXCEPTION 'El grafo de la unidad 177 contiene un ciclo con las relaciones actuales y propuestas';
    END IF;

    CREATE TEMP TABLE rh_03e3_resultado ON COMMIT DROP AS
    SELECT s.unidad_medica_id, s.persona_supervisada_id, s.persona_supervisora_id,
           s.motivo, s.actualizado_por, s.actualizado_en, e.id AS auditoria_id, e.payload
      FROM public.rh_supervision_directa s
      CROSS JOIN public.app_audit_logs e
     WHERE FALSE;

    WITH altas AS (
        INSERT INTO public.rh_supervision_directa (
            unidad_medica_id, persona_supervisada_id, persona_supervisora_id,
            motivo, actualizado_por, actualizado_en
        )
        SELECT 177, c.persona_supervisada_id, c.persona_supervisora_id,
               v_motivo, v_operador, clock_timestamp()
          FROM pg_temp.rh_03e3_candidatas c
        RETURNING unidad_medica_id, persona_supervisada_id, persona_supervisora_id,
                  motivo, actualizado_por, actualizado_en
    ), eventos AS (
        INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
        SELECT a.actualizado_por, 'RH_ORG_UPDATE_SUPERVISION_DIRECTA', 'rh_supervision_directa',
               NULL, 'manual-sql:rh-org-03e3-precarga-jefaturas.sql',
               jsonb_build_object(
                   'unidad_medica_id', a.unidad_medica_id,
                   'persona_supervisada_id', a.persona_supervisada_id,
                   'relacion_anterior_existia', FALSE,
                   'supervisor_anterior_id', NULL::integer,
                   'supervisor_nuevo_id', a.persona_supervisora_id,
                   'motivo', a.motivo,
                   'actualizado_en', to_char(a.actualizado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
               )
          FROM altas a
        RETURNING id AS auditoria_id, payload
    )
    INSERT INTO pg_temp.rh_03e3_resultado (
        unidad_medica_id, persona_supervisada_id, persona_supervisora_id,
        motivo, actualizado_por, actualizado_en, auditoria_id, payload
    )
    SELECT a.unidad_medica_id, a.persona_supervisada_id, a.persona_supervisora_id,
           a.motivo, a.actualizado_por, a.actualizado_en, e.auditoria_id, e.payload
      FROM altas a
      JOIN eventos e ON (e.payload->>'persona_supervisada_id')::integer = a.persona_supervisada_id;

    IF (SELECT count(*) FROM pg_temp.rh_03e3_resultado) <> 52
       OR (SELECT count(DISTINCT auditoria_id) FROM pg_temp.rh_03e3_resultado) <> 52
       OR EXISTS (
           SELECT 1 FROM pg_temp.rh_03e3_candidatas c
           LEFT JOIN pg_temp.rh_03e3_resultado r ON r.persona_supervisada_id = c.persona_supervisada_id
           LEFT JOIN public.rh_supervision_directa s ON s.unidad_medica_id = 177
                     AND s.persona_supervisada_id = c.persona_supervisada_id
           LEFT JOIN public.app_audit_logs e ON e.id = r.auditoria_id
           WHERE r.unidad_medica_id IS DISTINCT FROM 177
              OR r.persona_supervisora_id IS DISTINCT FROM c.persona_supervisora_id
              OR r.actualizado_por IS DISTINCT FROM v_operador
              OR r.motivo IS DISTINCT FROM v_motivo
              OR s.persona_supervisora_id IS DISTINCT FROM c.persona_supervisora_id
              OR s.actualizado_en IS DISTINCT FROM r.actualizado_en
              OR s.actualizado_por IS DISTINCT FROM v_operador
              OR s.motivo IS DISTINCT FROM v_motivo
              OR e.user_id IS DISTINCT FROM v_operador
              OR e.action IS DISTINCT FROM 'RH_ORG_UPDATE_SUPERVISION_DIRECTA'
              OR e.resource IS DISTINCT FROM 'rh_supervision_directa'
              OR e.payload IS DISTINCT FROM r.payload
       ) THEN
        RAISE EXCEPTION 'La verificación no confirmó las 52 supervisiones y sus 52 eventos; se revierte el lote';
    END IF;
END;
$precarga$;

-- Verificación dentro de la transacción. El resultado debe mostrar 52 filas.
SELECT count(*) OVER () AS total_verificado,
       r.unidad_medica_id, c.puesto_subordinado_id, r.persona_supervisada_id,
       c.puesto_superior_id, r.persona_supervisora_id, r.actualizado_en,
       r.actualizado_por, r.auditoria_id
  FROM pg_temp.rh_03e3_resultado r
  JOIN pg_temp.rh_03e3_candidatas c USING (persona_supervisada_id)
 ORDER BY c.puesto_subordinado_id;

COMMIT;
 