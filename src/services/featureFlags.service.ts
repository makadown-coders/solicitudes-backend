// src/services/featureFlags.service.ts
import { EffectiveFlags, FlagKey, FeatureFlagRow, FlagScope } from '../models/featureFlags';
import { UnidadAllow } from '../models/UnidadAllow';
import { pool } from '../db/pool';

const KNOWN_FLAGS: FlagKey[] = [
    'SOLO_CPMS',
    'BUSCAR_EXISTENCIA_EN_CLUES',
    'APLICAR_ENCUESTAS',
    'APLICAR_EQUIVALENCIAS',
    'CLUES_EXISTENCIAS_ALLOWLIST',
    'IMPORT_LIMIT_TO_KIT',
    'EDIT_CPMS',
];

class FeatureFlagsService {
    mergeByPrecedence(rows: FeatureFlagRow[]): EffectiveFlags {
        const out: Record<string, any> = {};
        // ordenamos para que global se escriba primero, luego nivel, luego clues
        const precedence = (r: FeatureFlagRow) => (r.scope === 'global' ? 1 : r.scope === 'nivel' ? 2 : 3);
        rows.sort((a, b) => precedence(a) - precedence(b));
        for (const r of rows) out[r.flag_key] = r.value_json?.bool ?? r.value_json; // si es {"bool":true}, devuelve true
        return out as EffectiveFlags;
    }

    async getEffectiveFlags(params: { cluesimb?: string; nivel?: 'PRIMER_NIVEL' | 'SEGUNDO_NIVEL' }) {
        const { cluesimb, nivel } = params;
        const values: any[] = [];
        const where: string[] = [];

        // global
        where.push(`(scope = 'global')`);

        // nivel
        if (nivel) {
            values.push(nivel);
            where.push(`(scope = 'nivel' AND scope_id = $${values.length})`);
        }

        // clues
        if (cluesimb) {
            values.push(cluesimb);
            where.push(`(scope = 'clues' AND scope_id = $${values.length})`);
        }

        const sql = `
    SELECT flag_key, scope, scope_id, value_json, updated_at
    FROM feature_flags
    WHERE (${where.join(' OR ')})
      AND flag_key = ANY($${values.length + 1}::text[])
  `;
        values.push(KNOWN_FLAGS);

        const { rows } = await pool.query(sql, values);
        return this.mergeByPrecedence(rows as FeatureFlagRow[]);
    }

    async listAllFlags() {
        const { rows } = await pool.query<FeatureFlagRow>(`
    SELECT * FROM feature_flags ORDER BY flag_key, scope, COALESCE(scope_id,'')
  `);
        return rows;
    }

    async upsertFlag(input: {
        flag_key: FlagKey;
        scope: FlagScope;
        scope_id?: string;
        value: any; // boolean, number, string, object…
        updated_by?: string;
    }) {
        const scope_id = input.scope === 'global' ? 'global' : (input.scope_id ?? '').trim();
        const json = typeof input.value === 'boolean' ? { bool: input.value } : input.value;

        const sql = `
    INSERT INTO feature_flags (flag_key, scope, scope_id, value_json, updated_by)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (flag_key, scope, scope_id)
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = now()
    RETURNING *;
  `;
        const { rows } = await pool.query(sql, [
            input.flag_key, input.scope, scope_id, json, input.updated_by ?? null
        ]);
        return rows[0] as FeatureFlagRow;
    }

    async listAllowedUnidades(q?: string): Promise<UnidadAllow[]> {
        const params: any[] = [];
        const whereQ = `
    AND (
      $1::text IS NULL
      OR um.cluesimb ILIKE '%'||$1||'%'
      OR uma.alias_dash ILIKE '%'||$1||'%'
      OR um.nombre ILIKE '%'||$1||'%'
    )
  `;
        params.push(q ?? null);

        const sql = `
    WITH allow AS (
      SELECT jsonb_array_elements_text(
               COALESCE(
                 CASE WHEN jsonb_typeof(value_json)='object' THEN (value_json->'list')
                      ELSE value_json
                 END,
                 '[]'::jsonb
               )
             ) AS alias_dash
      FROM feature_flags
      WHERE flag_key='CLUES_EXISTENCIAS_ALLOWLIST' AND scope='global'
    )
    SELECT um.cluesimb, um.nombre, uma.alias_dash
    FROM unidad_medica um
    JOIN unidad_medica_alias uma ON uma.unidad_medica_id = um.id
    JOIN allow a ON a.alias_dash = uma.alias_dash
    WHERE uma.alias_dash IS NOT NULL
    ${whereQ}
    ORDER BY uma.alias_dash, um.nombre
    LIMIT 100;
  `;
        const { rows } = await pool.query(sql, params);
        return rows as UnidadAllow[];
    }
}

export default FeatureFlagsService;