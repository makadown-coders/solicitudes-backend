import { readFileSync } from 'fs';

type LocalJwk = Record<string, unknown>;

export type JwtErrorCode =
  | 'JWT_CONFIG_INCOMPLETE'
  | 'JWT_FILE_READ_ERROR'
  | 'JWT_KEY_IMPORT_ERROR'
  | 'JWT_VERIFY_FAILED';

export class JwtAuthError extends Error {
  readonly code: JwtErrorCode;

  constructor(code: JwtErrorCode, message: string) {
    super(message);
    this.name = 'JwtAuthError';
    this.code = code;
    Object.setPrototypeOf(this, JwtAuthError.prototype);
  }
}

interface PrivateKeyCache {
  privPath: string;
  kidPath: string;
  kid: string;
  privJwk: LocalJwk;
  importedKey?: unknown;
}

interface PublicJwkCache {
  pubPath: string;
  pubJwk: LocalJwk;
  keysByKid: Map<string, LocalJwk>;
  importedByKid: Map<string, unknown>;
}

let privateCache: PrivateKeyCache | null = null;
let publicCache: PublicJwkCache | null = null;

/**
 * Limpia la caché en memoria de llaves privadas, públicas y `kid` activo.
 * Nota operativa: Para producción, la caché se mantiene en memoria por ruta de archivo;
 * si el archivo en disco se reemplaza conservando la misma ruta, se requiere reiniciar el proceso
 * o invocar explícitamente `clearJwtKeyCache()`.
 */
export function clearJwtKeyCache(): void {
  privateCache = null;
  publicCache = null;
}

function requireNonEmptyEnv(varName: string): string {
  const val = process.env[varName];
  if (typeof val !== 'string' || !val.trim()) {
    throw new JwtAuthError('JWT_CONFIG_INCOMPLETE', `Missing required configuration: ${varName}`);
  }
  return val.trim();
}

function readJsonFileSafe(filePath: string, label: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    throw new JwtAuthError('JWT_FILE_READ_ERROR', `Unable to read ${label}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', `Invalid JSON format in ${label}`);
  }
}

function readTextFileSafe(filePath: string, label: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    throw new JwtAuthError('JWT_FILE_READ_ERROR', `Unable to read ${label}`);
  }
}

function validateRsaJwkStructure(jwk: unknown, requirePrivate: boolean, label: string): LocalJwk {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', `Invalid JWK object in ${label}`);
  }
  const obj = jwk as LocalJwk;
  if (obj.kty !== 'RSA' || typeof obj.n !== 'string' || !obj.n || typeof obj.e !== 'string' || !obj.e) {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', `Invalid RSA key parameters in ${label}`);
  }
  if (obj.alg !== undefined && obj.alg !== 'RS256') {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', `Unsupported JWK algorithm in ${label}`);
  }
  if (requirePrivate && (typeof obj.d !== 'string' || !obj.d)) {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', `Missing private RSA component in ${label}`);
  }
  return obj;
}

function loadPrivateConfigLazy(): PrivateKeyCache {
  const privPath = requireNonEmptyEnv('JWKS_PRIVATE_PATH');
  const kidPath = requireNonEmptyEnv('ACTIVE_KID_FILE');

  if (privateCache && privateCache.privPath === privPath && privateCache.kidPath === kidPath) {
    return privateCache;
  }

  const kid = readTextFileSafe(kidPath, 'ACTIVE_KID_FILE').trim();
  if (!kid) {
    throw new JwtAuthError('JWT_CONFIG_INCOMPLETE', 'ACTIVE_KID_FILE is empty');
  }

  const rawJson = readJsonFileSafe(privPath, 'JWKS_PRIVATE_PATH');
  let candidate: unknown;
  if (Array.isArray((rawJson as { keys?: unknown[] })?.keys)) {
    const keysList = (rawJson as { keys: unknown[] }).keys;
    if (keysList.length === 0) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Empty JWKSet in JWKS_PRIVATE_PATH');
    }
    const seenKids = new Set<string>();
    let matched: unknown = undefined;
    for (const item of keysList) {
      const validatedItem = validateRsaJwkStructure(item, true, 'JWKS_PRIVATE_PATH');
      const itemKid = typeof validatedItem.kid === 'string' ? validatedItem.kid.trim() : '';
      if (!itemKid) {
        throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Private JWK in JWKS_PRIVATE_PATH is missing kid');
      }
      if (seenKids.has(itemKid)) {
        throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Duplicate kid in JWKS_PRIVATE_PATH');
      }
      seenKids.add(itemKid);
      if (itemKid === kid) {
        matched = validatedItem;
      }
    }
    if (!matched) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Active kid not found in JWKS_PRIVATE_PATH');
    }
    candidate = matched;
  } else {
    candidate = rawJson;
  }

  const privJwk = validateRsaJwkStructure(candidate, true, 'JWKS_PRIVATE_PATH');
  const privKid = typeof privJwk.kid === 'string' ? privJwk.kid.trim() : '';
  if (!privKid) {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Private JWK in JWKS_PRIVATE_PATH is missing kid');
  }
  if (privKid !== kid) {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Private JWK kid does not match ACTIVE_KID_FILE');
  }

  privateCache = { privPath, kidPath, kid, privJwk };
  return privateCache;
}

function loadPublicConfigLazy(): PublicJwkCache {
  const pubPath = requireNonEmptyEnv('JWKS_PUBLIC_PATH');

  if (publicCache && publicCache.pubPath === pubPath) {
    return publicCache;
  }

  const rawJson = readJsonFileSafe(pubPath, 'JWKS_PUBLIC_PATH');
  const rawList: unknown[] = Array.isArray((rawJson as { keys?: unknown[] })?.keys)
    ? (rawJson as { keys: unknown[] }).keys
    : [rawJson];

  if (rawList.length === 0) {
    throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Empty JWKSet in JWKS_PUBLIC_PATH');
  }

  const keysByKid = new Map<string, LocalJwk>();
  let firstValid: LocalJwk | null = null;

  for (const item of rawList) {
    const validated = validateRsaJwkStructure(item, false, 'JWKS_PUBLIC_PATH');
    const itemKid = typeof validated.kid === 'string' ? validated.kid.trim() : '';
    if (!itemKid) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Public JWK in JWKS_PUBLIC_PATH is missing kid');
    }
    if (keysByKid.has(itemKid)) {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Duplicate kid in JWKS_PUBLIC_PATH');
    }
    if (!firstValid) firstValid = validated;
    keysByKid.set(itemKid, validated);
  }

  publicCache = {
    pubPath,
    pubJwk: firstValid!,
    keysByKid,
    importedByKid: new Map<string, unknown>(),
  };
  return publicCache;
}

/**
 * Generates an access token given the payload.
 * The token is signed with the private key stored in JWKS_PRIVATE_PATH
 * and has the following properties:
 * - Algorithm: RS256
 * - Key ID: The value of ACTIVE_KID_FILE (trimmed)
 * - Issued at: Current time
 * - Not before: Current time
 * - Expires at: Current time + ACCESS_TTL_SECONDS
 * - Issuer: The value of JWT_ISSUER
 * - Audience: The value of JWT_AUDIENCE
 *
 * @param {Record<string, any>} payload
 * @returns {Promise<string>} The access token
 */
export async function signAccessToken(payload: Record<string, any>) {
  const issuer = requireNonEmptyEnv('JWT_ISSUER');
  const audience = requireNonEmptyEnv('JWT_AUDIENCE');

  if (!payload || typeof payload.sub !== 'string' || !payload.sub.trim()) {
    throw new JwtAuthError('JWT_CONFIG_INCOMPLETE', 'Token payload must include a non-empty sub claim');
  }

  const cache = loadPrivateConfigLazy();
  const { SignJWT, importJWK } = await import('jose');

  if (!cache.importedKey) {
    try {
      cache.importedKey = await importJWK(cache.privJwk as any, 'RS256');
    } catch {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Failed to import private JWK');
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const rawTtl = Number(process.env.ACCESS_TTL_SECONDS || 900);
  const ttl = Number.isFinite(rawTtl) && rawTtl > 0 ? Math.floor(rawTtl) : 900;

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: cache.kid })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttl)
    .setIssuer(issuer)
    .setAudience(audience)
    .sign(cache.importedKey as any);
}

/**
 * Verifica un token de acceso local (firmado con la clave privada)
 * contra la clave publica y devuelve el payload si es valido.
 * Lanza un error si el token no es valido o no
 * coincide con el issuer/audience configurados.
 *
 * @param token - El token de acceso a verificar.
 * @returns El payload del token si es valido.
 * @throws { Error } - Si el token no es valido.
 */
export async function verifyLocalAccess(token: string) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new JwtAuthError('JWT_VERIFY_FAILED', 'Invalid or empty token');
  }

  const issuer = requireNonEmptyEnv('JWT_ISSUER');
  const audience = requireNonEmptyEnv('JWT_AUDIENCE');
  const cache = loadPublicConfigLazy();

  const { decodeProtectedHeader, importJWK, jwtVerify } = await import('jose');

  let header: { alg?: string; kid?: string };
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new JwtAuthError('JWT_VERIFY_FAILED', 'Malformed token header');
  }

  if (header.alg !== 'RS256') {
    throw new JwtAuthError('JWT_VERIFY_FAILED', 'Unsupported token algorithm');
  }

  const tokenKid = typeof header.kid === 'string' ? header.kid.trim() : '';
  if (!tokenKid) {
    throw new JwtAuthError('JWT_VERIFY_FAILED', 'Missing token kid');
  }

  const jwk = cache.keysByKid.get(tokenKid);
  if (!jwk) {
    throw new JwtAuthError('JWT_VERIFY_FAILED', 'Unknown token kid');
  }

  let key = cache.importedByKid.get(tokenKid);
  if (!key) {
    try {
      key = await importJWK(jwk as any, 'RS256');
      cache.importedByKid.set(tokenKid, key);
    } catch {
      throw new JwtAuthError('JWT_KEY_IMPORT_ERROR', 'Failed to import public JWK');
    }
  }

  try {
    const { payload } = await jwtVerify(token, key as any, {
      algorithms: ['RS256'],
      issuer,
      audience,
    });
    if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new JwtAuthError('JWT_VERIFY_FAILED', 'Missing required token claims');
    }
    return payload as any;
  } catch (e) {
    if (e instanceof JwtAuthError) throw e;
    throw new JwtAuthError('JWT_VERIFY_FAILED', 'Token verification failed');
  }
}

export function getPublicJwk() {
  return loadPublicConfigLazy().pubJwk;
}
