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
  descripcion: string | null;
  presentacion: string | null;
  obligatorio: boolean;
  orden: number;
};

export class ProgramaPreventivoNoEncontradoError extends Error {
  constructor() {
    super('Programa preventivo no encontrado');
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
  async listar(): Promise<ProgramasPreventivosResponse> {
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
      GROUP BY p.id, p.codigo, p.nombre, p.descripcion, p.orden
      ORDER BY p.orden, p.nombre
    `);

    const items: ProgramaPreventivoResumen[] = rows.map(row => ({
      codigo: row.codigo,
      nombre: row.nombre,
      descripcion: row.descripcion,
      orden: Number(row.orden),
      totalInsumos: Number(row.total_insumos),
    }));
    return { items };
  }

  async obtenerDetalle(codigoInput: string): Promise<ProgramaPreventivoDetalle | null> {
    const codigo = this.normalizarPrograma(codigoInput);
    if (!codigo) throw new ProgramaPreventivoValidacionError('programa requerido');

    const programa = await this.obtenerProgramaActivo(codigo);
    if (!programa) return null;

    const { rows } = await pool.query<InsumoRow>(`
      SELECT
        clave,
        descripcion,
        presentacion,
        obligatorio,
        orden::integer AS orden
      FROM preventivos.v_programa_insumo
      WHERE programa_codigo = $1
        AND activo = true
      ORDER BY orden, clave
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
    if (!Array.isArray(input?.insumos) || input.insumos.length < 1 || input.insumos.length > 500) {
      throw new ProgramaPreventivoValidacionError('La lista debe contener entre 1 y 500 insumos');
    }

    const programa = await this.obtenerProgramaActivo(codigo);
    if (!programa) throw new ProgramaPreventivoNoEncontradoError();

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

  private async obtenerProgramaActivo(codigo: string): Promise<ProgramaRow | null> {
    const { rows } = await pool.query<ProgramaRow>(`
      SELECT id, codigo, nombre, descripcion, orden::integer AS orden
      FROM preventivos.programa
      WHERE codigo = $1
        AND activo = true
      LIMIT 1
    `, [codigo]);
    return rows[0] ?? null;
  }

  private mapearInsumo(row: InsumoRow): ProgramaPreventivoInsumo {
    return {
      clave: row.clave,
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
    return String(value ?? '').trim().toUpperCase().replace(/\.00$/, '');
  }
}
