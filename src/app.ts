import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import articulosRoutes from './routes/articulos';
import citasRoutes from './routes/citas';
import inventarioRoutes from './routes/inventario';
import cpmsRoutes from './routes/cpm';
import compression from 'compression';
// import { seedCitasSiNecesario } from './seed/citas.seed';
 
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());

// la libreria de compresion es extremadamente util para enviar el archivo de excel en base64
app.use(compression());
// Rutas
app.use('/api/articulos', articulosRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/cpms', cpmsRoutes);

app.listen(PORT, async () => {
  console.log(`Servidor backend escuchando en http://xxxxxx:${PORT}`);
 // await seedCitasSiNecesario();
});
