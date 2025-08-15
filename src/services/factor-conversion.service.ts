// src/services/factor-conversion.service.ts
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

export interface FactorConversion {
    clave: string;
    en_dispensacion: boolean;
    cantidad_fc: number;
    cluesimb?: string; // opcional, solo informativo si vino por unidad
}

class FactorConversionService {
    async obtenerPorClave(clave: string): Promise<FactorConversion> {
        const { rows } = await pool.query(
            `SELECT clave,
              COALESCE(en_dispensacion, 0) AS en_dispensacion,
              COALESCE(cantidad_fc, 1)    AS cantidad_fc
       FROM factores_conversion
       WHERE clave = $1
       LIMIT 1`,
            [clave]
        );
        if (!rows.length) {
            return { clave, en_dispensacion: false, cantidad_fc: 1 };
        }
        const r = rows[0];
        return {
            clave: r.clave,
            en_dispensacion: !!Number(r.en_dispensacion),
            cantidad_fc: Number(r.cantidad_fc) || 1
        };
    }

    // 👇 Nuevo: por clave + CLUES
    async obtenerPorClaveYClues(clave: string, clues: string): Promise<FactorConversion> {
        const q = `
      SELECT 
        f.clave,
        um.cluesimb,
        f.en_dispensacion,
        COALESCE(f.cantidad_fc, 1) AS cantidad_fc
      FROM factores_conversion f
      JOIN unidad_medica um ON um.cluesimb  = f.cluesimb
      WHERE f.clave = $1
        AND um.cluesimb = $2
      LIMIT 1;
    `;
        const { rows } = await pool.query(q, [clave, clues]);

        if (rows.length) {
            const r = rows[0];
            return {
                clave: r.clave,
                cluesimb: r.cluesimb,
                en_dispensacion: !!r.en_dispensacion,
                cantidad_fc: Number(r.cantidad_fc) || 1
            };
        }

        // regresar null 
        return null;

        // 🧯 fallback: usa el global
        // return this.obtenerPorClave(clave);
    }
}

export default FactorConversionService;
