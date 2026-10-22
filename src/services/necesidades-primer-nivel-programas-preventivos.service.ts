import { pool } from '../db/pool';
import { ProgramaPreventivoDetalle } from '../models/solicitudes/programas-preventivos/ProgramaPreventivoDetalle';
import { ProgramaPreventivoInsumo } from '../models/solicitudes/programas-preventivos/ProgramaPreventivoInsumo';
import {
  ProgramaPreventivoResumen,
  ProgramasPreventivosResponse,
} from '../models/solicitudes/programas-preventivos/ProgramaPreventivoResumen';
import {
  ResolverProgramaPreventivoInput,
  ResolverProgramaPreventivoResult,
} from '../models/solicitudes/programas-preventivos/ResolverProgramaPreventivo';

type ProgramaRow = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
};

type ProgramaResumenRow = ProgramaRow & { total_insumos: string | number };

type InsumoRow = {
  clave: string;
  nombre: string;
  descripcion: string | null;
  presentacion: string | null;
  obligatorio: boolean;
  orden: number;
};

export class ProgramaPreventivoNoEncontradoError extends Error {
  constructor() {
    super('Programa no disponible');
    this.name = 'ProgramaPreventivoNoEncontradoError';
  }
}

export class ProgramaPreventivoValidacionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramaPreventivoValidacionError';
  }
}

export default class NecesidadesPrimerNivelProgramasPreventivosService {
  async listar(cluesimbInput?: string): Promise<ProgramasPreventivosResponse> {
    console.info('resolviendo clues ', cluesimbInput);
    const unidadMedicaId = await this.resolverUnidadMedicaId(cluesimbInput);
    console.info('unidad medica id ', unidadMedicaId);
    const { rows } = await pool.query<ProgramaResumenRow>(`
      SELECT
        p.id,
        p.codigo,
        p.nombre,
        p.descripcion,
        p.orden::integer AS orden,
        COUNT(pc.clave) FILTER (WHERE pc.activo = true)::integer AS total_insumos
      FROM preventivos.programa p
      LEFT JOIN preventivos.programa_clave pc ON pc.programa_id = p.id
      WHERE p.activo = true
        AND (
          NOT EXISTS (
            SELECT 1
            FROM preventivos.programa_unidad pu
            WHERE pu.programa_id = p.id
          )
          OR (
            $1::integer IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM preventivos.programa_unidad pu
              WHERE pu.programa_id = p.id
                AND pu.unidad_medica_id = $1::integer
            )
          )
        )
      GROUP BY p.id, p.codigo, p.nombre, p.descripcion, p.orden
      ORDER BY p.orden, p.nombre
    `, [unidadMedicaId]);

    const items: ProgramaPreventivoResumen[] = rows.map(row => ({
      codigo: row.codigo,
      nombre: row.nombre,
      descripcion: row.descripcion,
      orden: Number(row.orden),
      totalInsumos: Number(row.total_insumos),
    }));
    console.info('programas encontrados ', items);
    return { items };
  }

  async obtenerDetalle(codigoInput: string, cluesimbInput?: string): Promise<ProgramaPreventivoDetalle | null> {
    const codigo = this.normalizarPrograma(codigoInput);
    if (!codigo) throw new ProgramaPreventivoValidacionError('programa requerido');

    const unidadMedicaId = await this.resolverUnidadMedicaId(cluesimbInput);
    const programa = await this.obtenerProgramaDisponibleParaUnidad(codigo, unidadMedicaId);
    if (!programa) return null;

    const { rows } = await pool.query<InsumoRow>(`
      SELECT
        v.clave,
        COALESCE(NULLIF(TRIM(i.nombre), ''), 'Insumo del programa') AS nombre,
        v.descripcion,
        v.presentacion,
        v.obligatorio,
        v.orden::integer AS orden
      FROM preventivos.v_programa_insumo v
      LEFT JOIN cnis.insumo i
        ON UPPER(TRIM(i.clave)) = UPPER(TRIM(v.clave))
       AND i.activo = true
      WHERE v.programa_codigo = $1
        AND v.activo = true
      ORDER BY v.orden, v.clave
    `, [codigo]);

    return {
      codigo: programa.codigo,
      nombre: programa.nombre,
      descripcion: programa.descripcion,
      insumos: rows.map(this.mapearInsumo),
    };
  }

  async resolver(input: ResolverProgramaPreventivoInput): Promise<ResolverProgramaPreventivoResult> {
    const codigo = this.normalizarPrograma(input?.programa);
    if (!codigo) throw new ProgramaPreventivoValidacionError('programa requerido');

    const unidadMedicaId = await this.resolverUnidadMedicaId(input?.cluesimb);
    const programa = await this.obtenerProgramaDisponibleParaUnidad(codigo, unidadMedicaId);
    if (!programa) throw new ProgramaPreventivoNoEncontradoError();

    if (!Array.isArray(input?.insumos) || input.insumos.length < 1 || input.insumos.length > 500) {
      throw new ProgramaPreventivoValidacionError('La lista debe contener entre 1 y 500 insumos');
    }

    const vistos = new Set<string>();
    const capturados = input.insumos.map((item, index) => {
      const clave = this.normalizarClavePreventiva(item?.clave);
      const cantidadRaw: unknown = item?.cantidad;
      const cantidad = Number(cantidadRaw);
      if (!clave) throw new ProgramaPreventivoValidacionError(`clave requerida en insumos[${index}]`);
      if (vistos.has(clave)) throw new ProgramaPreventivoValidacionError(`Clave duplicada en el programa: ${clave}`);
      vistos.add(clave);
      if (cantidadRaw === null || cantidadRaw === undefined
        || (typeof cantidadRaw === 'string' && cantidadRaw.trim() === '')
        || !Number.isFinite(cantidad) || !Number.isInteger(cantidad) || cantidad < 0 || cantidad > 99999) {
        throw new ProgramaPreventivoValidacionError(`Cantidad inválida para la clave ${clave}`);
      }
      return { clave, cantidad };
    });

    const claves = capturados.map(item => item.clave);
    const { rows } = await pool.query<{ clave: string }>(`
      SELECT pc.clave
      FROM preventivos.programa_clave pc
      WHERE pc.programa_id = $1
        AND pc.activo = true
        AND pc.clave = ANY($2::text[])
    `, [programa.id, claves]);
    const permitidas = new Set(rows.map(row => row.clave));
    const ajenas = claves.filter(clave => !permitidas.has(clave));
    if (ajenas.length) {
      throw new ProgramaPreventivoValidacionError(`Claves inexistentes o no pertenecientes al programa ${codigo}: ${ajenas.slice(0, 5).join(', ')}`);
    }

    const articulos = capturados.filter(item => item.cantidad > 0);
    if (!articulos.length) throw new ProgramaPreventivoValidacionError('La lista no contiene insumos con cantidad mayor a cero');

    return {
      programa: { codigo: programa.codigo, nombre: programa.nombre },
      articulos,
      totalArticulos: articulos.length,
      listoParaEnviar: true,
    };
  }

  private async obtenerProgramaDisponibleParaUnidad(
    codigo: string,
    unidadMedicaId: number | null
  ): Promise<ProgramaRow | null> {
    const { rows } = await pool.query<ProgramaRow>(`
      SELECT p.id, p.codigo, p.nombre, p.descripcion, p.orden::integer AS orden
      FROM preventivos.programa p
      WHERE p.codigo = $1
        AND p.activo = true
        AND (
          NOT EXISTS (
            SELECT 1
            FROM preventivos.programa_unidad pu
            WHERE pu.programa_id = p.id
          )
          OR (
            $2::integer IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM preventivos.programa_unidad pu
              WHERE pu.programa_id = p.id
                AND pu.unidad_medica_id = $2::integer
            )
          )
        )
      LIMIT 1
    `, [codigo, unidadMedicaId]);
    return rows[0] ?? null;
  }

  private async resolverUnidadMedicaId(cluesInput: unknown): Promise<number | null> {
    const clues = String(cluesInput ?? '').trim().toUpperCase();
    if (!clues) return null;
    const { rows } = await pool.query<{ id: number }>(`
      SELECT id
      FROM public.unidad_medica
      WHERE UPPER(TRIM(cluesimb)) = $1
         OR UPPER(TRIM(cluessa)) = $1
      ORDER BY CASE WHEN UPPER(TRIM(cluesimb)) = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `, [clues]);
    return rows[0] ? Number(rows[0].id) : null;
  }

  private mapearInsumo(row: InsumoRow): ProgramaPreventivoInsumo {
    return {
      clave: row.clave,
      nombre: row.nombre,
      descripcion: row.descripcion,
      presentacion: row.presentacion,
      obligatorio: Boolean(row.obligatorio),
      orden: Number(row.orden),
    };
  }

  private normalizarPrograma(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private normalizarClavePreventiva(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
  }
}
