-- =============================================================================
-- PROYECTO RH | RH-ORG-02
-- Catálogo estructural versionado del organigrama institucional
-- (versiones de organigrama, puestos estructurales y jerarquía padre -> hijos)
--
-- ADVERTENCIA:
--   - NO ejecutar automáticamente. Revisar y ejecutar manualmente por el responsable.
--   - NO inserta puestos ni datos personales de los Excel históricos.
--   - NO modifica tablas existentes (persona, rh_adscripcion_laboral, vacaciones, etc.).
--   - NO implementa ocupaciones de personas, firmas ni roles documentales todavía.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Versiones del organigrama institucional
--    Permite conservar versiones históricas (ej. 2024 como REFERENCIA_HISTORICA)
--    junto con borradores o una futura versión VIGENTE (2026+) sin sobrescribirlas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_org_version (
  id               SERIAL PRIMARY KEY,
  clave            VARCHAR(40) NOT NULL CHECK (BTRIM(clave) <> ''),
  nombre           VARCHAR(160) NOT NULL CHECK (BTRIM(nombre) <> ''),
  descripcion      TEXT NULL,
  anio_referencia  SMALLINT NOT NULL CHECK (anio_referencia BETWEEN 2000 AND 2100),
  unidad_medica_id INTEGER NULL REFERENCES public.unidad_medica(id) ON DELETE RESTRICT,
  estado           VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
                   CHECK (estado IN ('BORRADOR', 'REFERENCIA_HISTORICA', 'VIGENTE', 'ARCHIVADA')),
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rh_org_version_clave UNIQUE (clave)
);

-- A lo sumo una versión activa en estado VIGENTE por ámbito (unidad_medica_id o estatal NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_org_version_unica_vigente
  ON public.rh_org_version (COALESCE(unidad_medica_id, 0))
  WHERE (estado = 'VIGENTE' AND activo = TRUE);

CREATE INDEX IF NOT EXISTS idx_rh_org_version_anio_estado
  ON public.rh_org_version (anio_referencia DESC, estado);


-- -----------------------------------------------------------------------------
-- 2. Puestos estructurales y relación jerárquica padre -> hijos hermanos
--    - Un puesto existe independientemente de si tiene ocupante (admite vacantes).
--    - Permite denominaciones repetidas (ej. "Oficina de Supervisión" en distintas ramas).
--    - Permite códigos/niveles repetidos (ej. múltiples CF80003, CF80010, M11).
--    - Los hijos que comparten el mismo puesto_padre_id son hermanos en igualdad
--      de jerarquía; orden_visual es exclusivamente para orden de presentación.
--    - La FK compuesta (version_id, puesto_padre_id) impide padres de otra versión.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_org_puesto (
  id               SERIAL PRIMARY KEY,
  version_id       INTEGER NOT NULL REFERENCES public.rh_org_version(id) ON DELETE RESTRICT,
  puesto_padre_id  INTEGER NULL,
  denominacion     VARCHAR(200) NOT NULL CHECK (BTRIM(denominacion) <> ''),
  codigo_nivel     VARCHAR(40) NULL,
  nivel_jerarquico SMALLINT NOT NULL CHECK (nivel_jerarquico BETWEEN 1 AND 10),
  siglas_area      VARCHAR(30) NULL,
  orden_visual     SMALLINT NOT NULL DEFAULT 0 CHECK (orden_visual >= 0),
  observaciones    TEXT NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rh_org_puesto_version_id UNIQUE (version_id, id),
  CONSTRAINT fk_rh_org_puesto_padre_misma_version
    FOREIGN KEY (version_id, puesto_padre_id)
    REFERENCES public.rh_org_puesto (version_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_rh_org_puesto_no_autorreferencia
    CHECK (puesto_padre_id IS NULL OR puesto_padre_id <> id),
  CONSTRAINT chk_rh_org_puesto_raiz_nivel_1
    CHECK (puesto_padre_id IS NOT NULL OR nivel_jerarquico = 1)
);

-- Una sola raíz activa (puesto_padre_id IS NULL) por versión del organigrama
CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_org_puesto_raiz_por_version
  ON public.rh_org_puesto (version_id)
  WHERE (puesto_padre_id IS NULL AND activo = TRUE);

CREATE INDEX IF NOT EXISTS idx_rh_org_puesto_version_padre
  ON public.rh_org_puesto (version_id, puesto_padre_id, orden_visual, id);

CREATE INDEX IF NOT EXISTS idx_rh_org_puesto_version_codigo
  ON public.rh_org_puesto (version_id, codigo_nivel);


-- -----------------------------------------------------------------------------
-- 3. Protección de integridad jerárquica:
--    a) Previene ciclos (A -> B -> ... -> A).
--    b) Exige consistencia exacta de niveles: hijo.nivel_jerarquico = padre.nivel_jerarquico + 1.
--    c) Impide que un cambio de padre o de nivel deje descendientes con niveles inconsistentes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_rh_org_puesto_validar_integridad_jerarquica()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nivel_padre        smallint;
  v_hay_ciclo          boolean;
  v_hijos_inconsist    integer;
BEGIN
  -- 1) Validar relación con el padre (si existe)
  IF NEW.puesto_padre_id IS NULL THEN
    IF NEW.nivel_jerarquico <> 1 THEN
      RAISE EXCEPTION 'Integridad jerárquica: el puesto raíz (puesto_padre_id IS NULL) debe tener nivel_jerarquico = 1.';
    END IF;
  ELSE
    IF NEW.id IS NOT NULL AND NEW.puesto_padre_id = NEW.id THEN
      RAISE EXCEPTION 'Integridad jerárquica: un puesto estructural (%) no puede ser su propio padre.', NEW.id;
    END IF;

    SELECT p.nivel_jerarquico
      INTO v_nivel_padre
      FROM public.rh_org_puesto p
     WHERE p.id = NEW.puesto_padre_id
       AND p.version_id = NEW.version_id;

    IF v_nivel_padre IS NULL THEN
      RAISE EXCEPTION 'Integridad jerárquica: el puesto padre % no existe en la versión %.',
        NEW.puesto_padre_id, NEW.version_id;
    END IF;

    IF NEW.nivel_jerarquico <> v_nivel_padre + 1 THEN
      RAISE EXCEPTION 'Integridad jerárquica: nivel_jerarquico (%) inconsistente con el padre % (nivel %; se esperaba %).',
        NEW.nivel_jerarquico, NEW.puesto_padre_id, v_nivel_padre, v_nivel_padre + 1;
    END IF;

    -- 2) Prevenir ciclos al actualizar puesto_padre_id
    IF TG_OP = 'UPDATE' AND NEW.id IS NOT NULL THEN
      WITH RECURSIVE ancestros AS (
        SELECT p.id, p.puesto_padre_id, 1 AS profundidad
          FROM public.rh_org_puesto p
         WHERE p.id = NEW.puesto_padre_id
           AND p.version_id = NEW.version_id
        UNION ALL
        SELECT padre.id, padre.puesto_padre_id, a.profundidad + 1
          FROM public.rh_org_puesto padre
          INNER JOIN ancestros a ON a.puesto_padre_id = padre.id
         WHERE padre.version_id = NEW.version_id
           AND a.profundidad < 32
      )
      SELECT EXISTS (
        SELECT 1 FROM ancestros WHERE id = NEW.id
      ) INTO v_hay_ciclo;

      IF v_hay_ciclo THEN
        RAISE EXCEPTION 'Integridad jerárquica: la asignación de puesto_padre_id=% al puesto % genera un ciclo en la versión %.',
          NEW.puesto_padre_id, NEW.id, NEW.version_id;
      END IF;
    END IF;
  END IF;

  -- 3) En UPDATE, impedir que un cambio de nivel/padre deje hijos (y por tanto descendientes) inconsistentes
  IF TG_OP = 'UPDATE' AND (
    NEW.nivel_jerarquico IS DISTINCT FROM OLD.nivel_jerarquico
    OR NEW.puesto_padre_id IS DISTINCT FROM OLD.puesto_padre_id
  ) THEN
    SELECT COUNT(*)::int
      INTO v_hijos_inconsist
      FROM public.rh_org_puesto h
     WHERE h.puesto_padre_id = NEW.id
       AND h.version_id = NEW.version_id
       AND h.nivel_jerarquico <> NEW.nivel_jerarquico + 1;

    IF v_hijos_inconsist > 0 THEN
      RAISE EXCEPTION 'Integridad jerárquica: el cambio de padre o nivel en el puesto % (nivel %) dejaría % puesto(s) hijo(s) con nivel inconsistente. Actualice primero o reubique los descendientes.',
        NEW.id, NEW.nivel_jerarquico, v_hijos_inconsist;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rh_org_puesto_prevenir_ciclo ON public.rh_org_puesto;
DROP TRIGGER IF EXISTS trg_rh_org_puesto_integridad_jerarquica ON public.rh_org_puesto;

CREATE TRIGGER trg_rh_org_puesto_integridad_jerarquica
  BEFORE INSERT OR UPDATE OF puesto_padre_id, version_id, nivel_jerarquico
  ON public.rh_org_puesto
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_rh_org_puesto_validar_integridad_jerarquica();

COMMIT;


-- =============================================================================
-- CONSULTAS DE VERIFICACIÓN POST-EJECUCIÓN (SOLO LECTURA)
-- =============================================================================

-- 1. Verificar tablas creadas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('rh_org_version', 'rh_org_puesto')
ORDER BY table_name;

-- 2. Verificar restricciones (PK, FK, UNIQUE, CHECK)
SELECT conname, contype, conrelid::regclass AS tabla
FROM pg_constraint
WHERE conrelid IN ('public.rh_org_version'::regclass, 'public.rh_org_puesto'::regclass)
ORDER BY tabla, conname;

-- 3. Verificar índices y trigger contra ciclos
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('rh_org_version', 'rh_org_puesto')
ORDER BY tablename, indexname;
