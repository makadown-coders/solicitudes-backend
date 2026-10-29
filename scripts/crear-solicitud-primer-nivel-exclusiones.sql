BEGIN;

CREATE TABLE IF NOT EXISTS public.solicitud_primer_nivel_exclusion_regla (
  id bigserial PRIMARY KEY,
  tipo varchar(30) NOT NULL,
  valor varchar(200) NOT NULL,
  motivo text,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_solicitud_primer_nivel_exclusion_tipo
    CHECK (tipo IN ('CLAVE', 'PREFIJO', 'NOMBRE_CONTIENE')),
  CONSTRAINT ck_solicitud_primer_nivel_exclusion_valor_normalizado
    CHECK (valor = UPPER(BTRIM(valor)) AND BTRIM(valor) <> ''),
  CONSTRAINT uq_solicitud_primer_nivel_exclusion_regla
    UNIQUE (tipo, valor)
);

INSERT INTO public.solicitud_primer_nivel_exclusion_regla (
  tipo,
  valor,
  motivo,
  activo,
  actualizado_en
)
VALUES
  ('PREFIJO', '110', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('PREFIJO', '204', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('PREFIJO', '254', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('CLAVE', '010.000.0109.00', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'SEMAGLUTIDA', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'LIRAGLUTIDA', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'DIAZEPAM', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'CELECOXIB', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'MIDAZOLAM', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'TRAMADOL', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'RIVAROXABAN', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'APIXABAN', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now()),
  ('NOMBRE_CONTIENE', 'FENTANILO', 'Exclusión operativa Wishlist Primer Nivel - instrucción octubre 2026', true, now())
ON CONFLICT (tipo, valor) DO UPDATE
SET motivo = EXCLUDED.motivo,
    activo = true,
    actualizado_en = now();

CREATE OR REPLACE VIEW public.v_solicitud_primer_nivel_clave_excluida AS
SELECT DISTINCT UPPER(TRIM(i.clave)) AS clave
FROM cnis.insumo i
WHERE NULLIF(UPPER(TRIM(i.clave)), '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.solicitud_primer_nivel_exclusion_regla e
    WHERE e.activo = true
      AND (
        (e.tipo = 'CLAVE' AND UPPER(TRIM(i.clave)) = e.valor)
        OR (e.tipo = 'PREFIJO' AND SPLIT_PART(UPPER(TRIM(i.clave)), '.', 1) = e.valor)
        OR (
          e.tipo = 'NOMBRE_CONTIENE'
          AND UPPER(COALESCE(i.nombre, '')) LIKE '%' || e.valor || '%'
        )
      )
  );

COMMIT;

-- Diagnóstico por regla: cantidad de claves CNIS afectadas.
SELECT
  e.tipo,
  e.valor,
  COUNT(DISTINCT UPPER(TRIM(i.clave)))::integer AS claves_afectadas
FROM public.solicitud_primer_nivel_exclusion_regla e
LEFT JOIN cnis.insumo i
  ON (e.tipo = 'CLAVE' AND UPPER(TRIM(i.clave)) = e.valor)
  OR (e.tipo = 'PREFIJO' AND SPLIT_PART(UPPER(TRIM(i.clave)), '.', 1) = e.valor)
  OR (
    e.tipo = 'NOMBRE_CONTIENE'
    AND UPPER(COALESCE(i.nombre, '')) LIKE '%' || e.valor || '%'
  )
WHERE e.activo = true
GROUP BY e.tipo, e.valor
ORDER BY e.tipo, e.valor;

-- Diagnóstico detallado: claves y nombres CNIS por regla aplicada.
SELECT DISTINCT
  e.tipo,
  e.valor,
  UPPER(TRIM(i.clave)) AS clave,
  i.nombre
FROM public.solicitud_primer_nivel_exclusion_regla e
JOIN cnis.insumo i
  ON (e.tipo = 'CLAVE' AND UPPER(TRIM(i.clave)) = e.valor)
  OR (e.tipo = 'PREFIJO' AND SPLIT_PART(UPPER(TRIM(i.clave)), '.', 1) = e.valor)
  OR (
    e.tipo = 'NOMBRE_CONTIENE'
    AND UPPER(COALESCE(i.nombre, '')) LIKE '%' || e.valor || '%'
  )
WHERE e.activo = true
ORDER BY e.tipo, e.valor, clave, i.nombre;
