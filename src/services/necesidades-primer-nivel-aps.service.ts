import { pool } from '../db/pool';
import { ApsCatalogoQuery } from '../models/solicitudes/aps/ApsCatalogoQuery';
import { ApsEstructura } from '../models/solicitudes/aps/ApsEstructura';
import { ApsMedicamentoDetalle, ApsVariante } from '../models/solicitudes/aps/ApsMedicamentoDetalle';
import { ApsMedicamentosPaginados } from '../models/solicitudes/aps/ApsMedicamentoResumen';
import {
  ResolverNecesidadesApsInput,
  ResolverNecesidadesApsResult,
} from '../models/solicitudes/aps/ResolverNecesidadesAps';

type EstructuraRow = {
  eje_codigo: string;
  eje_nombre: string;
  grupo_numero: number;
  grupo_nombre: string;
  total_medicamentos: string | number;
};

type MedicamentoRow = {
  codigo: string;
  etiqueta: string;
  grupo_numero: number;
  grupo_nombre: string;
  eje_codigo: string;
  eje_nombre: string;
  principales: string | number;
  coincidentes: string | number;
};

type TotalRow = { total: string | number };

type MedicamentoBaseRow = {
  id: string;
  codigo: string;
  etiqueta: string;
  grupo_numero: number;
  grupo_nombre: string;
  eje_codigo: string;
  eje_nombre: string;
};

type VarianteRow = {
  medicamento_id: string;
  clave: string;
  clave_normalizada: string;
  nombre_catalogo: string | null;
  descripcion_catalogo: string | null;
  origen_catalogo: string;
};

type MedicamentoDetalleRow = MedicamentoBaseRow & {
  clave: string | null;
  clave_normalizada: string | null;
  nombre_catalogo: string | null;
  descripcion_catalogo: string | null;
  origen_catalogo: string | null;
};

export default class NecesidadesPrimerNivelApsService {
  async obtenerEstructura(): Promise<ApsEstructura> {
    const { rows } = await pool.query<EstructuraRow>(`
      SELECT
        ea.codigo AS eje_codigo,
        ea.nombre AS eje_nombre,
        g.numero::integer AS grupo_numero,
        g.nombre AS grupo_nombre,
        COUNT(m.id)::integer AS total_medicamentos
      FROM aps.eje_atencion ea
      INNER JOIN aps.grupo g
        ON g.eje_id = ea.id
       AND g.activo = true
      LEFT JOIN aps.medicamento m
        ON m.grupo_id = g.id
       AND m.activo = true
      WHERE ea.activo = true
      GROUP BY ea.id, ea.codigo, ea.nombre, ea.orden, g.id, g.numero, g.nombre
      ORDER BY ea.orden, g.numero
    `);

    const porEje = new Map<string, ApsEstructura[number]>();
    for (const row of rows) {
      let eje = porEje.get(row.eje_codigo);
      if (!eje) {
        eje = { ejeCodigo: row.eje_codigo, ejeNombre: row.eje_nombre, grupos: [] };
        porEje.set(row.eje_codigo, eje);
      }
      eje.grupos.push({
        numero: Number(row.grupo_numero),
        nombre: row.grupo_nombre,
        totalMedicamentos: Number(row.total_medicamentos),
      });
    }
    return [...porEje.values()];
  }

  async listarMedicamentos(query: ApsCatalogoQuery): Promise<ApsMedicamentosPaginados> {
    const q = String(query.q ?? '').trim().slice(0, 200);
    const eje = String(query.eje ?? '').trim().toUpperCase().slice(0, 80);
    const grupo = query.grupo === undefined ? null : Number(query.grupo);
    const page = this.enteroEnRango(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = this.enteroEnRango(query.pageSize, 30, 1, 100);

    if (grupo !== null && (!Number.isInteger(grupo) || grupo < 1)) {
      throw new Error('grupo debe ser un entero positivo');
    }

    const offset = (page - 1) * pageSize;
    const filtros = `
      FROM aps.medicamento m
      INNER JOIN aps.grupo g ON g.id = m.grupo_id AND g.activo = true
      INNER JOIN aps.eje_atencion ea ON ea.id = g.eje_id AND ea.activo = true
      LEFT JOIN aps.medicamento_clave mc ON mc.medicamento_id = m.id AND mc.activo = true
      WHERE m.activo = true
        AND ($1::text = '' OR m.etiqueta_usuario ILIKE '%' || $1 || '%' OR g.nombre ILIKE '%' || $1 || '%')
        AND ($2::integer IS NULL OR g.numero = $2)
        AND ($3::text = '' OR UPPER(TRIM(ea.codigo)) = $3)
    `;
    const [itemsResult, totalResult] = await Promise.all([
      pool.query<MedicamentoRow>(`
      SELECT
        m.codigo,
        m.etiqueta_usuario AS etiqueta,
        g.numero::integer AS grupo_numero,
        g.nombre AS grupo_nombre,
        ea.codigo AS eje_codigo,
        ea.nombre AS eje_nombre,
        COUNT(mc.clave) FILTER (WHERE mc.tipo_relacion = 'PRINCIPAL')::integer AS principales,
        COUNT(mc.clave) FILTER (WHERE mc.tipo_relacion = 'COINCIDENTE')::integer AS coincidentes
      ${filtros}
      GROUP BY m.id, m.codigo, m.etiqueta_usuario, m.orden_en_grupo,
               g.id, g.numero, g.nombre, ea.id, ea.codigo, ea.nombre, ea.orden
      ORDER BY ea.orden, g.numero, m.orden_en_grupo, m.codigo
      LIMIT $4 OFFSET $5
      `, [q, grupo, eje, pageSize, offset]),
      pool.query<TotalRow>(`SELECT COUNT(DISTINCT m.id)::integer AS total ${filtros}`, [q, grupo, eje]),
    ]);
    const rows = itemsResult.rows;

    return {
      items: rows.map(row => {
        const principales = Number(row.principales);
        return {
          codigo: row.codigo,
          etiqueta: row.etiqueta,
          grupo: { numero: Number(row.grupo_numero), nombre: row.grupo_nombre },
          eje: { codigo: row.eje_codigo, nombre: row.eje_nombre },
          numeroClavesPrincipales: principales,
          numeroClavesCoincidentes: Number(row.coincidentes),
          requiereSeleccionDeVariante: principales > 1,
        };
      }),
      page,
      pageSize,
      total: Number(totalResult.rows[0]?.total ?? 0),
    };
  }

  async obtenerMedicamento(codigoInput: string): Promise<ApsMedicamentoDetalle | null> {
    const codigo = this.normalizarCodigo(codigoInput);
    if (!codigo) throw new Error('codigo requerido');

    const { rows } = await pool.query<MedicamentoDetalleRow>(`
      SELECT
        m.id::text AS id,
        m.codigo,
        m.etiqueta_usuario AS etiqueta,
        g.numero::integer AS grupo_numero,
        g.nombre AS grupo_nombre,
        ea.codigo AS eje_codigo,
        ea.nombre AS eje_nombre,
        mc.clave,
        mc.clave_normalizada,
        i.nombre AS nombre_catalogo,
        i.descripcion AS descripcion_catalogo,
        mc.origen_catalogo
      FROM aps.medicamento m
      INNER JOIN aps.grupo g ON g.id = m.grupo_id AND g.activo = true
      INNER JOIN aps.eje_atencion ea ON ea.id = g.eje_id AND ea.activo = true
      LEFT JOIN aps.medicamento_clave mc
        ON mc.medicamento_id = m.id
       AND mc.activo = true
       AND mc.tipo_relacion = 'PRINCIPAL'
      LEFT JOIN cnis.insumo i ON i.id = mc.insumo_id AND i.activo = true
      WHERE m.activo = true
        AND m.codigo = $1
      ORDER BY mc.prioridad, mc.clave
    `, [codigo]);
    const medicamento = rows[0];
    if (!medicamento) return null;

    const opciones: ApsVariante[] = rows
      .filter(row => row.clave && row.clave_normalizada && row.origen_catalogo)
      .map(row => ({
        id: row.clave_normalizada!,
        clave: row.clave!,
        nombre: row.nombre_catalogo,
        descripcion: row.descripcion_catalogo,
        origenCatalogo: row.origen_catalogo!,
      }));
    return {
      codigo: medicamento.codigo,
      etiqueta: medicamento.etiqueta,
      grupo: { numero: Number(medicamento.grupo_numero), nombre: medicamento.grupo_nombre },
      eje: { codigo: medicamento.eje_codigo, nombre: medicamento.eje_nombre },
      requiereSeleccionDeVariante: opciones.length > 1,
      variantes: opciones,
    };
  }

  async resolver(input: ResolverNecesidadesApsInput): Promise<ResolverNecesidadesApsResult> {
    if (!Array.isArray(input?.medicamentos) || input.medicamentos.length < 1 || input.medicamentos.length > 500) {
      throw new Error('La lista debe contener entre 1 y 500 medicamentos');
    }

    const capturados = input.medicamentos.map((item, index) => {
      const codigo = this.normalizarCodigo(item?.codigo);
      const cantidad = Number(item?.cantidad);
      const claveSeleccionada = String(item?.claveSeleccionada ?? '').trim().toUpperCase();
      if (!codigo) throw new Error(`codigo requerido en medicamentos[${index}]`);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99999) {
        throw new Error(`Cantidad inválida para el medicamento ${codigo}`);
      }
      return { codigo, cantidad, claveSeleccionada };
    });

    const codigos = [...new Set(capturados.map(item => item.codigo))];
    const medicamentos = await this.obtenerMedicamentosActivos(codigos);
    const faltantes = codigos.filter(codigo => !medicamentos.has(codigo));
    if (faltantes.length) {
      throw new Error(`Medicamentos APS inexistentes o inactivos: ${faltantes.slice(0, 5).join(', ')}`);
    }

    const ids = [...medicamentos.values()].map(item => item.id);
    const variantes = await this.obtenerVariantesPrincipales(ids);
    const resueltos: ResolverNecesidadesApsResult['resueltos'] = [];
    const pendientes: ResolverNecesidadesApsResult['pendientes'] = [];
    const cantidadPorClave = new Map<string, number>();

    for (const item of capturados) {
      const medicamento = medicamentos.get(item.codigo)!;
      const opciones = variantes.get(medicamento.id) ?? [];
      if (!opciones.length) {
        throw new Error(`El medicamento ${item.codigo} no tiene una clave PRINCIPAL activa`);
      }

      let seleccionada: ApsVariante | undefined;
      if (opciones.length === 1) {
        seleccionada = opciones[0];
        if (item.claveSeleccionada && item.claveSeleccionada !== seleccionada.clave.toUpperCase()) {
          throw new Error(`La clave seleccionada no es PRINCIPAL del medicamento ${item.codigo}`);
        }
      } else if (item.claveSeleccionada) {
        seleccionada = opciones.find(opcion => opcion.clave.toUpperCase() === item.claveSeleccionada);
        if (!seleccionada) {
          throw new Error(`La clave seleccionada no es PRINCIPAL del medicamento ${item.codigo}`);
        }
      }

      if (!seleccionada) {
        pendientes.push({
          codigoMedicamento: medicamento.codigo,
          etiqueta: medicamento.etiqueta,
          motivo: 'REQUIERE_VARIANTE',
          opciones,
        });
        continue;
      }

      const claveNormalizada = seleccionada.clave.trim().toUpperCase();
      const cantidadAcumulada = (cantidadPorClave.get(claveNormalizada) ?? 0) + item.cantidad;
      if (cantidadAcumulada > 99999) {
        throw new Error(`La cantidad acumulada excede 99999 para la clave principal de ${item.codigo}`);
      }
      cantidadPorClave.set(claveNormalizada, cantidadAcumulada);

      resueltos.push({
        codigoMedicamento: medicamento.codigo,
        etiqueta: medicamento.etiqueta,
        clave: seleccionada.clave,
        cantidad: item.cantidad,
      });
    }

    const listoParaEnviar = pendientes.length === 0;
    return {
      resueltos,
      pendientes,
      listoParaEnviar,
    };
  }

  private async obtenerMedicamentosActivos(codigos: string[]): Promise<Map<string, MedicamentoBaseRow>> {
    if (!codigos.length) return new Map();
    const { rows } = await pool.query<MedicamentoBaseRow>(`
      SELECT
        m.id::text AS id,
        m.codigo,
        m.etiqueta_usuario AS etiqueta,
        g.numero::integer AS grupo_numero,
        g.nombre AS grupo_nombre,
        ea.codigo AS eje_codigo,
        ea.nombre AS eje_nombre
      FROM aps.medicamento m
      INNER JOIN aps.grupo g ON g.id = m.grupo_id AND g.activo = true
      INNER JOIN aps.eje_atencion ea ON ea.id = g.eje_id AND ea.activo = true
      WHERE m.activo = true
        AND m.codigo = ANY($1::text[])
    `, [codigos]);
    return new Map(rows.map(row => [this.normalizarCodigo(row.codigo), row]));
  }

  private async obtenerVariantesPrincipales(medicamentoIds: string[]): Promise<Map<string, ApsVariante[]>> {
    if (!medicamentoIds.length) return new Map();
    const { rows } = await pool.query<VarianteRow>(`
      SELECT
        medicamento_id::text AS medicamento_id,
        clave,
        clave_normalizada,
        nombre_catalogo,
        descripcion_catalogo,
        origen_catalogo
      FROM aps.v_medicamento_clave
      WHERE medicamento_id = ANY($1::bigint[])
        AND activo = true
        AND tipo_relacion = 'PRINCIPAL'
      ORDER BY medicamento_id, prioridad, clave
    `, [medicamentoIds]);

    const porMedicamento = new Map<string, ApsVariante[]>();
    for (const row of rows) {
      const opciones = porMedicamento.get(row.medicamento_id) ?? [];
      opciones.push({
        id: row.clave_normalizada,
        clave: row.clave,
        nombre: row.nombre_catalogo,
        descripcion: row.descripcion_catalogo,
        origenCatalogo: row.origen_catalogo,
      });
      porMedicamento.set(row.medicamento_id, opciones);
    }
    return porMedicamento;
  }

  private normalizarCodigo(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private enteroEnRango(value: unknown, fallback: number, min: number, max: number): number {
    const numero = Number(value ?? fallback);
    if (!Number.isInteger(numero)) return fallback;
    return Math.min(Math.max(numero, min), max);
  }
}
