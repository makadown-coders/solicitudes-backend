import { pool } from '../db/pool';
import {
  CnisArticuloGrupoTerapeutico,
  CnisArticuloGrupoTerapeuticoDetalle,
  CnisGrupoTerapeutico,
} from '../models/cnis-grupos-terapeuticos.model';

interface QueryResult<T> {
  rows: T[];
}

interface QueryExecutor {
  query<T>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

class CnisGruposTerapeuticosService {
  constructor(private readonly db: QueryExecutor = pool as QueryExecutor) {}

  async obtenerGruposUtilizados(): Promise<CnisGrupoTerapeutico[]> {
    const { rows } = await this.db.query<CnisGrupoTerapeutico>(`
      SELECT DISTINCT
        g.numero::integer AS numero,
        g.nombre
      FROM public.articulos a
      INNER JOIN cnis.insumo i
        ON regexp_replace(trim(a.clave), '[^0-9]', '', 'g') = i.clave_normalizada
      INNER JOIN cnis.insumo_grupo ig ON ig.insumo_id = i.id
      INNER JOIN cnis.grupo g ON g.id = ig.grupo_id
      ORDER BY numero;
    `);

    return rows;
  }

  async obtenerArticulosConGrupo(): Promise<CnisArticuloGrupoTerapeutico[]> {
    const { rows } = await this.db.query<CnisArticuloGrupoTerapeutico>(`
      SELECT DISTINCT
        a.clave,
        g.numero::integer AS grupo,
        g.nombre AS "grupoNombre"
      FROM public.articulos a
      INNER JOIN cnis.insumo i
        ON regexp_replace(trim(a.clave), '[^0-9]', '', 'g') = i.clave_normalizada
      INNER JOIN cnis.insumo_grupo ig ON ig.insumo_id = i.id
      INNER JOIN cnis.grupo g ON g.id = ig.grupo_id
      ORDER BY grupo, a.clave;
    `);

    return rows;
  }

  async obtenerArticulosPorGrupo(
    numero: number
  ): Promise<CnisArticuloGrupoTerapeuticoDetalle[]> {
    const { rows } = await this.db.query<CnisArticuloGrupoTerapeuticoDetalle>(`
      SELECT DISTINCT
        a.clave,
        a.descripcion,
        a.presentacion
      FROM public.articulos a
      INNER JOIN cnis.insumo i
        ON regexp_replace(trim(a.clave), '[^0-9]', '', 'g') = i.clave_normalizada
      INNER JOIN cnis.insumo_grupo ig ON ig.insumo_id = i.id
      INNER JOIN cnis.grupo g ON g.id = ig.grupo_id
      WHERE g.numero = $1
      ORDER BY a.clave, a.descripcion, a.presentacion;
    `, [numero]);

    return rows;
  }
}

export default CnisGruposTerapeuticosService;
