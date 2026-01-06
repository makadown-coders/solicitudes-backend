import { CpmKitsBatchRow } from "./CpmKitsBatchRow";

export type CpmKitsBatchPayload = {
    sourceTag?: string;
    rows: CpmKitsBatchRow[];
};

export type InitPayload = {
  confirm: boolean;
  sourceTag?: string;
  kitCodes: string[];
  truncateCpm?: boolean;
  resetKits?: boolean;
};
