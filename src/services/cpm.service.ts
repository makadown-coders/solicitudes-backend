import axios, { AxiosResponse } from 'axios';
import { PowerAutomateResponse } from '../models/powerAutomateResponse.model';
import { UnidadCpmParams } from '../models/unidad-cpm-params.model';
import { ExpectedVsParams } from '../models/expected-vs-params.model';
import { pool } from '../db/pool';

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
    async getUnidadCpmGt0(params: UnidadCpmParams) {
        const { cluesimb, cluessa } = params || {};
        let sql = '';
        let values: any[] = [];

        if (cluesimb) {
            sql = `
      SELECT c.clave_cnis, c.cpm, c.fuente
      FROM public.v_cpm_bc c
      WHERE upper(c.cluesimb) = upper($1) AND c.cpm > 0
      ORDER BY c.clave_cnis
    `;
            values = [cluesimb];
        } else if (cluessa) {
            sql = `
      SELECT c.clave_cnis, c.cpm, c.fuente
      FROM public.v_cpm_bc c
      WHERE upper(c.cluessa) = upper($1) AND c.cpm > 0
      ORDER BY c.clave_cnis
    `;
            values = [cluessa];
        } else {
            throw new Error('Se requiere cluesimb o cluessa');
        }

        const { rows } = await pool.query(sql, values);
        return rows;
    }

    async getUnidadCpmAll(params: UnidadCpmParams): Promise<any[]> {
        const { cluesimb, cluessa } = params || {};
        let sql = '';
        let values: any[] = [];

        if (cluesimb) {
            sql = `
      SELECT c.clave_cnis, c.cpm, c.fuente
      FROM public.v_cpm_bc c
      WHERE upper(c.cluesimb) = upper($1)
      ORDER BY c.clave_cnis
    `;
            values = [cluesimb];
        } else if (cluessa) {
            sql = `
      SELECT c.clave_cnis, c.cpm, c.fuente
      FROM public.v_cpm_bc c
      WHERE upper(c.cluessa) = upper($1)
      ORDER BY c.clave_cnis
    `;
            values = [cluessa];
        } else {
            throw new Error('Se requiere cluesimb o cluessa');
        }

        const { rows } = await pool.query(sql, values);
        return rows;
    }

    async upsertOne(
        umIdent: string,
        clave: string,
        cpm: number | string,
        fuente: string = 'manual'
    ): Promise<void> {
        const um = (umIdent ?? '').trim();
        const k = (clave ?? '').trim();
        const val = Number(cpm);

        if (!um || !k || Number.isNaN(val)) {
            throw new Error('umIdent, clave y cpm válidos son requeridos');
        }
        if (val < 0) {
            throw new Error('cpm debe ser >= 0');
        }

        await pool.query(
            'SELECT public.fn_upsert_cpm_bc($1,$2,$3,$4)',
            [um, k, val, (fuente ?? 'manual').trim() || 'manual']
        );
    }

    async upsertBatch(umIdent: string, items: { clave: string; cpm: number; fuente?: string }[]): Promise<number> {
        if (!umIdent) throw new Error('umIdent requerido');
        if (!Array.isArray(items) || items.length === 0) throw new Error('items[] requerido');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const it of items) {
                if (!it?.clave || it.cpm === undefined || it.cpm === null) continue;
                await client.query('SELECT public.fn_upsert_cpm_bc($1,$2,$3,$4)', [
                    umIdent,
                    it.clave,
                    it.cpm,
                    it.fuente ?? 'manual',
                ]);
            }
            await client.query('COMMIT');
            return items.length;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}


export default CPMService;