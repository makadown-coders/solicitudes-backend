
export type HomologoEdgeRow = {
  claveConsultada: string;  // clave solicitada (normalizada)
  candidato: string;        // sustituto (FORWARD) o main (REVERSE)
  factor: string;           // factor efectivo (ya invertido cuando aplique)
  direccion: 'FORWARD' | 'REVERSE';
};
