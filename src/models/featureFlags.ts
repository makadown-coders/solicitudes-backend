// src/models/featureFlags.ts
export type FlagKey =
  | 'SOLO_CPMS'
  | 'BUSCAR_EXISTENCIA_EN_CLUES'
  | 'APLICAR_ENCUESTAS'
  | 'APLICAR_EQUIVALENCIAS'
  | 'CLUES_EXISTENCIAS_ALLOWLIST'; // json list

export type FlagScope = 'global' | 'nivel' | 'clues';

export interface FeatureFlagRow {
  id: number;
  flag_key: FlagKey | string;
  scope: FlagScope;
  scope_id: string | null;
  value_json: any;
  description?: string | null;
  updated_by?: string | null;
  updated_at: string;
}

export type EffectiveFlags = Record<FlagKey, any>; // normalmente booleans, salvo listas
