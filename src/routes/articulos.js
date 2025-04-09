import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const dbPromise = open({
  filename: process.env.DB_PATH,
  driver: sqlite3.Database
});

router.get('/', async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 3) {
    return res.status(400).json({ error: 'Query demasiado corta' });
  }

  const db = await dbPromise;
  const query = `
    SELECT clave, descripcion, presentacion
    FROM ARTICULOS
    WHERE clave LIKE ? OR descripcion LIKE ?
    LIMIT 12
  `;
  const results = await db.all(query, [`%${q}%`, `%${q}%`]);

  const total = await db.get(
    `SELECT COUNT(*) as count FROM ARTICULOS WHERE clave LIKE ? OR descripcion LIKE ?`,
    [`%${q}%`, `%${q}%`]
  );

  res.json({
    resultados: results,
    total: total.count
  });
});

export default router;
