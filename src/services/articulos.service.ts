// src/services/articulos.service.ts
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import { Articulo } from '../models/Articulo';

/**
 * Esta configuración es para la base de datos 
 * para la herramienta de creacion de solicitudes, en 
 * donde se realiza la consulta de articulos para alimentar
 * el autocompletado en el front end.
 * 
 * Esta es la unica seccion hecha con SQLite para agilizar
 * la creacion de solicitudes.
 */


dotenv.config();

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
}

export default ArticulosService;