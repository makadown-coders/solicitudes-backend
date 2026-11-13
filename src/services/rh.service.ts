import { pool } from '../db/pool';
import type { RhAccessContext, RhAccessScope } from '../auth/requireRhAccess';

export interface RhUnidadAutorizada {
  id: number;
  nombre: string;
  cluesimb: string | null;
}

export interface RhUnidadesAutorizadasResult {
  scope: RhAccessScope;
  unidades: RhUnidadAutorizada[];
}

export default class RhService {
  async getUnidadesAutorizadas(access: RhAccessContext): Promise<RhUnidadesAutorizadasResult> {
    if (access.scope === 'GLOBAL') {
      const { rows } = await pool.query<{ id: number; nombre: string; cluesimb: string | null }>(
        `SELECT id, nombre, cluesimb
           FROM public.unidad_medica
          WHERE activo = TRUE
          ORDER BY LOWER(TRIM(nombre)) ASC, id ASC`
      );
      return {
        scope: 'GLOBAL',
        unidades: rows.map((r) => ({
          id: Number(r.id),
          nombre: String(r.nombre),
          cluesimb: r.cluesimb ?? null,
        })),
      };
    }

    const validClues = access.clues
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length > 0 && c !== 'N/A');

    if (validClues.length === 0) {
      return {
        scope: 'CLUES',
        unidades: [],
      };
    }

    const { rows } = await pool.query<{ id: number; nombre: string; cluesimb: string | null }>(
      `WITH candidatas AS (
         SELECT
           id,
           nombre,
           cluesimb,
           COUNT(*) OVER (PARTITION BY UPPER(TRIM(cluesimb))) AS coincidencias
         FROM public.unidad_medica
         WHERE activo = TRUE
           AND NULLIF(UPPER(TRIM(cluesimb)), '') IS NOT NULL
           AND UPPER(TRIM(cluesimb)) <> 'N/A'
           AND UPPER(TRIM(cluesimb)) = ANY($1::text[])
       )
       SELECT DISTINCT id, nombre, cluesimb
       FROM candidatas
       WHERE coincidencias = 1
       ORDER BY LOWER(TRIM(nombre)) ASC, id ASC`,
      [validClues]
    );

    return {
      scope: 'CLUES',
      unidades: rows.map((r) => ({
        id: Number(r.id),
        nombre: String(r.nombre),
        cluesimb: r.cluesimb ?? null,
      })),
    };
  }
}
