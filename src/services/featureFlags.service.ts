// src/services/featureFlags.service.ts
import { Pool } from 'pg';
import { EffectiveFlags, FlagKey, FeatureFlagRow, FlagScope } from '../models/featureFlags';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
});

const KNOWN_FLAGS: FlagKey[] = [
    'SOLO_CPMS',
    'BUSCAR_EXISTENCIA_EN_CLUES',
    'APLICAR_ENCUESTAS',
    'APLICAR_EQUIVALENCIAS',
    'CLUES_EXISTENCIAS_ALLOWLIST',
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
        scope_id?: string | null;
        value: any;                 // boolean, number, string, object…
        updated_by?: string;
    }) {
        const scope_id = input.scope === 'global' ? null : (input.scope_id ?? '').trim();
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
}

export default FeatureFlagsService;