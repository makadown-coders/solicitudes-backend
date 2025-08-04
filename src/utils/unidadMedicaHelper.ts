// src/utils/unidadMedicaHelper.ts
import { Pool } from 'pg';

export async function obtenerUnidadIdDesdeAlias(pool: Pool, alias: string): Promise<number | null> {
  if (!alias) return null;
  const { rows } = await pool.query(
    `SELECT id FROM unidad_medica_alias 
     WHERE LOWER(alias_sas) = LOWER($1) 
        OR LOWER(alias_dash) = LOWER($1) 
     LIMIT 1`,
    [alias.trim()]
  );
  return rows.length ? rows[0].id : null;
}
