import type { RequestHandler } from 'express';
import * as jose from 'jose';
import { readFileSync } from 'fs';

const LOCAL_ISS = process.env.JWT_ISSUER!;
const LOCAL_AUD = process.env.JWT_AUDIENCE;
const LOCAL_JWKS_PATH = process.env.JWKS_PUBLIC_PATH!;

const ISS_ALLOWLIST = (process.env.JWT_ISSUER_ALLOWLIST || process.env.JWT_ISSUER || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/**
 * Reads a local JWKS file and returns the parsed content.
 * If the file contains an array of JWKs, it is returned as is.
 * If the file contains a single JWK, it is wrapped in an array.
 * @returns An object with a single property "keys" containing an array of JWKs.
 */
function loadLocalJwkSet(): { keys: jose.JWK[] } {
  const raw = readFileSync(LOCAL_JWKS_PATH, 'utf-8');
  const json = JSON.parse(raw);
  return Array.isArray(json?.keys) ? json : { keys: [json] };
}

/**
 * Loads a local JWK given its `kid` and `alg`.
 * If `kid` is not provided, it will return the first JWK in the set.
 * If `alg` is not provided, it will use the `alg` of the JWK.
 * @param {string} [kid] - The `kid` of the JWK to load.
 * @param {string} [alg] - The `alg` of the JWK to load.
 * @returns {Promise<unknown>} - A promise that resolves to the JWK.
 * @throws {Error} - If no local JWK is found.
 */
async function getLocalKey(kid?: string, alg?: string): Promise<unknown> {
  const { keys } = loadLocalJwkSet();
  const jwk = (kid ? keys.find((k: any) => k.kid === kid) : keys[0]) || keys[0];
  if (!jwk) throw new Error('No local JWK found');
  return await jose.importJWK(jwk as any, alg || (jwk as any).alg || 'RS256');
}

declare global {
  namespace Express {
    interface UserClaims { sub: string; email?: string;[k: string]: unknown; }
    interface Request { user?: UserClaims; accessToken?: string; }
  }
}

/**
 * Verifica que el request tenga un token de acceso valido y que coincida
 * con el issuer/audience configurados. Si el token es valido, asigna
 * el payload deserializado a `req.user` y el token a `req.accessToken`.
 * Lanza un error 401 con un JSON con la propiedad `error` si el token
 * no es valido o no coincide con el issuer/audience configurados.
 *
 * @returns {Promise<void>} - Una promesa que se resuelve con void
 * @throws {Error} - Si el token no es valido o no coincide con el
 * issuer/audience configurados.
 */
export const requireAuth: RequestHandler = async (req, res, next): Promise<void> => {
  const hdr = req.get('Authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return; // <-- IMPORTANTÍSIMO: devolvemos void, no el Response
  }

  try {
    const { iss } = jose.decodeJwt(token);
    const { kid, alg } = jose.decodeProtectedHeader(token);
    // Verificamos que el iss sea uno de los permitidos
    if (!iss || !ISS_ALLOWLIST.includes(iss)) {
      res.status(401).json({ error: 'Invalid token issuer' }); return;
    }

    const key = await getLocalKey(kid, alg);
    const opts: any = { issuer: LOCAL_ISS };
    if (LOCAL_AUD) opts.audience = LOCAL_AUD;
    const { payload } = await jose.jwtVerify(token, key as any, opts);

    req.user = payload as any;
    req.accessToken = token;
    next(); // ok
    return;
  } catch (e: any) {
    res.status(401).json({ error: 'Invalid/expired token', detail: e?.message || String(e) });
    return;
  }
};
