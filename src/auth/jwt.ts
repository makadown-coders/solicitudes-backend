import { SignJWT, importJWK, jwtVerify, JWK } from 'jose';
import { readFileSync } from 'fs';

const loadJwk = (path: string) => JSON.parse(readFileSync(path, 'utf-8')) as JWK;
const privJwk = loadJwk(process.env.JWKS_PRIVATE_PATH!);
const pubJwk = loadJwk(process.env.JWKS_PUBLIC_PATH!);
const kid = readFileSync(process.env.ACTIVE_KID_FILE!, 'utf-8');

/**
 * Generates an access token given the payload.
 * The token is signed with the private key stored in JWKS_PRIVATE_PATH
 * and has the following properties:
 * - Algorithm: RS256
 * - Key ID: The value of JWKS_ACTIVE_KID
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
  const key = await importJWK(privJwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(process.env.ACCESS_TTL_SECONDS || 900);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttl)
    .setIssuer(process.env.JWT_ISSUER!)
    .setAudience(process.env.JWT_AUDIENCE!)
    .sign(key);
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
  const key = await importJWK(pubJwk, 'RS256');
  const { payload } = await jwtVerify(token, key, {
    issuer: process.env.JWT_ISSUER!,
    audience: process.env.JWT_AUDIENCE!,
  });
  return payload as any;
}

export function getPublicJwk() { return pubJwk; }
