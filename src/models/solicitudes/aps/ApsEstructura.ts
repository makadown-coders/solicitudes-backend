export type ApsEstructura = Array<{
  ejeCodigo: string;
  ejeNombre: string;
  grupos: Array<{
    numero: number;
    nombre: string;
    totalMedicamentos: number;
  }>;
}>;
