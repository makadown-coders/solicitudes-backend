/* /src/services/cargaMasiva.service.ts  */
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { EntradaDTO } from '../models/cargaMasiva/entrada.dto'; // no se usa
import { TraspasoDTO } from '../models/cargaMasiva/traspaso.dto'; // no se usa
import { SalidaDTO } from '../models/cargaMasiva/salida.dto'; // no se usa


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

        // 1️⃣ Precargar mapa de alias (solo si es necesario)
        const aliasMap = await this.precargarAlias();

        // 2️⃣ Asignar unidad_medica_id según corresponda
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

        // 3️⃣ Insertar
        const columnas = Object.keys(datos[0]);
        const registros = datos.map(obj => columnas.map(col => obj[col] ?? null));
        await this.insertarBatch(tabla, columnas, registros);
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
