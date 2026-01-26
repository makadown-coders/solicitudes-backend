
export type CrearBitacoraResult = {
  solicitudId: string;
  wasInserted: boolean; // true si fue nueva; false si fue dedupe (ya existía)
  payloadHash: string;
};
