export type CpmKitsBatchRow = {
    rowNumber?: number;
    cluesimb: string; // col 2
    clave_cnis: string; // col 6
    cpm: number; // col 23
    kitsOnes: string[]; // lista de códigos kit donde la celda = 1 (cols 7..19)
};

/*export type BatchRow = {
  cluesimb: string;
  clave_cnis: string;
  cpm: number;
  kitsOnes: string[];
};*/