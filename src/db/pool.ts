// src/db/pool.ts
import { Pool } from 'pg';

/**
 * Un solo pool de conexiones para toda la app para minimizar leaks.
 */
export const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});
