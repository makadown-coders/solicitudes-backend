BEGIN;

CREATE TABLE IF NOT EXISTS public.solicitud_primer_nivel_destinatario (
  id bigserial PRIMARY KEY,
  codigo varchar(50) NOT NULL,
  nombre varchar(150) NOT NULL,
  correo varchar(320) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_primer_nivel_destinatario
  ON public.solicitud_primer_nivel_destinatario (codigo, lower(correo));

INSERT INTO public.solicitud_primer_nivel_destinatario (codigo, nombre, correo)
VALUES
  ('VACUNACION', 'Vacunación', 'grecia.torres@imssbienestar.gob.mx'),
  ('PLANIFICACION_FAMILIAR', 'Planificación Familiar', 'betzaida.aguilar@imssbienestar.gob.mx'),
  ('APS', 'Atención Primaria a la Salud', 'xochitl.camacho@imssbienestar.gob.mx')
ON CONFLICT DO NOTHING;

COMMIT;
