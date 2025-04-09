import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import articulosRoutes from './routes/articulos.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/articulos', articulosRoutes);

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
