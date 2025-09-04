// src/auth/requireAuth.ts
import type { RequestHandler } from 'express';
import * as jose from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL!;
// const JWKS = jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/keys`));

const PUBLISHABLE = process.env.SUPABASE_ANON_KEY!;
if (!PUBLISHABLE) {
  // Recomendado: falla rápido si falta la anon key
  console.warn('SUPABASE_ANON_KEY is missing; JWKS fetch will fail');
}

const oidcCache = new Map<string, { exp: number; jwks_uri: string }>();
const jwksCache = new Map<string, { exp: number; keys: any[] }>();
const keyCache = new Map<string, unknown>();

async function discoverJwksUri(iss: string): Promise<string> {
  const now = Date.now();
  const cached = oidcCache.get(iss);
  if (cached && cached.exp > now) return cached.jwks_uri;

  const base = iss.replace(/\/$/, '');
  const url = `${base}/.well-known/openid-configuration`;

  let jwks_uri = '';
  const res = await fetch(url, {
    headers: PUBLISHABLE ? { apikey: PUBLISHABLE, authorization: `Bearer ${PUBLISHABLE}` } : undefined,
  }).catch(() => undefined);

  if (res?.ok) {
    const json = await res.json();
    if (typeof json?.jwks_uri === 'string' && json.jwks_uri) {
      jwks_uri = json.jwks_uri;
    }
  }

  // Fallback si el discovery no existe / no trae jwks_uri
  if (!jwks_uri) jwks_uri = `${base}/.well-known/jwks.json`;

  oidcCache.set(iss, { exp: now + 10 * 60_000, jwks_uri }); // 10 min
  return jwks_uri;
}

async function fetchJWKS(iss: string) {
  const base = iss.replace(/\/$/, '');
  const jwks_uri = await discoverJwksUri(iss);
  const candidates = [
    jwks_uri,
    `${base}/jwks`,
    `${base}/keys`,
  ];

  let lastErr: any;
  for (const url of candidates) {
    const res = await fetch(url, {
      headers: PUBLISHABLE ? { apikey: PUBLISHABLE, authorization: `Bearer ${PUBLISHABLE}` } : undefined,
    }).catch(e => ({ ok: false, status: 0, statusText: String(e) } as any));

    if (res?.ok) {
      try {
        const body = await res.json();
        if (Array.isArray(body?.keys) && body.keys.length) return body.keys as any[];
        lastErr = new Error(`JWKS empty at ${url}`);
      } catch (e) { lastErr = e; }
    } else {
      lastErr = new Error(`JWKS ${res?.status} ${res?.statusText} at ${url}`);
    }
  }
  throw lastErr || new Error('No JWKS endpoint succeeded');
}

async function getSigningKey(iss: string, kid: string, alg?: string): Promise<unknown> {
  const ck = `${iss}|${kid}`;
  const cached = keyCache.get(ck);
  if (cached) return cached;

  const now = Date.now();
  let entry = jwksCache.get(iss);
  if (!entry || entry.exp < now) {
    const keys = await fetchJWKS(iss);
    entry = { exp: now + 10 * 60_000, keys };
    jwksCache.set(iss, entry);
  }

  const jwk = entry.keys.find((k: any) => k.kid === kid);
  if (!jwk) throw new Error(`No matching JWK for kid=${kid}`);

  const key = await jose.importJWK(jwk as jose.JWK, alg || jwk.alg || 'ES256');
  keyCache.set(ck, key);
  return key;
}

declare global {
  namespace Express {
    interface UserClaims {
      sub: string; // auth user id (uuid)
      email?: string;
      role?: string;
      [k: string]: unknown;
    }
    interface Request {
      user?: UserClaims;
      accessToken?: string;
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {  
  const hdr = req.get('Authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }

  try {
    // Descubre issuer y header sin verificar
    const { iss } = jose.decodeJwt(token);
    const { kid, alg } = jose.decodeProtectedHeader(token);
    if (!iss || !kid) { res.status(401).json({ error: 'Invalid token (iss/kid missing)' }); return; }

    // Importa la llave correcta y verifica
    const key = await getSigningKey(iss, kid, alg);
    const { payload } = await jose.jwtVerify(token, key as any, { issuer: iss });

    req.user = payload as any;
    req.accessToken = token;
    next();
  } catch (e: any) {
    console.error('Error al verificar token ', e.error);
    // Mensaje más explícito si falla el fetch de JWKS
    res.status(401).json({
      error: 'Invalid/expired token',
      detail: e?.message || String(e)
    });
  }
};
