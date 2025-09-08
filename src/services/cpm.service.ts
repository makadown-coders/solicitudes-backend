import { Pool } from 'pg';
import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import { PowerAutomateResponse } from '../models/powerAutomateResponse.model';
import { UnidadCpmParams } from '../models/unidad-cpm-params.model';
import { ExpectedVsParams } from '../models/expected-vs-params.model';

const pool = new Pool({
  user: process.env.POSTGRES_USERNAME,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10)
});

dotenv.config();

class CPMService {
    /**
     * En vias de deprecación, se dejará de usar este metodo para obtener CPMs desde Power Automate
     * y ahora se obtendrán de supabase.
     * @returns 
     */
    async obtenerCpmDePowerAutomate64(): Promise<string> {
        console.log('🔁 Obteniendo CPMs con Power Automate');

        let fila: any = null;
        try {
            // Hacer POST al flujo de Power Automate
            const response: AxiosResponse<PowerAutomateResponse> = await axios.post(
                process.env.AZURE_CPM_URL as string,
                { claveSecreta: process.env.AZURE_PAYLOAD_SECRET },
                { headers: { 'Content-Type': 'application/json' } }
            );

            if (!response.data?.archivo) {
                console.error('❌ No se recibió el archivo base64 en la respuesta.');
                return;
            }

            console.log(`✅ Cpm en Base64 cargado desde Power Automate.`);
            return response.data.archivo;

        } catch (err: any) {
            console.error('❌ Error al ejecutar el seed de citas:', err);
            console.log('🔁 Procesando fila:', fila);
        }
        return null;
    }

    /**
  * Emula:
  *  SELECT * FROM v_unidad_kit_claves_expected_vs_cpm WHERE cluesimb = $1;
  *  + filtros opcionales: kit, clave; también admite cluessa si lo prefieres.
  */
    async getExpectedVsCpm(p: ExpectedVsParams) {
        if (!p.cluesimb && !p.cluessa) {
            throw new Error('Parámetro requerido: cluesimb o cluessa');
        }

        const params: any[] = [];
        const where: string[] = [];

        if (p.cluesimb) {
            params.push(p.cluesimb);
            where.push(`v.cluesimb = $${params.length}`);
        }
        if (p.cluessa) {
            params.push(p.cluessa);
            where.push(`v.cluessa = $${params.length}`);
        }
        if (p.kit) {
            params.push(p.kit);
            where.push(`v.kit_codigo = $${params.length}`);
        }
        if (p.clave) {
            params.push(p.clave);
            where.push(`v.clave_cnis = $${params.length}`);
        }

        const limit = Math.min(Math.max(p.limit ?? 5000, 1), 10000);
        const offset = Math.max(p.offset ?? 0, 0);
        params.push(limit);
        params.push(offset);

        const sql = `
      SELECT
        v.unidad_medica_id, v.cluesimb, v.cluessa, v.nombre_unidad,
        v.nombre_tipologia, v.kit_codigo, v.clave_cnis, v.cpm, v.en_cpm
      FROM public.v_unidad_kit_claves_expected_vs_cpm v
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY v.kit_codigo, v.clave_cnis
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

        const { rows } = await pool.query(sql, params);
        return rows;
    }

    /**
     * Emula:
     *  SELECT * FROM v_unidad_cpm WHERE cluesimb = $1 AND cpm > 0;
     * También admite 'cluessa' (hace join para resolver la cluesimb).
     */
    async getUnidadCpmGt0(p: UnidadCpmParams) {
        if (!p.cluesimb && !p.cluessa) {
            throw new Error('Parámetro requerido: cluesimb o cluessa');
        }

        const params: any[] = [];
        let sql: string;

        if (p.cluesimb) {
            params.push(p.cluesimb);
            sql = `
        SELECT v.unidad_medica_id, v.cluesimb, v.nombre_unidad, v.clave_cnis, v.cpm
        FROM public.v_unidad_cpm v
        WHERE v.cluesimb = $1 AND v.cpm > 0
        ORDER BY v.clave_cnis
      `;
        } else {
            // buscar por CLUESSA: unimos para resolver la CLUESIMB
            params.push(p.cluessa);
            sql = `
        SELECT v.unidad_medica_id, v.cluesimb, v.nombre_unidad, v.clave_cnis, v.cpm
        FROM public.v_unidad_cpm v
        JOIN public.unidad_medica um ON um.cluesimb = v.cluesimb
        WHERE um.cluessa = $1 AND v.cpm > 0
        ORDER BY v.clave_cnis
      `;
        }

        const { rows } = await pool.query(sql, params);
        return rows;
    }
}


export default CPMService;