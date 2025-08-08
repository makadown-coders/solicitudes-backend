/* /src/services/cargaMasiva.service.ts  */
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
});

class CargaMasivaService {

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

        // 1) Precargar alias
        const aliasMap = await this.precargarAlias();

        // 2) Mapear origen/destino por texto → id
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

        // 3) Insertar
        const columnas = Object.keys(datos[0]);
        const registros = datos.map(obj => columnas.map(col => obj[col] ?? null));
        await this.insertarBatch(tabla, columnas, registros);
    }

    // 🔹 NUEVO: Inventario Inicial
    /**
     * datos: array de objetos desde el front. Se espera algo como:
     * {
     *   unidad: string,   // texto (CLUES, alias_sas o nombre)
     *   partida?: string,
     *   articulo: string, // clave CNIS
     *   lote?: string,
     *   fecha_caducidad?: string (YYYY-MM-DD),
     *   tipo?: string,
     *   cantidades: number,
     *   costo?: number
     * }
     * anio: número (e.g., 2025)
     * resetAnio: si true, borra inventario_inicial de ese año antes de insertar
     */
    async insertarInventarioInicial(datos: any[], anio: number, resetAnio = true) {
        if (!datos?.length) return;

        const aliasMap = await this.precargarAlias();

        // Normalizar/Mapear columnas a la tabla inventario_inicial
        const normalizados = datos.map(d => {
            const unidadTexto = (d.unidad ?? '').toString().trim();
            const unidadKey = unidadTexto.toLowerCase();
            const unidad_id = aliasMap.get(unidadKey) ?? null;

            return {
                unidad_id,
                unidad_texto: unidad_id ? null : (unidadTexto || null),
                partida: d.partida ?? null,
                clave_cnis: d.articulo ?? null,
                descripcion: d.descripcion ?? null, // el excel no la trae; puedes calcularla si gustas
                lote: d.lote ?? null,
                fecha_caducidad: d.fecha_caducidad ?? null, // ya la mandas yyyy-mm-dd desde front
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

            // Si quieres UPSERT por (anio, unidad_id/lote/clave):
            // await client.query(`
            //   INSERT INTO inventario_inicial(${columnas.join(',')})
            //   VALUES ${/* placeholders… */''}
            //   ON CONFLICT (anio, clave_cnis, lote, unidad_id) DO UPDATE SET
            //     cantidad = EXCLUDED.cantidad,
            //     costo    = EXCLUDED.costo
            // `, flatValues);

            // Por ahora, insert simple:
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
}

export default CargaMasivaService;
