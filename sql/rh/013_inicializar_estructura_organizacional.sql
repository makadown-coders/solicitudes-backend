-- =============================================================================
-- PROYECTO RH | RH-ORG-03
-- Inicialización idempotente de la estructura organizacional única y mantenible
-- de Coordinación Estatal de IMSS-Bienestar Baja California.
--
-- ADVERTENCIA:
--   - NO ejecutar automáticamente. Revisar y ejecutar manualmente por el responsable.
--   - Estructura única operativa (clave: 'ORG-COORDINACION-ESTATAL'), sin versiones anuales.
--   - NO importa nombres de personas ni identificadores personales.
--   - NO utiliza los IDs del Excel como IDs internos.
--   - Idempotente: no duplica ni sobrescribe puestos ya existentes.
-- =============================================================================

BEGIN;

-- 1. Crear (si no existe) la estructura organizacional única de Coordinación Estatal
--    Nota: anio_referencia = 2026 es un atributo técnico heredado de SQL 012,
--    no representa versionado anual.
INSERT INTO public.rh_org_version (
  clave,
  nombre,
  descripcion,
  anio_referencia,
  unidad_medica_id,
  estado,
  activo
)
VALUES (
  'ORG-COORDINACION-ESTATAL',
  'Estructura organizacional de Coordinación Estatal',
  'Catálogo organizacional institucional único y mantenible de Coordinación Estatal de IMSS-Bienestar Baja California.',
  2026,
  177,
  'VIGENTE',
  TRUE
)
ON CONFLICT (clave) DO NOTHING;

-- 2. Inicializar puestos estructurales (Nivel 1 -> Nivel 2 -> Nivel 3 -> Nivel 4)
--    de forma idempotente y sin sobrescribir registros existentes.
DO $$
DECLARE
  v_ver_id    integer;
  v_root_id   integer;
  v_sas_id    integer;
  v_saf_id    integer;
  v_sj_id     integer;
  v_ac_id     integer;
  v_pe_id     integer;
  v_dept_id   integer;

  -- Helper interno para insertar un puesto si no existe bajo (version_id, puesto_padre_id, denominacion)
  -- y devolver su ID real.
BEGIN
  SELECT id INTO v_ver_id
    FROM public.rh_org_version
   WHERE clave = 'ORG-COORDINACION-ESTATAL'
   LIMIT 1;

  IF v_ver_id IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: No se encontró la estructura ORG-COORDINACION-ESTATAL.';
  END IF;

  -- ===========================================================================
  -- NIVEL 1 (Raíz única)
  -- ===========================================================================
  SELECT id INTO v_root_id
    FROM public.rh_org_puesto
   WHERE version_id = v_ver_id AND puesto_padre_id IS NULL
   LIMIT 1;

  IF v_root_id IS NULL THEN
    INSERT INTO public.rh_org_puesto (
      version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual
    )
    VALUES (
      v_ver_id, NULL, 'Coordinador Estatal IMSS-Bienestar', 'K11', 1, 'UPECE', 1
    )
    RETURNING id INTO v_root_id;
  END IF;

  -- ===========================================================================
  -- NIVEL 2 (5 dependencias directas de Coordinación Estatal)
  -- ===========================================================================
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_root_id, x.denom, x.cod, 2, x.siglas, x.ord
  FROM (VALUES
    ('Jefe de Servicios de Atención a la Salud', 'M11', 'SAS', 1),
    ('Jefe de Servicios Administrativos y Finanzas', 'M11', 'SAF', 2),
    ('Jefe de Servicios Jurídicos', 'M11', 'SJ', 3),
    ('Departamento de Acción Comunitaria', 'CF80003', 'AC', 4),
    ('Departamento de Planeación Estratégica', 'CF80003', 'PE', 5)
  ) AS x(denom, cod, siglas, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rh_org_puesto p
     WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_root_id AND p.denominacion = x.denom
  );

  SELECT id INTO v_sas_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_root_id AND denominacion = 'Jefe de Servicios de Atención a la Salud' LIMIT 1;
  SELECT id INTO v_saf_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_root_id AND denominacion = 'Jefe de Servicios Administrativos y Finanzas' LIMIT 1;
  SELECT id INTO v_sj_id  FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_root_id AND denominacion = 'Jefe de Servicios Jurídicos' LIMIT 1;
  SELECT id INTO v_ac_id  FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_root_id AND denominacion = 'Departamento de Acción Comunitaria' LIMIT 1;
  SELECT id INTO v_pe_id  FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_root_id AND denominacion = 'Departamento de Planeación Estratégica' LIMIT 1;

  -- ===========================================================================
  -- NIVEL 3: Departamentos hermanos bajo SAS (6)
  -- ===========================================================================
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_sas_id, x.denom, 'CF81010', 3, 'SAS', x.ord
  FROM (VALUES
    ('Departamento de Atención Médica', 1),
    ('Departamento de Supervisión y Desarrollo en Salud', 2),
    ('Departamento de Epidemiología', 3),
    ('Departamento de Enfermería', 4),
    ('Departamento de Programas Preventivos', 5),
    ('Departamento de Educación e Investigación', 6)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rh_org_puesto p
     WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_sas_id AND p.denominacion = x.denom
  );

  -- NIVEL 4: Oficinas hermanas bajo cada Departamento de SAS (18)
  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sas_id AND denominacion = 'Departamento de Atención Médica' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF81015', 4, 'SAS', x.ord
  FROM (VALUES
    ('Oficina de Atención Médica de Primer Nivel', 1),
    ('Oficina de Atención Médica de Segundo Nivel', 2),
    ('Oficina de Atención Médica Especializada', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sas_id AND denominacion = 'Departamento de Supervisión y Desarrollo en Salud' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF81015', 4, 'SAS', x.ord
  FROM (VALUES
    ('Oficina de Supervisión', 1),
    ('Oficina de Gestión en Salud', 2),
    ('Oficina de Proyectos en Salud', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sas_id AND denominacion = 'Departamento de Epidemiología' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF81015', 4, 'SAS', x.ord
  FROM (VALUES
    ('Oficina de Promoción y Protección a la Salud', 1),
    ('Oficina de Vigilancia Epidemiológica', 2),
    ('Oficina de Prevención y Control de Enfermedades', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sas_id AND denominacion = 'Departamento de Enfermería' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF81015', 4, 'SAS', x.ord
  FROM (VALUES
    ('Oficina de Procesos Técnicos e Integrales de Enfermería Primer Nivel', 1),
    ('Oficina de Procesos Técnicos e Integrales de Enfermería Segundo Nivel', 2),
    ('Oficina de Enfermería Avanzada', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sas_id AND denominacion = 'Departamento de Programas Preventivos' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF81015', 4, 'SAS', x.ord
  FROM (VALUES
    ('Oficina de Salud Reproductiva y Neonatal', 1),
    ('Oficina de Salud de la Infancia y Adolescencia', 2),
    ('Oficina de Salud Mental y Grupos Vulnerables', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sas_id AND denominacion = 'Departamento de Educación e Investigación' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, x.cod, 4, 'SAS', x.ord
  FROM (VALUES
    ('Oficina de Educación en Salud', 'CF81015', 1),
    ('Oficina de Investigación en Salud', 'CF81015', 2),
    ('Oficina de Calidad y Certificación Médica', 'CF81015', 3)
  ) AS x(denom, cod, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  -- ===========================================================================
  -- NIVEL 3: Departamentos hermanos bajo SAF (6)
  -- ===========================================================================
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_saf_id, x.denom, 'CF80003', 3, 'SAF', x.ord
  FROM (VALUES
    ('Departamento de Personal', 1),
    ('Departamento de Finanzas', 2),
    ('Departamento Administrativo', 3),
    ('Departamento de Control de Abasto', 4),
    ('Departamento de Tecnologías de la Información', 5),
    ('Departamento de Conservación', 6)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rh_org_puesto p
     WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_saf_id AND p.denominacion = x.denom
  );

  -- NIVEL 4: Oficinas hermanas bajo cada Departamento de SAF (16)
  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_saf_id AND denominacion = 'Departamento de Personal' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, x.cod, 4, 'SAF', x.ord
  FROM (VALUES
    ('Oficina de Fuerza de Trabajo', 'CF80010', 1),
    ('Oficina de Presupuesto de Servicios Personales', 'CF80010', 2),
    ('Oficina de Reclutamiento y Selección', 'CF80010', 3),
    ('Oficina de Relaciones Laborales', 'CF80010', 4),
    ('Oficina de Nómina', 'CFO2100001', 5)
  ) AS x(denom, cod, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_saf_id AND denominacion = 'Departamento de Finanzas' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF80010', 4, 'SAF', x.ord
  FROM (VALUES
    ('Oficina de Programación y Presupuesto', 1),
    ('Oficina de Contabilidad e Información Programática', 2),
    ('Oficina de Trámite de Erogaciones', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_saf_id AND denominacion = 'Departamento Administrativo' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF80010', 4, 'SAF', x.ord
  FROM (VALUES
    ('Oficina de Recursos Materiales y Servicios Generales', 1),
    ('Oficina de Supervisión', 2)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_saf_id AND denominacion = 'Departamento de Control de Abasto' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF80010', 4, 'SAF', x.ord
  FROM (VALUES
    ('Oficina de Insumos', 1),
    ('Oficina de Logística', 2)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_saf_id AND denominacion = 'Departamento de Tecnologías de la Información' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF80010', 4, 'SAF', x.ord
  FROM (VALUES
    ('Oficina de Administración de Sistemas de Información', 1),
    ('Oficina de Infraestructura Tecnológica', 2)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_saf_id AND denominacion = 'Departamento de Conservación' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, x.denom, 'CF80010', 4, 'SAF', x.ord
  FROM (VALUES
    ('Oficina de Conservación y Mantenimiento de Infraestructura', 1),
    ('Oficina de Seguridad y Protección Ambiental', 2)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = x.denom);

  -- ===========================================================================
  -- NIVEL 3: Departamentos hermanos bajo SJ (3) + NIVEL 4: Oficinas (2)
  -- ===========================================================================
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_sj_id, x.denom, 'CF80003', 3, 'SJ', x.ord
  FROM (VALUES
    ('Departamento de Regularización Inmobiliaria', 1),
    ('Departamento de lo Contencioso', 2),
    ('Departamento de Gestiones Administrativas y Licencias Sanitarias', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.rh_org_puesto p
     WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_sj_id AND p.denominacion = x.denom
  );

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sj_id AND denominacion = 'Departamento de Regularización Inmobiliaria' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, 'Oficina de Regularización Inmobiliaria', 'CF80010', 4, 'SJ', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = 'Oficina de Regularización Inmobiliaria');

  SELECT id INTO v_dept_id FROM public.rh_org_puesto WHERE version_id = v_ver_id AND puesto_padre_id = v_sj_id AND denominacion = 'Departamento de lo Contencioso' LIMIT 1;
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_dept_id, 'Oficina de lo Contencioso "A"', 'CF80010', 4, 'SJ', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_dept_id AND p.denominacion = 'Oficina de lo Contencioso "A"');

  -- ===========================================================================
  -- NIVEL 3: Oficinas hermanas bajo Departamento de Acción Comunitaria (Nivel 2) (3)
  -- ===========================================================================
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_ac_id, x.denom, 'CF80010', 3, 'AC', x.ord
  FROM (VALUES
    ('Oficina de Organización Comunitaria', 1),
    ('Oficina de Promoción de la Salud Comunitaria y Contraloría Social', 2),
    ('Supervisión de Acción Comunitaria', 3)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_ac_id AND p.denominacion = x.denom);

  -- ===========================================================================
  -- NIVEL 3: Oficinas hermanas bajo Departamento de Planeación Estratégica (Nivel 2) (2)
  -- ===========================================================================
  INSERT INTO public.rh_org_puesto (version_id, puesto_padre_id, denominacion, codigo_nivel, nivel_jerarquico, siglas_area, orden_visual)
  SELECT v_ver_id, v_pe_id, x.denom, 'CF80010', 3, 'PE', x.ord
  FROM (VALUES
    ('Oficina de Registro de Información en Salud', 1),
    ('Oficina de Padrón de Beneficiarios', 2)
  ) AS x(denom, ord)
  WHERE NOT EXISTS (SELECT 1 FROM public.rh_org_puesto p WHERE p.version_id = v_ver_id AND p.puesto_padre_id = v_pe_id AND p.denominacion = x.denom);
END $$;

COMMIT;


-- =============================================================================
-- CONSULTAS DE VERIFICACIÓN POST-EJECUCIÓN (SOLO LECTURA)
-- =============================================================================

-- 1. Confirmar estructura única operativa y conteo total de puestos
SELECT
  v.id,
  v.clave,
  v.nombre,
  v.estado,
  COUNT(p.id)::int AS total_puestos,
  COUNT(p.id) FILTER (WHERE p.puesto_padre_id IS NULL)::int AS total_raices
FROM public.rh_org_version v
LEFT JOIN public.rh_org_puesto p ON p.version_id = v.id AND p.activo = TRUE
WHERE v.clave = 'ORG-COORDINACION-ESTATAL'
GROUP BY v.id;

-- 2. Confirmar conteo por nivel jerárquico y 5 dependencias directas de la raíz
SELECT
  p.nivel_jerarquico,
  COUNT(*)::int AS puestos_en_nivel
FROM public.rh_org_puesto p
INNER JOIN public.rh_org_version v ON v.id = p.version_id
WHERE v.clave = 'ORG-COORDINACION-ESTATAL'
  AND p.activo = TRUE
GROUP BY p.nivel_jerarquico
ORDER BY p.nivel_jerarquico;
