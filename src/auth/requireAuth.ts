import type { RequestHandler } from 'express';
import { readFileSync } from 'fs';
import { JwtAuthError } from './jwt';

type LocalJwk = Record<string, unknown>;

interface JwksCacheEntry {
  pubPath: string;
  keysByKid: Map<string, LocalJwk>;
  importedByKid: Map<string, unknown>;
}

let jwksCache: JwksCacheEntry | null = null;

/**
 * Limpia la caché en memoria del JWKSet utilizado por `requireAuth`.
 * Nota operativa: Si el contenido del archivo `JWKS_PUBLIC_PATH` se actualiza en disco
 * manteniendo la misma ruta, se requiere reiniciar el proceso o invocar explícitamente
 * `clearRequireAuthCache()`.
 */
export function clearRequireAuthCache(): void {
  jwksCache = null;
}

function resolveVerifierConfig(): {
  pubPath: string;
  allowlist: string[];
  audience: string;
} {
  const pubPath = typeof process.env.JWKS_PUBLIC_PATH === 'string' ? process.env.JWKS_PUBLIC_PATH.trim() : '';
  if (!pubPath) {
    throw new JwtAuthError('JWT_CONFIG_INCOMPLETE', 'Missing JWKS_PUBLIC_PATH');
  }

  const rawIss = typeof process.env.JWT_ISSUER === 'string' ? process.env.JWT_ISSUER.trim() : '';
  const rawAllowlist =
    typeof process.env.JWT_ISSUER_ALLOWLIST === 'string' ? process.env.JWT_ISSUER_ALLOWLIST.trim() : '';

  const sourceList = rawAllowlist || rawIss;
  const allowlist = sourceList
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allowlist.length === 0) {
    throw new JwtAuthError('JWT_CONFIG_INCOMPLETE', 'Missing JWT_ISSUER or JWT_ISSUER_ALLOWLIST');
  }

  // Si ambos están definidos, JWT_ISSUER debe pertenecer a JWT_ISSUER_ALLOWLIST para evitar configuración inconsistente
  if (rawIss && rawAllowlist && !allowlist.includes(rawIss)) {
    throw new JwtAuthError('JWT_CONFIG_INCOMPLETE', 'JWT_ISSUER is not included in JWT_ISSUER_ALLOWLIST');
  }

  const audience = typeof process.env.JWT_AUDIENCE === 'string' ? process.env.JWT_AUDIENCE.trim() : '';
  if (!audience) {
    throw new JwtAuthError('JWT_CONFIG_INCOMPLETE', 'Missing JWT_AUDIENCE');
  }

  return { pubPath, allowlist, audience };
}

function loadLocalJwkSetCached(pubPath: string): JwksCacheEntry {
  if (jwksCache && jwksCache.pubPath === pubPath) {
    return jwksCache;
  }

  let raw: string;
  try {
    raw = readFileSync(pubPath, 'utf-8');
  } catch {
    throw new JwtAuthError('JWT_FILE_READ_ERROR', 'Unable to read JWKS_PUBLIC_PATH');
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Invalid JSON in JWKS_PUBLIC_PATH');
  }

  const list: unknown[] = Array.isArray(json?.keys) ? json.keys : [json];
  if (list.length === 0) {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Empty JWKSet in JWKS_PUBLIC_PATH');
  }

  const keysByKid = new Map<string, LocalJwk>();
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Invalid JWK entry in JWKS_PUBLIC_PATH');
    }
    const jwk = item as LocalJwk;
    const kid = typeof jwk.kid === 'string' ? jwk.kid.trim() : '';
    if (!kid) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Public JWK entry is missing kid');
    }
    if (keysByKid.has(kid)) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Duplicate kid in JWKS_PUBLIC_PATH');
    }
    if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || !jwk.n || typeof jwk.e !== 'string' || !jwk.e) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Invalid RSA public JWK parameters');
    }
    if (jwk.alg !== undefined && jwk.alg !== 'RS256') {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Unsupported public JWK algorithm');
    }
    keysByKid.set(kid, jwk);
  }

  jwksCache = {
    pubPath,
    keysByKid,
    importedByKid: new Map<string, unknown>(),
  };
  return jwksCache;
}

/**
 * Loads an authorized public JWK strictly matching `kid` with algorithm `RS256`.
 * Does NOT fall back to `keys[0]` when `kid` is missing or unknown.
 */
async function getLocalKeyStrict(pubPath: string, kid: string): Promise<unknown> {
  const cache = loadLocalJwkSetCached(pubPath);
  const jwk = cache.keysByKid.get(kid);
  if (!jwk) {
    throw new JwtAuthError('JWT_VERIFY_FAILED', 'Unknown token kid');
  }

  const cachedImported = cache.importedByKid.get(kid);
  if (cachedImported) {
    return cachedImported;
  }

  const { importJWK } = await import('jose');
  try {
    const imported = await importJWK(jwk as any, 'RS256');
    cache.importedByKid.set(kid, imported);
    return imported;
  } catch {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Failed to import public JWK');
  }
}

declare global {
  namespace Express {
    interface UserClaims { sub: string; email?: string;[k: string]: unknown; }
    interface Request { user?: UserClaims; accessToken?: string; }
  }
}

/**
 * Verifica que el request tenga un token de acceso valido y que coincida
 * con el algoritmo RS256, kid autorizado, issuer/audience configurados, exp y sub.
 * Si el token es valido, asigna el payload deserializado a `req.user`
 * y el token a `req.accessToken`.
 * Devuelve HTTP 401 sin exponer rutas internas, secretos ni trazas de `jose`.
 */
export const requireAuth: RequestHandler = async (req, res, next): Promise<void> => {
  const hdr = req.get('Authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }

  // Un JWS compacto válido debe tener exactamente 3 partes no vacías (header.payload.signature)
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
    res.status(401).json({ error: 'Invalid/expired token' });
    return;
  }

  try {
    const { pubPath, allowlist, audience } = resolveVerifierConfig();
    const { decodeJwt, decodeProtectedHeader, jwtVerify } = await import('jose');

    let header: { alg?: string; kid?: string };
    let unverifiedClaims: { iss?: unknown };
    try {
      header = decodeProtectedHeader(token);
      unverifiedClaims = decodeJwt(token);
    } catch {
      res.status(401).json({ error: 'Invalid/expired token' });
      return;
    }

    if (header.alg !== 'RS256') {
      res.status(401).json({ error: 'Invalid/expired token' });
      return;
    }

    const kid = typeof header.kid === 'string' ? header.kid.trim() : '';
    if (!kid) {
      res.status(401).json({ error: 'Invalid/expired token' });
      return;
    }

    const iss = typeof unverifiedClaims.iss === 'string' ? unverifiedClaims.iss.trim() : '';
    if (!iss || !allowlist.includes(iss)) {
      res.status(401).json({ error: 'Invalid token issuer' });
      return;
    }

    const key = await getLocalKeyStrict(pubPath, kid);
    const { payload } = await jwtVerify(token, key as any, {
      algorithms: ['RS256'],
      issuer: allowlist,
      audience,
    });

    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      res.status(401).json({ error: 'Invalid/expired token' });
      return;
    }

    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      res.status(401).json({ error: 'Invalid/expired token' });
      return;
    }

    req.user = payload as any;
    req.accessToken = token;
    next();
    return;
  } catch {
    res.status(401).json({ error: 'Invalid/expired token' });
    return;
  }
};
