/* /src/services/cargaMasiva.service.ts  */
import { Pool } from 'pg';
import { Readable } from 'stream';
import { from as copyFrom } from 'pg-copy-streams';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});

type TipoMov = 'entradas' | 'traspasos' | 'salidas';

class CargaMasivaService {
  // ======== tus métodos EXISTENTES (no se tocan) ========
  async limpiarTabla(tabla: string) {
    await pool.query(`TRUNCATE TABLE ${tabla} RESTART IDENTITY CASCADE;`);
  }

  async insertarBatch(tabla: string, columnas: string[], registros: any[][]) {
    if (registros.length === 0) return;

    const placeholders = registros
      .map((_, i) => `(${columnas.map((_, j) => `$${i * columnas.length + j + 1}`).join(',')})`)
      .join(',');

    const flatValues = registros.flat();

    await pool.query(
      `INSERT INTO ${tabla} (${columnas.join(',')}) VALUES ${placeholders}`,
      flatValues
    );
  }

  async insertarBatchGenerico(tabla: string, datos: any[]) {
    if (!datos.length) return;

    // sigue disponible por compatibilidad
    const aliasMap = await this.precargarAlias();
    for (const row of datos) {
      if (row.unidad_origen_texto) {
        const key = row.unidad_origen_texto.toLowerCase().trim();
        row.unidad_origen_id = aliasMap.get(key) ?? null;
      }
      if (row.unidad_destino_texto) {
        const key = row.unidad_destino_texto.toLowerCase().trim();
        row.unidad_destino_id = aliasMap.get(key) ?? null;
      }
    }

    const columnas = Object.keys(datos[0]);
    const registros = datos.map(obj => columnas.map(col => obj[col] ?? null));
    await this.insertarBatch(tabla, columnas, registros);
  }

  async insertarInventarioInicial(datos: any[], anio: number, resetAnio = true) {
    if (!datos?.length) return;

    const aliasMap = await this.precargarAlias();
    const normalizados = datos.map(d => {
      const unidadTexto = (d.unidad ?? '').toString().trim();
      const unidadKey = unidadTexto.toLowerCase();
      const unidad_id = aliasMap.get(unidadKey) ?? null;

      return {
        unidad_id,
        unidad_texto: unidad_id ? null : (unidadTexto || null),
        partida: d.partida ?? null,
        clave_cnis: d.articulo ?? null,
        descripcion: d.descripcion ?? null,
        lote: d.lote ?? null,
        fecha_caducidad: d.fecha_caducidad ?? null,
        tipo: d.tipo ?? null,
        cantidad: d.cantidades ?? null,
        costo: d.costo ?? null,
        anio,
      };
    });

    const columnas = [
      'unidad_id', 'unidad_texto', 'partida', 'clave_cnis', 'descripcion',
      'lote', 'fecha_caducidad', 'tipo', 'cantidad', 'costo', 'anio'
    ];
    const registros = normalizados.map(n => columnas.map(c => (n as any)[c] ?? null));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (resetAnio) {
        await client.query(`DELETE FROM inventario_inicial WHERE anio = $1`, [anio]);
      }
      await this.insertarBatch('inventario_inicial', columnas, registros);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async precargarAlias(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const { rows } = await pool.query(`
      SELECT id, LOWER(alias_sas) AS alias_sas, LOWER(alias_dash) AS alias_dash
      FROM unidad_medica_alias
    `);
    rows.forEach(r => {
      if (r.alias_sas) map.set(r.alias_sas.trim(), r.id);
      if (r.alias_dash) map.set(r.alias_dash.trim(), r.id);
    });
    return map;
  }

  // ======== NUEVO: camino rápido para entradas/traspasos/salidas ========

  /** Crea la tabla temporal según el tipo y la dropea al COMMIT */
  private tempDDL(tipo: TipoMov): string {
    if (tipo === 'entradas') {
      return `
        CREATE TEMP TABLE tmp_entradas (
          unidad_destino_texto text,
          clave_cnis text,
          descripcion text,
          num_factura text,
          folio text,
          proveedor text,
          cantidad numeric,
          costo numeric,
          fecha date,
          tipo_documento text,
          num_remision text,
          observaciones text,
          anio int,
          lote text,
          fecha_caducidad date,
          cantidad_existencia numeric,
          descripcion_extra text
        ) ON COMMIT DROP;
      `;
    }
    if (tipo === 'traspasos') {
      return `
        CREATE TEMP TABLE tmp_traspasos (
          fecha_recepcion date,
          folio text,
          unidad_origen_texto text,
          clave_cnis text,
          descripcion text,
          cantidad numeric,
          total numeric,
          unidad_destino_texto text,
          lote text,
          fecha_caducidad date,
          partida text
        ) ON COMMIT DROP;
      `;
    }
    // salidas
    return `
      CREATE TEMP TABLE tmp_salidas (
        unidad_origen_texto text,
        unidad_destino_texto text,
        folio text,
        clave_cnis text,
        cantidad numeric,
        total numeric,
        programa text,
        fecha_entregado date,
        tipo text,
        folio_extra text,
        movto text,
        descripcion text,
        programa_extra text,
        lote text,
        fecha_caducidad date
      ) ON COMMIT DROP;
    `;
  }

  /** Serializa una fila a CSV (NULL -> \N, limpia saltos/comas) */
  private toCSVLine(values: any[]): string {
    return values.map(v => {
      if (v === null || v === undefined) return '\\N';
      const s = String(v);
      return s.replace(/\r?\n/g, ' ').replace(/,/g, ' ').trim();
    }).join(',') + '\n';
  }

  /** Orden de columnas esperado por tipo, mapea objeto -> arreglo */
  private rowFromObj(tipo: TipoMov, o: any): any[] {
    if (tipo === 'entradas') {
      return [
        o.unidad_destino_texto ?? null,
        o.clave_cnis ?? null,
        o.descripcion ?? null,
        o.num_factura ?? null,
        o.folio ?? null,
        o.proveedor ?? null,
        o.cantidad ?? null,
        o.costo ?? null,
        o.fecha ?? null,
        o.tipo_documento ?? null,
        o.num_remision ?? null,
        o.observaciones ?? null,
        o.anio ?? null,
        o.lote ?? null,
        o.fecha_caducidad ?? null,
        o.cantidad_existencia ?? null,
        o.descripcion_extra ?? null
      ];
    }
    if (tipo === 'traspasos') {
      return [
        o.fecha_recepcion ?? null,
        o.folio ?? null,
        o.unidad_origen_texto ?? null,
        o.clave_cnis ?? null,
        o.descripcion ?? null,
        o.cantidad ?? null,
        o.total ?? null,
        o.unidad_destino_texto ?? null,
        o.lote ?? null,
        o.fecha_caducidad ?? null,
        o.partida ?? null
      ];
    }
    // salidas
    return [
      o.unidad_origen_texto ?? null,
      o.unidad_destino_texto ?? null,
      o.folio ?? null,
      o.clave_cnis ?? null,
      o.cantidad ?? null,
      o.total ?? null,
      o.programa ?? null,
      o.fecha_entregado ?? null,
      o.tipo ?? null,
      o.folio_extra ?? null,
      o.movto ?? null,
      o.descripcion ?? null,
      o.programa_extra ?? null,
      o.lote ?? null,
      o.fecha_caducidad ?? null
    ];
  }

  /**
   * Camino rápido: COPY -> temp -> INSERT ... SELECT con JOIN a alias
   * No toca inventario inicial; solo entradas/traspasos/salidas.
   */
  async copiarYVolcar(tipo: TipoMov, datos: any[]): Promise<void> {
    if (!datos?.length) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) temp table
      await client.query(this.tempDDL(tipo));

      // 2) COPY a temp
      const copySql =
        tipo === 'entradas'
          ? `COPY tmp_entradas FROM STDIN WITH (FORMAT csv, DELIMITER ',', NULL '\\N')`
          : tipo === 'traspasos'
          ? `COPY tmp_traspasos FROM STDIN WITH (FORMAT csv, DELIMITER ',', NULL '\\N')`
          : `COPY tmp_salidas FROM STDIN WITH (FORMAT csv, DELIMITER ',', NULL '\\N')`;

      const copyStream = client.query(copyFrom(copySql));
      const rs = Readable.from(datos.map(o => this.toCSVLine(this.rowFromObj(tipo, o))));
      await new Promise<void>((resolve, reject) => {
        rs.pipe(copyStream).on('finish', resolve).on('error', reject);
      });

      // 3) alias_flat para unir alias_sas y alias_dash
      const cteAlias = `
        WITH alias_flat AS (
          SELECT id, LOWER(alias_sas) AS alias FROM unidad_medica_alias WHERE alias_sas IS NOT NULL
          UNION ALL
          SELECT id, LOWER(alias_dash) AS alias FROM unidad_medica_alias WHERE alias_dash IS NOT NULL
        )
      `;

      // 4) INSERT ... SELECT con JOIN a alias (mapeo en SQL)
      if (tipo === 'entradas') {
        await client.query(`
          ${cteAlias}
          INSERT INTO entradas (
            unidad_destino_id, clave_cnis, descripcion, num_factura, folio, proveedor,
            cantidad, costo, fecha, tipo_documento, num_remision, observaciones,
            anio, lote, fecha_caducidad, cantidad_existencia, descripcion_extra
          )
          SELECT
            ad.id AS unidad_destino_id,
            t.clave_cnis,
            t.descripcion,
            t.num_factura,
            t.folio,
            t.proveedor,
            t.cantidad,
            t.costo,
            t.fecha,
            t.tipo_documento,
            t.num_remision,
            t.observaciones,
            t.anio,
            t.lote,
            t.fecha_caducidad,
            t.cantidad_existencia,
            t.descripcion_extra
          FROM tmp_entradas t
          LEFT JOIN alias_flat ad ON ad.alias = LOWER(t.unidad_destino_texto)
        `);
      } else if (tipo === 'traspasos') {
        await client.query(`
          ${cteAlias}
          INSERT INTO traspasos (
            fecha_recepcion, folio, unidad_origen_id, clave_cnis, descripcion,
            cantidad, total, unidad_destino_id, lote, fecha_caducidad, partida
          )
          SELECT
            t.fecha_recepcion,
            t.folio,
            ao.id AS unidad_origen_id,
            t.clave_cnis,
            t.descripcion,
            t.cantidad,
            t.total,
            ad.id AS unidad_destino_id,
            t.lote,
            t.fecha_caducidad,
            t.partida
          FROM tmp_traspasos t
          LEFT JOIN alias_flat ao ON ao.alias = LOWER(t.unidad_origen_texto)
          LEFT JOIN alias_flat ad ON ad.alias = LOWER(t.unidad_destino_texto)
        `);
      } else {
        await client.query(`
          ${cteAlias}
          INSERT INTO salidas (
            unidad_origen_id, unidad_destino_id, folio, clave_cnis, cantidad, total,
            programa, fecha_entregado, tipo, folio_extra, movto, descripcion,
            programa_extra, lote, fecha_caducidad
          )
          SELECT
            ao.id AS unidad_origen_id,
            ad.id AS unidad_destino_id,
            t.folio,
            t.clave_cnis,
            t.cantidad,
            t.total,
            t.programa,
            t.fecha_entregado,
            t.tipo,
            t.folio_extra,
            t.movto,
            t.descripcion,
            t.programa_extra,
            t.lote,
            t.fecha_caducidad
          FROM tmp_salidas t
          LEFT JOIN alias_flat ao ON ao.alias = LOWER(t.unidad_origen_texto)
          LEFT JOIN alias_flat ad ON ad.alias = LOWER(t.unidad_destino_texto)
        `);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export default CargaMasivaService;
