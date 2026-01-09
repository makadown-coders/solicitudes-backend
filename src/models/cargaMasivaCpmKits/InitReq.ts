
export type InitReq = {
  mode: 'validate' | 'apply';
  confirmReset?: boolean; // checkbox
  kitHeaders: string[];   // columnas 7..19 tal cual vienen en el Excel
  source?: string;        // opcional: "Central CPM BC"
};
