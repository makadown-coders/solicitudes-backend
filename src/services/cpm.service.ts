// src/services/cpm.service.ts (BACKEND)
import axios, { AxiosResponse } from 'axios';
import { PowerAutomateResponse } from '../models/powerAutomateResponse.model';
import { UnidadCpmParams } from '../models/unidad-cpm-params.model';
import { ExpectedVsParams } from '../models/expected-vs-params.model';
import { pool } from '../db/pool';
import e from 'express';

class CPMService {
    /**
     * En vias de deprecación, se dejará de usar este metodo para obtener CPMs desde Power Automate
     * y ahora se obtendrán de supabase.
     * @returns 
     */
    async obtenerCpmDePowerAutomate64(): Promise<string> {

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

            return response.data.archivo;

        } catch (err: any) {
            console.error('❌ Error al ejecutar el seed de citas:', err);
            console.log('🔁 Procesando fila:', fila);
        }
        return null;
    }

    /*
     dado el cluesimb, emula:
     DELETE from public.cpm 
        where exists ( Select 1 
                from unidad_medica um 
                where um.cluesimb = $1 and um.id = cpm.unidad_medica_id ); 
    */
    async initCluesCpmReset(cluesimb: string): Promise<{ ok: boolean; deletedRows: number }> {
        if (!cluesimb || !cluesimb.trim()) {
            throw new Error('cluesimb es requerido');
        }
        const { rows } = await pool.query(
            `DELETE from public.cpm 
            where exists ( Select 1 
                    from unidad_medica um 
                    where um.cluesimb = $1 and um.id = cpm.unidad_medica_id );`,
            [cluesimb]
        );
        return { ok: true, deletedRows: rows.length };
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
            // where.push(`v.kit_codigo = $${params.length}`);
            where.push(`$${params.length} = ANY(v.kit_codigos)`);
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
         v.unidad_medica_id, 
         v.cluesimb, v.cluessa, v.nombre_unidad,
         v.nombre_tipologia, v.kit_codigo,
         v.kit_ids, v.kit_codigos,
         v.kit_codigos_txt, v.clave_cnis,
         coalesce(v.cpm,0) as cpm,
         v.en_cpm
      FROM public.v_unidad_kit_claves_expected_vs_cpm_v2 v
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY v.kit_codigo, v.clave_cnis
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `; /* omito usar v_unidad_kit_claves_expected_vs_cpm por ahora */

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

    async getRutasSaludClaves(kits?: string[]): Promise<string[]> {
        // Kits por defecto, si no mandas nada
        const kitsFiltro = (kits && kits.length > 0)
            ? kits
            : null;

        if (kitsFiltro) {
            /*
            el query base es 

            select distinct kc.clave as clave_cnis 
                from public.kit_clave kc 
                order by kc.clave 

            PERO como el kit mandado al backend es el campo 'codigo' de la tabla 'kit', y la relación entre kit y clave está en la tabla 'kit_clave', el query real que necesito hacer es algo así como:

select distinct kc.clave as clave_cnis 
                from public.kit_clave kc 
                join public.kit k on k.id = kc.kit_id
                where k.codigo in ($1)
                order by kc.clave

             pero necesito que se filtre por kits.
             */
            const sql = `
                select distinct kc.clave as clave_cnis 
                from public.kit_clave kc 
                join public.kit k on k.id = kc.kit_id
                where k.codigo = ANY($1)
                order by kc.clave
            `;
            console.log('SQL para getRutasSaludClaves con filtro de kits:', sql, 'kitsFiltro:', kitsFiltro);

            const { rows } = await pool.query<{ clave_cnis: string }>(sql, [kitsFiltro]);
            return rows.map(r => r.clave_cnis);
        } else {
            // Si no hay filtro de kits, devolver todas las claves en rutas de salud
            const sql = `
                select distinct kc.clave as clave_cnis 
                from public.kit_clave kc 
                order by kc.clave 
                `;
            const { rows } = await pool.query<{ clave_cnis: string }>(sql);
            return rows.map(r => r.clave_cnis);
        }

    }

    /**
     * LEGACY... Este metodo está "en la banca".
     * Se dejará por si acaso se llegue a restringir los kits por cpm por unidad.
     * @param kits 
     * @returns 
     */
    async getRutasSaludClavesVista(kits?: string[]): Promise<string[]> {
        // Kits por defecto, si no mandas nada
        const kitsFiltro = (kits && kits.length > 0)
            ? kits
            : null;

        /* const sql = `
       SELECT DISTINCT v.clave_cnis
       FROM public.v_unidad_kit_claves_expected_vs_cpm v
       WHERE v.en_cpm = true
         AND v.kit_codigo = ANY($1::text[])
       ORDER BY v.clave_cnis
     `;*/
        if (kitsFiltro) {
            const sql = `
                    SELECT DISTINCT v.clave_cnis
                    FROM public.v_unidad_kit_claves_expected_vs_cpm v
                    WHERE v.kit_codigos && $1::text[]
                    ORDER BY v.clave_cnis
                    `; // && = “comparten al menos un kit”.            

            const { rows } = await pool.query<{ clave_cnis: string }>(sql, [kitsFiltro]);
            return rows.map(r => r.clave_cnis);
        } else {
            // Si no hay filtro de kits, devolver todas las claves en rutas de salud
            const sql = `
                SELECT DISTINCT v.clave_cnis
                FROM public.v_unidad_kit_claves_expected_vs_cpm v                
                ORDER BY v.clave_cnis
                `;
            const { rows } = await pool.query<{ clave_cnis: string }>(sql);
            return rows.map(r => r.clave_cnis);
        }
    }
}


export default CPMService;