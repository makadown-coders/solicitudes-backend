-- ============================================================================
-- MIGRACIÓN RH-4A.6A: Metadatos del expediente documental por trabajador
-- Archivo: sql/rh/005_expediente_documental.sql
--
-- IMPORTANTE:
-- - NO almacena binarios en PostgreSQL ni URLs públicas permanentes.
-- - NO modifica public.persona, public.rh_adscripcion_laboral,
--   public.rh_comision_laboral ni public.rh_vacacion_registro.
-- - El almacenamiento físico debe residir en un bucket privado (p. ej.
--   Supabase Storage privado) referenciado por storage_object_key opaco.
-- - El responsable del proyecto ejecuta manualmente este script.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rh_documento_persona (
  id                      SERIAL PRIMARY KEY,
  persona_id              INTEGER NOT NULL REFERENCES public.persona(id),
  categoria               VARCHAR(60) NOT NULL,
  tipo_descripcion        VARCHAR(160) NOT NULL,
  nombre_archivo_original VARCHAR(255) NOT NULL,
  mime_type               VARCHAR(120) NOT NULL,
  tamano_bytes            BIGINT NOT NULL,
  storage_provider        VARCHAR(40) NOT NULL DEFAULT 'SUPABASE_PRIVATE',
  storage_object_key      VARCHAR(300) NOT NULL,
  sha256_hash             CHAR(64) NULL,
  fecha_documento         DATE NULL,
  observaciones           TEXT NULL,
  estado                  VARCHAR(20) NOT NULL DEFAULT 'VIGENTE',
  motivo_anulacion        VARCHAR(300) NULL,
  anulado_por             UUID NULL REFERENCES public.app_users(id),
  anulado_en              TIMESTAMPTZ NULL,
  registrado_por          UUID NOT NULL REFERENCES public.app_users(id),
  registrado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por         UUID NULL REFERENCES public.app_users(id),
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_rh_documento_storage_key UNIQUE (storage_object_key),
  CONSTRAINT chk_rh_doc_categoria CHECK (
    categoria IN (
      'IDENTIFICACION_PERSONAL',
      'NOMBRAMIENTO_CONTRATACION',
      'ADSCRIPCION_LABORAL',
      'COMISION_LABORAL',
      'VACACIONES_AUTORIZACIONES',
      'CONSTANCIAS',
      'OTROS_ADMINISTRATIVOS'
    )
  ),
  CONSTRAINT chk_rh_doc_tipo_desc CHECK (
    NULLIF(BTRIM(tipo_descripcion), '') IS NOT NULL
  ),
  CONSTRAINT chk_rh_doc_nombre_archivo CHECK (
    NULLIF(BTRIM(nombre_archivo_original), '') IS NOT NULL
  ),
  CONSTRAINT chk_rh_doc_mime_type CHECK (
    NULLIF(BTRIM(mime_type), '') IS NOT NULL
  ),
  CONSTRAINT chk_rh_doc_tamano CHECK (
    tamano_bytes > 0 AND tamano_bytes <= 10485760
  ),
  CONSTRAINT chk_rh_doc_storage_key CHECK (
    NULLIF(BTRIM(storage_object_key), '') IS NOT NULL
    AND storage_object_key !~* '^https?://'
  ),
  CONSTRAINT chk_rh_doc_sha256 CHECK (
    sha256_hash IS NULL OR sha256_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_rh_doc_estado CHECK (
    estado IN ('VIGENTE', 'ANULADO')
  ),
  CONSTRAINT chk_rh_doc_motivo_anulacion CHECK (
    estado <> 'ANULADO' OR NULLIF(BTRIM(motivo_anulacion), '') IS NOT NULL
  )
);

COMMENT ON TABLE public.rh_documento_persona IS
  'Metadatos de documentos del expediente laboral por persona. Los binarios residen en almacenamiento privado referenciados por storage_object_key opaco.';

COMMENT ON COLUMN public.rh_documento_persona.storage_object_key IS
  'Identificador/ruta opaca interna dentro del almacenamiento privado; nunca una URL pública permanente.';

COMMENT ON COLUMN public.rh_documento_persona.estado IS
  'Estado administrativo del documento: VIGENTE o ANULADO (baja lógica sin borrado físico inmediato).';

CREATE INDEX IF NOT EXISTS idx_rh_doc_persona_estado
  ON public.rh_documento_persona (persona_id, estado, registrado_en DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_rh_doc_persona_categoria
  ON public.rh_documento_persona (persona_id, categoria);

CREATE INDEX IF NOT EXISTS idx_rh_doc_persona_sha256
  ON public.rh_documento_persona (persona_id, sha256_hash)
  WHERE sha256_hash IS NOT NULL AND estado = 'VIGENTE';
