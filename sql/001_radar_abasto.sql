CREATE TABLE IF NOT EXISTS public.radar_eventos (
  id SERIAL PRIMARY KEY,
  fecha_evento DATE NOT NULL DEFAULT CURRENT_DATE,
  clues VARCHAR(20) NOT NULL,
  unidad_nombre TEXT,
  tipo_insumo VARCHAR(80),
  fecha_referencia DATE,
  motivo TEXT NOT NULL,
  observaciones TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto',
  creado_por TEXT DEFAULT 'sistema',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT radar_eventos_estado_chk
    CHECK (estado IN ('abierto', 'en_seguimiento', 'cerrado'))
);

CREATE INDEX IF NOT EXISTS idx_radar_eventos_fecha
  ON public.radar_eventos (fecha_evento DESC);

CREATE INDEX IF NOT EXISTS idx_radar_eventos_clues
  ON public.radar_eventos (clues);

CREATE INDEX IF NOT EXISTS idx_radar_eventos_estado
  ON public.radar_eventos (estado);

CREATE TABLE IF NOT EXISTS public.radar_evento_claves (
  id SERIAL PRIMARY KEY,
  evento_id INT NOT NULL REFERENCES public.radar_eventos(id) ON DELETE CASCADE,
  clave_cnis VARCHAR(20) NOT NULL,
  descripcion TEXT,
  existencia_actual NUMERIC NOT NULL DEFAULT 0,
  consumo_promedio NUMERIC NOT NULL DEFAULT 0,
  dias_cobertura NUMERIC,
  citas_pendientes NUMERIC NOT NULL DEFAULT 0,
  entradas_30d NUMERIC NOT NULL DEFAULT 0,
  salidas_30d NUMERIC NOT NULL DEFAULT 0,
  traspasos_30d NUMERIC NOT NULL DEFAULT 0,
  solicitado_30d NUMERIC NOT NULL DEFAULT 0,
  movimientos_recientes INT NOT NULL DEFAULT 0,
  nivel_riesgo VARCHAR(20) NOT NULL DEFAULT 'BAJO',
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  recalculated_at TIMESTAMP,
  CONSTRAINT radar_evento_claves_riesgo_chk
    CHECK (nivel_riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO'))
);

CREATE INDEX IF NOT EXISTS idx_radar_evento_claves_evento
  ON public.radar_evento_claves (evento_id);

CREATE INDEX IF NOT EXISTS idx_radar_evento_claves_clave
  ON public.radar_evento_claves (clave_cnis);

CREATE INDEX IF NOT EXISTS idx_radar_evento_claves_riesgo
  ON public.radar_evento_claves (nivel_riesgo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_radar_evento_clave
  ON public.radar_evento_claves (evento_id, clave_cnis);

