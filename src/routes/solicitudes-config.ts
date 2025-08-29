// src/routes/solicitudes-config.routes.ts
import { Router } from 'express';
import { FeatureFlagsController } from '../controllers/featureFlags.controller';

const r = Router();
const c = new FeatureFlagsController();

// Solo admin en PATCH idealmente (middleware auth)
r.get('/effective', c.getEffective.bind(c));
r.get('/', c.list.bind(c));
r.patch('/', c.patch.bind(c));

export default r;
