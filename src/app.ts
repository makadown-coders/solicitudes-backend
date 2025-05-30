import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import articulosRoutes from './routes/articulos';
import citasRoutes from './routes/citas';
import compression from 'compression';
// import { seedCitasSiNecesario } from './seed/citas.seed';
 
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());

app.use(compression());
// Rutas
app.use('/api/articulos', articulosRoutes);
app.use('/api/citas', citasRoutes);

app.listen(PORT, async () => {
  console.log(`Servidor backend escuchando en http://xxxxxx:${PORT}`);
 // await seedCitasSiNecesario();
});
