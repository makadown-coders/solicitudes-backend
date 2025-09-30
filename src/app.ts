import './setup/env';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import articulosRoutes from './routes/articulos';
import citasRoutes from './routes/citas';
import inventarioRoutes from './routes/inventario';
import historialRoutes from './routes/historial';
import unidadMedicaRoutes from './routes/unidadMedica';
import municipioRoutes from './routes/municipio';
import localidadRoutes from './routes/localidad';
import tipoUnidadRoutes from './routes/tipoUnidad';
import cargaMasivaRoutes from './routes/cargaMasiva';
import trazabilidadRoutes from './routes/trazabilidad';
import cpmsRoutes from './routes/cpm';
import factorRoutes from './routes/factor-conversion';
import rdlsRoutes from './routes/rdls';
import authRoutes from './routes/auth';
import configRoutes from './routes/solicitudes-config';
import existenciasRoutes from './routes/existencias';
import tipoDispositivoRoutes from './routes/tipoDispositivo';
import estadoDispositivoRoutes from './routes/estadoDispositivo';
import dispositivosRoutes from './routes/dispositivos';
import asignacionesRoutes from './routes/asignaciones';
import unidadMedicaTIRoutes from './routes/unidadMedica-ti';

import compression from 'compression';
import { fetch, Headers } from 'undici';
// import { seedCitasSiNecesario } from './seed/citas.seed';
 
dotenv.config();

// @ts-ignore
globalThis.fetch = fetch;
// @ts-ignore
globalThis.Headers = Headers;

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cors());
app.use(express.json());

// la libreria de compresion es extremadamente util para enviar el archivo de excel en base64
app.use(compression());
// Rutas
app.use('/api/articulos', articulosRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/cpms', cpmsRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/unidades', unidadMedicaRoutes);
app.use('/api/ti/unidades', unidadMedicaTIRoutes);
app.use('/api/municipios', municipioRoutes);
app.use('/api/localidades', localidadRoutes);
app.use('/api/tipo-unidad', tipoUnidadRoutes);
app.use('/api/carga', cargaMasivaRoutes);
app.use('/api/trazabilidad', trazabilidadRoutes);
app.use('/api/factores', factorRoutes);
app.use('/api/rdls', rdlsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/solicitudes-config', configRoutes);
app.use('/api/existencias-temp', existenciasRoutes);
app.use('/api/catalogos/tipos-dispositivo', tipoDispositivoRoutes);
app.use('/api/catalogos/estados-dispositivo', estadoDispositivoRoutes);
app.use('/api/dispositivos', dispositivosRoutes);
app.use('/api', asignacionesRoutes);

app.listen(PORT, async () => {
  console.log(`Servidor backend escuchando en http://xxxxx:${PORT}`);
 // await seedCitasSiNecesario();
});
