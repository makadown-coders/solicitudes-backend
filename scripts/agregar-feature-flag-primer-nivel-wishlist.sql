BEGIN;

-- La infraestructura existente representa el ámbito global con scope_id = 'global'.
-- Se conserva esa convención para que funcionen el índice único y el upsert genérico.
INSERT INTO public.feature_flags (
  flag_key,
  scope,
  scope_id,
  value_json,
  description,
  updated_at
)
SELECT
  'PRIMER_NIVEL_WISHLIST_ENABLED',
  'global',
  'global',
  '{"bool": true}'::jsonb,
  'Habilita o deshabilita la captura de Wishlist de Primer Nivel',
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.feature_flags
  WHERE flag_key = 'PRIMER_NIVEL_WISHLIST_ENABLED'
    AND scope = 'global'
    AND scope_id = 'global'
);

COMMIT;
