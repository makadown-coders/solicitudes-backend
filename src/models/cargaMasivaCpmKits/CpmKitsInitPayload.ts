import { CpmKitsBatchRow } from "./CpmKitsBatchRow";

export type CpmKitsInitPayload = {
    confirm: boolean; // checkbox
    sourceTag?: string; // opcional: "CPMS_BC_2026_01"
    kitCodes: string[]; // columnas 7..19 (en UPPER)
    truncateCpm?: boolean; // default true
    resetKits?: boolean; // default true (solo los kitCodes)
};

/*export type BatchPayload = {
  sourceTag?: string;
  rows: CpmKitsBatchRow[];
};*/
