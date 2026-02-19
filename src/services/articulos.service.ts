// src/services/articulos.service.ts
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import { pool } from '../db/pool';
import {
  Articulo,
  ArticuloCrud,
  ArticuloCrudCreateInput,
  ArticuloCrudUpdateInput
} from '../models/articulo.model';

// Promesa de base de datos tipada
const dbPromise: Promise<Database> = open({
  filename: process.env.DB_PATH ?? './db/articulos.sqlite',
  driver: sqlite3.Database
});

class ArticulosService {
  private async getDatabase(): Promise<Database> {
    return await dbPromise;
  }

  async buscar(query: string): Promise<{ resultados: Articulo[]; total: number }> {
    const db = await this.getDatabase();

    const sqlQuery = `
      SELECT clave, descripcion, presentacion
      FROM ARTICULOS
      WHERE clave LIKE ? OR descripcion LIKE ?
      LIMIT 12
    `;

    const sqlCount = `
      SELECT COUNT(*) as count
      FROM ARTICULOS
      WHERE clave LIKE ? OR descripcion LIKE ?
    `;

    const resultados: Articulo[] = await db.all(sqlQuery, [`%${query}%`, `%${query}%`]);
    const totalResult = await db.get<{ count: number }>(sqlCount, [`%${query}%`, `%${query}%`]);
    const total = totalResult?.count ?? 0;

    return { resultados, total };
  }


  async buscarAll(): Promise<{ resultados: Articulo[]; total: number }> {
    const db = await this.getDatabase();

    const sqlQuery = `
      SELECT clave, descripcion, presentacion
      FROM ARTICULOS
    `;

    const sqlCount = `
      SELECT COUNT(*) as count
      FROM ARTICULOS
    `;

    const resultados: Articulo[] = await db.all(sqlQuery);
    const totalResult = await db.get<{ count: number }>(sqlCount);
    const total = totalResult?.count ?? 0;

    return { resultados, total };
  }

  private buildPgWhere(q?: string) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    const search = String(q ?? '').trim();

    if (search.length > 0) {
      params.push(search);
      where += `
        AND (
          COALESCE(a.clave, '') ILIKE '%' || $1 || '%'
          OR COALESCE(a.descripcion, '') ILIKE '%' || $1 || '%'
          OR COALESCE(a.presentacion, '') ILIKE '%' || $1 || '%'
        )
      `;
    }

    return { where, params };
  }

  async listCrudPaged(opts: {
    q?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{ items: ArticuloCrud[]; page: number; pageSize: number; total: number }> {
    const pageSize = Math.min(Math.max(Number(opts.pageSize || 20), 1), 100);
    const page = Math.max(Number(opts.page || 1), 1);
    const offset = (page - 1) * pageSize;

    const sortColumns: Record<string, string> = {
      id: 'a.id',
      clave: 'a.clave',
      descripcion: 'a.descripcion',
      presentacion: 'a.presentacion',
    };

    const sortBy = sortColumns[String(opts.sortBy || 'id')] ?? sortColumns.id;
    const sortOrder = String(opts.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { where, params } = this.buildPgWhere(opts.q);
    const queryParams = [...params, pageSize, offset];
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const sql = `
      SELECT
        a.id,
        a.clave,
        a.descripcion,
        a.presentacion,
        COUNT(*) OVER() AS total
      FROM public.articulos a
      ${where}
      ORDER BY ${sortBy} ${sortOrder}, a.id ASC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const { rows } = await pool.query(sql, queryParams);
    const total = rows.length ? Number(rows[0].total) : 0;

    const items: ArticuloCrud[] = rows.map((r) => ({
      id: Number(r.id),
      clave: r.clave ?? null,
      descripcion: r.descripcion ?? null,
      presentacion: r.presentacion ?? null,
    }));

    return { items, page, pageSize, total };
  }

  async getCrudById(id: number): Promise<ArticuloCrud | null> {
    const { rows } = await pool.query(
      `
      SELECT id, clave, descripcion, presentacion
      FROM public.articulos
      WHERE id = $1
      `,
      [id]
    );

    if (!rows.length) return null;

    return {
      id: Number(rows[0].id),
      clave: rows[0].clave ?? null,
      descripcion: rows[0].descripcion ?? null,
      presentacion: rows[0].presentacion ?? null,
    };
  }

  async createCrud(payload: ArticuloCrudCreateInput): Promise<ArticuloCrud> {
    const { rows } = await pool.query(
      `
      INSERT INTO public.articulos (clave, descripcion, presentacion)
      VALUES ($1, $2, $3)
      RETURNING id, clave, descripcion, presentacion
      `,
      [payload.clave, payload.descripcion, payload.presentacion ?? null]
    );

    return {
      id: Number(rows[0].id),
      clave: rows[0].clave ?? null,
      descripcion: rows[0].descripcion ?? null,
      presentacion: rows[0].presentacion ?? null,
    };
  }

  async updateCrud(id: number, payload: ArticuloCrudUpdateInput): Promise<ArticuloCrud | null> {
    const updates: string[] = [];
    const values: any[] = [id];
    let idx = 2;

    if (payload.clave !== undefined) {
      updates.push(`clave = $${idx++}`);
      values.push(payload.clave);
    }

    if (payload.descripcion !== undefined) {
      updates.push(`descripcion = $${idx++}`);
      values.push(payload.descripcion);
    }

    if (payload.presentacion !== undefined) {
      updates.push(`presentacion = $${idx++}`);
      values.push(payload.presentacion);
    }

    if (!updates.length) {
      throw new Error('No hay campos para actualizar.');
    }

    const sql = `
      UPDATE public.articulos
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, clave, descripcion, presentacion
    `;

    const { rows } = await pool.query(sql, values);
    if (!rows.length) return null;

    return {
      id: Number(rows[0].id),
      clave: rows[0].clave ?? null,
      descripcion: rows[0].descripcion ?? null,
      presentacion: rows[0].presentacion ?? null,
    };
  }

  async deleteCrud(id: number): Promise<boolean> {
    const { rowCount } = await pool.query(
      `
      DELETE FROM public.articulos
      WHERE id = $1
      `,
      [id]
    );

    return Number(rowCount || 0) > 0;
  }

  async getCrudReportSummary(q?: string): Promise<{
    total: number;
    con_clave: number;
    con_descripcion: number;
    con_presentacion: number;
    sin_clave: number;
    sin_descripcion: number;
    sin_presentacion: number;
    prefijos_clave_top: Array<{ prefijo: string; total: number }>;
    claves_duplicadas_top: Array<{ clave: string; total: number }>;
  }> {
    const { where, params } = this.buildPgWhere(q);

    const summarySql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(a.clave, '')), '') IS NOT NULL)::int AS con_clave,
        COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(a.descripcion, '')), '') IS NOT NULL)::int AS con_descripcion,
        COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(a.presentacion, '')), '') IS NOT NULL)::int AS con_presentacion
      FROM public.articulos a
      ${where}
    `;

    const prefijosSql = `
      SELECT
        split_part(trim(a.clave), '.', 1) AS prefijo,
        COUNT(*)::int AS total
      FROM public.articulos a
      ${where}
      AND NULLIF(TRIM(COALESCE(a.clave, '')), '') IS NOT NULL
      GROUP BY 1
      ORDER BY total DESC, prefijo ASC
      LIMIT 10
    `;

    const duplicadasSql = `
      SELECT
        trim(a.clave) AS clave,
        COUNT(*)::int AS total
      FROM public.articulos a
      ${where}
      AND NULLIF(TRIM(COALESCE(a.clave, '')), '') IS NOT NULL
      GROUP BY 1
      HAVING COUNT(*) > 1
      ORDER BY total DESC, clave ASC
      LIMIT 20
    `;

    const [summaryResult, prefijosResult, duplicadasResult] = await Promise.all([
      pool.query(summarySql, params),
      pool.query(prefijosSql, params),
      pool.query(duplicadasSql, params),
    ]);

    const summaryRow = summaryResult.rows[0] ?? {
      total: 0,
      con_clave: 0,
      con_descripcion: 0,
      con_presentacion: 0
    };

    const total = Number(summaryRow.total || 0);
    const con_clave = Number(summaryRow.con_clave || 0);
    const con_descripcion = Number(summaryRow.con_descripcion || 0);
    const con_presentacion = Number(summaryRow.con_presentacion || 0);

    return {
      total,
      con_clave,
      con_descripcion,
      con_presentacion,
      sin_clave: total - con_clave,
      sin_descripcion: total - con_descripcion,
      sin_presentacion: total - con_presentacion,
      prefijos_clave_top: prefijosResult.rows.map((r) => ({
        prefijo: String(r.prefijo || ''),
        total: Number(r.total || 0),
      })),
      claves_duplicadas_top: duplicadasResult.rows.map((r) => ({
        clave: String(r.clave || ''),
        total: Number(r.total || 0),
      })),
    };
  }

}

export default ArticulosService;
