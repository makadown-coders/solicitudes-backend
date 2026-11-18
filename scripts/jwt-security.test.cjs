const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const argon2 = require('argon2');

// Antes de importar los módulos compilados, limpiamos cualquier variable de entorno JWK/JWT
// para comprobar que la importación de jwt.ts, requireAuth.ts y auth.ts NO falla ni lee disco.
delete process.env.JWKS_PRIVATE_PATH;
delete process.env.JWKS_PUBLIC_PATH;
delete process.env.ACTIVE_KID_FILE;
delete process.env.JWT_ISSUER;
delete process.env.JWT_ISSUER_ALLOWLIST;
delete process.env.JWT_AUDIENCE;

const jwtModule = require('../dist/auth/jwt');
const requireAuthModule = require('../dist/auth/requireAuth');
const jwksControllerModule = require('../dist/auth/jwks.controller');
const LocalAuthService = require('../dist/services/localAuth.service').default;
const authRoutes = require('../dist/routes/auth').default;

const {
  signAccessToken,
  verifyLocalAccess,
  getPublicJwk,
  clearJwtKeyCache,
  JwtAuthError,
} = jwtModule;
const { requireAuth, clearRequireAuthCache } = requireAuthModule;
const { jwksHandler } = jwksControllerModule;

// Directorio temporal aislado para llaves efímeras de prueba (nunca toca keys/ del repo)
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-jwt-sec-test-'));

test.after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

let keyCounter = 0;

/**
 * Genera un par RSA-2048 efímero en memoria usando `node:crypto` y lo exporta como JWK.
 * No lee ni utiliza en ningún momento las llaves reales del repositorio.
 */
function generateEphemeralRsaJwkPair(customKid) {
  keyCounter += 1;
  const kid = customKid || `ephemeral_kid_${keyCounter}`;
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const pubJwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' };
  const privJwk = { ...privateKey.export({ format: 'jwk' }), kid, alg: 'RS256' };
  return { kid, pubJwk, privJwk, publicKey, privateKey };
}

function writeTempAuthFiles({ privContent, pubContent, kidContent }) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'case-'));
  const privPath = path.join(dir, 'priv.jwk.json');
  const pubPath = path.join(dir, 'pub.jwk.json');
  const kidPath = path.join(dir, 'ACTIVE_KID');

  if (privContent !== undefined) {
    fs.writeFileSync(
      privPath,
      typeof privContent === 'string' ? privContent : JSON.stringify(privContent),
      'utf-8'
    );
  }
  if (pubContent !== undefined) {
    fs.writeFileSync(
      pubPath,
      typeof pubContent === 'string' ? pubContent : JSON.stringify(pubContent),
      'utf-8'
    );
  }
  if (kidContent !== undefined) {
    fs.writeFileSync(kidPath, kidContent, 'utf-8');
  }

  return { dir, privPath, pubPath, kidPath };
}

function resetTestEnv(envOverrides = {}) {
  clearJwtKeyCache();
  clearRequireAuthCache();

  delete process.env.JWKS_PRIVATE_PATH;
  delete process.env.JWKS_PUBLIC_PATH;
  delete process.env.ACTIVE_KID_FILE;
  delete process.env.JWT_ISSUER;
  delete process.env.JWT_ISSUER_ALLOWLIST;
  delete process.env.JWT_AUDIENCE;
  delete process.env.ACCESS_TTL_SECONDS;

  for (const [k, v] of Object.entries(envOverrides)) {
    if (v !== undefined && v !== null) {
      process.env[k] = String(v);
    }
  }
}

async function runRequireAuth(token) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    get(name) {
      if (String(name).toLowerCase() === 'authorization') {
        return token ? `Bearer ${token}` : undefined;
      }
      return undefined;
    },
  };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  let nextCalled = false;
  await requireAuth(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test('1 y 2 y 19. Importación de jwt.ts, requireAuth.ts y routes/auth.ts sin variables JWK no lanza excepciones', () => {
  assert.equal(typeof signAccessToken, 'function');
  assert.equal(typeof verifyLocalAccess, 'function');
  assert.equal(typeof getPublicJwk, 'function');
  assert.equal(typeof requireAuth, 'function');
  assert.ok(authRoutes, 'El router de autenticación se importa sin requerir archivos JWK en el arranque');
});

test('3, 4 y 5. Firma RS256 válida, verificación RS256 válida (requireAuth y verifyLocalAccess) y ACTIVE_KID con salto de línea CRLF', async () => {
  const pair = generateEphemeralRsaJwkPair('kid_test_crlf');
  const files = writeTempAuthFiles({
    privContent: pair.privJwk,
    pubContent: pair.pubJwk,
    kidContent: `  ${pair.kid}\r\n\n`,
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
    ACCESS_TTL_SECONDS: '600',
  });

  const token = await signAccessToken({
    sub: 'user-100',
    email: 'rh@imssb.gob.mx',
    name: 'Usuario RH',
    roles: [{ code: 'ADMIN_RH', scope: 'GLOBAL', id: null }],
  });

  // Verificamos que el header protegido tenga el kid limpio sin \r\n
  const [headerB64] = token.split('.');
  const headerJson = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
  assert.equal(headerJson.alg, 'RS256');
  assert.equal(headerJson.kid, 'kid_test_crlf');

  // Verificamos con verifyLocalAccess() y getPublicJwk()
  const verifiedPayload = await verifyLocalAccess(token);
  assert.equal(verifiedPayload.sub, 'user-100');
  assert.equal(getPublicJwk().kid, 'kid_test_crlf');

  // Y verificamos con el handler jwksHandler
  let jwksBody = null;
  jwksHandler({}, { json(b) { jwksBody = b; } });
  assert.equal(Array.isArray(jwksBody.keys), true);
  assert.equal(jwksBody.keys[0].kid, 'kid_test_crlf');

  // Verificamos con el middleware requireAuth
  const { req, res, nextCalled } = await runRequireAuth(token);
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.user.sub, 'user-100');
  assert.equal(req.accessToken, token);
});

test('6 y 7. Rechaza JWT con kid desconocido (sin fallback a keys[0]) y rechaza JWT sin kid', async () => {
  const pairAuthorized = generateEphemeralRsaJwkPair('kid_authorized_1');
  const files = writeTempAuthFiles({
    privContent: pairAuthorized.privJwk,
    pubContent: { keys: [pairAuthorized.pubJwk] },
    kidContent: 'kid_authorized_1',
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const { SignJWT, importJWK } = await import('jose');
  const privKey = await importJWK(pairAuthorized.privJwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  // Caso 6: Firmado con la MISMA llave privada RSA de keys[0], pero con un kid desconocido.
  // Si existiera el fallback inseguro `|| keys[0]`, la firma pasaría. Debe ser rechazado con 401.
  const tokenUnknownKid = await new SignJWT({ sub: 'user-1' })
    .setProtectedHeader({ alg: 'RS256', kid: 'kid_unknown_999' })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(privKey);

  const outUnknown = await runRequireAuth(tokenUnknownKid);
  assert.equal(outUnknown.nextCalled, false);
  assert.equal(outUnknown.res.statusCode, 401);
  assert.deepEqual(outUnknown.res.body, { error: 'Invalid/expired token' });
  await assert.rejects(() => verifyLocalAccess(tokenUnknownKid));

  // Caso 7: Firmado con la misma llave privada RSA de keys[0], pero SIN propiedad kid en el header.
  const tokenNoKid = await new SignJWT({ sub: 'user-1' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(privKey);

  const outNoKid = await runRequireAuth(tokenNoKid);
  assert.equal(outNoKid.nextCalled, false);
  assert.equal(outNoKid.res.statusCode, 401);
  assert.deepEqual(outNoKid.res.body, { error: 'Invalid/expired token' });
  await assert.rejects(() => verifyLocalAccess(tokenNoKid));
});

test('8. Rechaza algoritmos no permitidos (HS256, none y token sin firma)', async () => {
  const pair = generateEphemeralRsaJwkPair('kid_alg_test');
  const files = writeTempAuthFiles({
    privContent: pair.privJwk,
    pubContent: pair.pubJwk,
    kidContent: pair.kid,
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const { SignJWT } = await import('jose');
  const now = Math.floor(Date.now() / 1000);
  const hsSecret = new TextEncoder().encode('super-secret-symmetric-key-1234567890');

  const hs256Token = await new SignJWT({ sub: 'user-1' })
    .setProtectedHeader({ alg: 'HS256', kid: pair.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(hsSecret);

  const outHs = await runRequireAuth(hs256Token);
  assert.equal(outHs.nextCalled, false);
  assert.equal(outHs.res.statusCode, 401);

  // Token con alg: "none" y firma vacía
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', kid: pair.kid })).toString('base64url');
  const nonePayload = Buffer.from(JSON.stringify({
    sub: 'user-1',
    iss: 'https://sso.imssb.gob.mx',
    aud: 'solicitudes-app',
    exp: now + 600,
  })).toString('base64url');
  const unsignedToken = `${noneHeader}.${nonePayload}.`;

  const outNone = await runRequireAuth(unsignedToken);
  assert.equal(outNone.nextCalled, false);
  assert.equal(outNone.res.statusCode, 401);
});

test('9 y 10. Rechaza emisor incorrecto y audiencia incorrecta; soporta JWT_ISSUER_ALLOWLIST con múltiples emisores válidos', async () => {
  const pair = generateEphemeralRsaJwkPair('kid_iss_aud');
  const files = writeTempAuthFiles({
    privContent: pair.privJwk,
    pubContent: pair.pubJwk,
    kidContent: pair.kid,
  });

  const { SignJWT, importJWK } = await import('jose');
  const privKey = await importJWK(pair.privJwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso1.imssb.gob.mx',
    JWT_ISSUER_ALLOWLIST: 'https://sso1.imssb.gob.mx, https://sso2.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  // Emisor secundario incluido en JWT_ISSUER_ALLOWLIST -> debe ser aceptado (200)
  const tokenSecondaryIssuer = await new SignJWT({ sub: 'user-2' })
    .setProtectedHeader({ alg: 'RS256', kid: pair.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso2.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(privKey);

  const outAllowedIss = await runRequireAuth(tokenSecondaryIssuer);
  assert.equal(outAllowedIss.nextCalled, true);
  assert.equal(outAllowedIss.res.statusCode, 200);

  // Caso 9: Emisor no autorizado -> 401 Invalid token issuer
  const tokenWrongIssuer = await new SignJWT({ sub: 'user-2' })
    .setProtectedHeader({ alg: 'RS256', kid: pair.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://evil.example.com')
    .setAudience('solicitudes-app')
    .sign(privKey);

  const outWrongIss = await runRequireAuth(tokenWrongIssuer);
  assert.equal(outWrongIss.nextCalled, false);
  assert.equal(outWrongIss.res.statusCode, 401);
  assert.deepEqual(outWrongIss.res.body, { error: 'Invalid token issuer' });

  // Caso 10: Audiencia incorrecta -> 401 Invalid/expired token
  const tokenWrongAud = await new SignJWT({ sub: 'user-2' })
    .setProtectedHeader({ alg: 'RS256', kid: pair.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso1.imssb.gob.mx')
    .setAudience('otra-app-distinta')
    .sign(privKey);

  const outWrongAud = await runRequireAuth(tokenWrongAud);
  assert.equal(outWrongAud.nextCalled, false);
  assert.equal(outWrongAud.res.statusCode, 401);
  assert.deepEqual(outWrongAud.res.body, { error: 'Invalid/expired token' });
});

test('11 y 12. Falla de forma cerrada (fail-closed) cuando JWT_AUDIENCE o JWT_ISSUER no están configurados', async () => {
  const pair = generateEphemeralRsaJwkPair('kid_config_missing');
  const files = writeTempAuthFiles({
    privContent: pair.privJwk,
    pubContent: pair.pubJwk,
    kidContent: pair.kid,
  });

  // Primero generamos un token válido con configuración completa
  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });
  const validToken = await signAccessToken({ sub: 'user-1' });

  // Caso 11: Audiencia NO configurada -> ni signAccessToken ni requireAuth deben permitir operar
  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
  });
  await assert.rejects(() => signAccessToken({ sub: 'user-1' }), (err) => {
    assert.ok(err instanceof JwtAuthError);
    assert.equal(err.code, 'JWT_CONFIG_INCOMPLETE');
    return true;
  });
  const outNoAud = await runRequireAuth(validToken);
  assert.equal(outNoAud.nextCalled, false);
  assert.equal(outNoAud.res.statusCode, 401);

  // Caso 12: Emisor NO configurado -> ni signAccessToken ni requireAuth deben permitir operar
  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_AUDIENCE: 'solicitudes-app',
  });
  await assert.rejects(() => signAccessToken({ sub: 'user-1' }), (err) => {
    assert.ok(err instanceof JwtAuthError);
    assert.equal(err.code, 'JWT_CONFIG_INCOMPLETE');
    return true;
  });
  const outNoIss = await runRequireAuth(validToken);
  assert.equal(outNoIss.nextCalled, false);
  assert.equal(outNoIss.res.statusCode, 401);
});

test('13, 14 y 15. Rechaza token expirado, token sin exp y token sin sub válido', async () => {
  const pair = generateEphemeralRsaJwkPair('kid_claims_check');
  const files = writeTempAuthFiles({
    privContent: pair.privJwk,
    pubContent: pair.pubJwk,
    kidContent: pair.kid,
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const { SignJWT, importJWK } = await import('jose');
  const privKey = await importJWK(pair.privJwk, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  // Caso 13: Token expirado
  const expiredToken = await new SignJWT({ sub: 'user-1' })
    .setProtectedHeader({ alg: 'RS256', kid: pair.kid })
    .setIssuedAt(now - 1200)
    .setExpirationTime(now - 60)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(privKey);

  const outExpired = await runRequireAuth(expiredToken);
  assert.equal(outExpired.nextCalled, false);
  assert.equal(outExpired.res.statusCode, 401);

  // Caso 14: Token sin claim `exp`
  const tokenNoExp = await new SignJWT({ sub: 'user-1' })
    .setProtectedHeader({ alg: 'RS256', kid: pair.kid })
    .setIssuedAt(now)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(privKey);

  const outNoExp = await runRequireAuth(tokenNoExp);
  assert.equal(outNoExp.nextCalled, false);
  assert.equal(outNoExp.res.statusCode, 401);

  // Caso 15: Token sin `sub` (o con `sub` vacío)
  const tokenNoSub = await new SignJWT({ email: 'nosub@imssb.gob.mx' })
    .setProtectedHeader({ alg: 'RS256', kid: pair.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(privKey);

  const outNoSub = await runRequireAuth(tokenNoSub);
  assert.equal(outNoSub.nextCalled, false);
  assert.equal(outNoSub.res.statusCode, 401);
});

test('16 y 17. Soporta JWKSet con varias llaves públicas autorizadas y rechaza llave pública que no corresponde a la privada', async () => {
  const pairOld = generateEphemeralRsaJwkPair('kid_old_2025');
  const pairNew = generateEphemeralRsaJwkPair('kid_new_2026');
  const pairMismatch = generateEphemeralRsaJwkPair('kid_mismatch');

  const files = writeTempAuthFiles({
    privContent: pairNew.privJwk,
    pubContent: {
      keys: [
        pairNew.pubJwk,
        pairOld.pubJwk,
        // Mismo kid 'kid_mismatch', pero material público de otro par distinto
        { ...pairOld.pubJwk, kid: 'kid_mismatch' },
      ],
    },
    kidContent: pairNew.kid,
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const { SignJWT, importJWK } = await import('jose');
  const now = Math.floor(Date.now() / 1000);

  // Token firmado con la llave nueva (activa) -> 200
  const tokenNew = await signAccessToken({ sub: 'user-new' });
  const outNew = await runRequireAuth(tokenNew);
  assert.equal(outNew.nextCalled, true);
  assert.equal(outNew.req.user.sub, 'user-new');

  // Token firmado con la llave anterior pero aún presente en el JWKSet -> 200
  const oldPrivKey = await importJWK(pairOld.privJwk, 'RS256');
  const tokenOld = await new SignJWT({ sub: 'user-old' })
    .setProtectedHeader({ alg: 'RS256', kid: pairOld.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(oldPrivKey);

  const outOld = await runRequireAuth(tokenOld);
  assert.equal(outOld.nextCalled, true);
  assert.equal(outOld.req.user.sub, 'user-old');

  // Caso 17: Token firmado con la privada de pairMismatch, cuya pública registrada bajo 'kid_mismatch' NO corresponde -> 401
  const mismatchPrivKey = await importJWK(pairMismatch.privJwk, 'RS256');
  const tokenMismatch = await new SignJWT({ sub: 'user-mismatch' })
    .setProtectedHeader({ alg: 'RS256', kid: 'kid_mismatch' })
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .setIssuer('https://sso.imssb.gob.mx')
    .setAudience('solicitudes-app')
    .sign(mismatchPrivKey);

  const outMismatch = await runRequireAuth(tokenMismatch);
  assert.equal(outMismatch.nextCalled, false);
  assert.equal(outMismatch.res.statusCode, 401);
  assert.deepEqual(outMismatch.res.body, { error: 'Invalid/expired token' });
});

test('18. Error de lectura de archivo JWK no filtra rutas del servidor ni detalles internos en respuestas HTTP', async () => {
  const pair = generateEphemeralRsaJwkPair('kid_leak_check');
  const files = writeTempAuthFiles({
    privContent: pair.privJwk,
    pubContent: pair.pubJwk,
    kidContent: pair.kid,
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: files.privPath,
    JWKS_PUBLIC_PATH: files.pubPath,
    ACTIVE_KID_FILE: files.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const validToken = await signAccessToken({ sub: 'user-1' });

  // Apuntamos JWKS_PUBLIC_PATH a una ruta inexistente con nombre sensible
  const missingSecretPath = path.join(tmpRoot, 'ruta-secreta-servidor-interno', 'missing_pub.jwk.json');
  resetTestEnv({
    JWKS_PUBLIC_PATH: missingSecretPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const { res, nextCalled } = await runRequireAuth(validToken);
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  const serialized = JSON.stringify(res.body);
  assert.equal(res.body.detail, undefined, 'No debe incluir la propiedad detail en respuestas 401');
  assert.doesNotMatch(serialized, /ruta-secreta-servidor-interno/);
  assert.doesNotMatch(serialized, /ENOENT/);
});

test('20. Fallo de signAccessToken() por configuración JWK faltante ejecuta ROLLBACK transaccional en LocalAuthService.refresh()', async () => {
  // Desconfiguramos JWKS_PRIVATE_PATH para que signAccessToken falle de forma controlada antes del COMMIT
  resetTestEnv({
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const jti = '99999999-9999-4999-8999-999999999999';
  const raw = 'secret-refresh-token';
  const hashed = await argon2.hash(raw);

  const clientQueries = [];
  let inTx = false;
  let released = false;

  const mockDb = {
    async query() {
      throw new Error('Direct pool.query() should not be used');
    },
    async connect() {
      return {
        async query(sqlText) {
          const sql = String(sqlText).trim();
          clientQueries.push(sql);
          if (sql === 'BEGIN') {
            inTx = true;
            return { rows: [], rowCount: 0 };
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            inTx = false;
            return { rows: [], rowCount: 0 };
          }
          if (/SELECT \* FROM public\.app_refresh_tokens/i.test(sql)) {
            return {
              rows: [{
                jti,
                user_id: 'user-tx-1',
                hashed_token: hashed,
                user_agent: null,
                ip: null,
                expires_at: new Date(Date.now() + 3600_000).toISOString(),
                revoked_at: null,
              }],
              rowCount: 1,
            };
          }
          if (/INSERT INTO public\.app_refresh_tokens/i.test(sql)) {
            return { rows: [], rowCount: 1 };
          }
          if (/UPDATE public\.app_refresh_tokens/i.test(sql)) {
            return { rows: [], rowCount: 1 };
          }
          if (/SELECT id, email, name, status FROM public\.app_users/i.test(sql)) {
            return {
              rows: [{ id: 'user-tx-1', email: 'tx@imssb.gob.mx', name: 'TX User', status: 'ACTIVE' }],
              rowCount: 1,
            };
          }
          if (/FROM public\.app_user_roles/i.test(sql)) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {
          released = true;
        },
      };
    },
  };

  // Instanciamos LocalAuthService usando el signAccessToken REAL de src/auth/jwt.ts
  const service = new LocalAuthService({ db: mockDb });

  await assert.rejects(
    () => service.refresh(`${jti}.${raw}`),
    (err) => {
      assert.ok(err instanceof JwtAuthError);
      assert.equal(err.code, 'JWT_CONFIG_INCOMPLETE');
      return true;
    }
  );

  assert.equal(released, true, 'El cliente PostgreSQL debe liberarse tras el fallo de firma');
  assert.equal(inTx, false, 'La transacción no debe quedar abierta');
  assert.equal(clientQueries.at(-1), 'ROLLBACK', 'Debe haberse ejecutado ROLLBACK antes de liberar el cliente');
  assert.ok(!clientQueries.includes('COMMIT'), 'Nunca debe ejecutarse COMMIT si signAccessToken falla');
});

test('21 (6.2C). Selección estricta de llave privada: acepta JWKSet con kid activo coincidente y rechaza JWKSet sin coincidencia o privada sin kid', async () => {
  const pair1 = generateEphemeralRsaJwkPair('kid_priv_1');
  const pair2 = generateEphemeralRsaJwkPair('kid_priv_2');

  // Caso A: JWKSet privado donde la segunda llave coincide con ACTIVE_KID ('kid_priv_2')
  const filesValidSet = writeTempAuthFiles({
    privContent: { keys: [pair1.privJwk, pair2.privJwk] },
    pubContent: { keys: [pair1.pubJwk, pair2.pubJwk] },
    kidContent: 'kid_priv_2',
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: filesValidSet.privPath,
    JWKS_PUBLIC_PATH: filesValidSet.pubPath,
    ACTIVE_KID_FILE: filesValidSet.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const tokenFromSet = await signAccessToken({ sub: 'user-set-2' });
  const outSet = await runRequireAuth(tokenFromSet);
  assert.equal(outSet.nextCalled, true);
  assert.equal(outSet.req.user.sub, 'user-set-2');

  // Caso B: JWKSet privado donde NINGUNA llave coincide con ACTIVE_KID ('kid_missing_in_set') -> NO debe hacer fallback a keys[0]
  const filesNoMatch = writeTempAuthFiles({
    privContent: { keys: [pair1.privJwk, pair2.privJwk] },
    pubContent: { keys: [pair1.pubJwk, pair2.pubJwk] },
    kidContent: 'kid_missing_in_set',
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: filesNoMatch.privPath,
    JWKS_PUBLIC_PATH: filesNoMatch.pubPath,
    ACTIVE_KID_FILE: filesNoMatch.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  await assert.rejects(
    () => signAccessToken({ sub: 'user-no-match' }),
    (err) => {
      assert.ok(err instanceof JwtAuthError);
      assert.equal(err.code, 'JWT_KEY_IMPORT_ERROR');
      assert.match(err.message, /Active kid not found in JWKS_PRIVATE_PATH/);
      return true;
    }
  );

  // Caso C: Llave privada individual SIN propiedad `kid` -> debe rechazarse aunque ACTIVE_KID exista
  const privWithoutKid = { ...pair1.privJwk };
  delete privWithoutKid.kid;

  const filesMissingKidOnPriv = writeTempAuthFiles({
    privContent: privWithoutKid,
    pubContent: pair1.pubJwk,
    kidContent: pair1.kid,
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: filesMissingKidOnPriv.privPath,
    JWKS_PUBLIC_PATH: filesMissingKidOnPriv.pubPath,
    ACTIVE_KID_FILE: filesMissingKidOnPriv.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  await assert.rejects(
    () => signAccessToken({ sub: 'user-priv-no-kid' }),
    (err) => {
      assert.ok(err instanceof JwtAuthError);
      assert.equal(err.code, 'JWT_KEY_IMPORT_ERROR');
      assert.match(err.message, /Private JWK in JWKS_PRIVATE_PATH is missing kid/);
      return true;
    }
  );
});

test('22 (6.2C). Rechaza JWKSet público con kid duplicado tanto en requireAuth como en verifyLocalAccess/getPublicJwk', async () => {
  const pairA = generateEphemeralRsaJwkPair('kid_dup_1');
  const pairB = generateEphemeralRsaJwkPair('kid_dup_1'); // Distinto par RSA pero declarando el MISMO kid

  // Primero firmamos un token válido con pairA
  const validFiles = writeTempAuthFiles({
    privContent: pairA.privJwk,
    pubContent: pairA.pubJwk,
    kidContent: 'kid_dup_1',
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: validFiles.privPath,
    JWKS_PUBLIC_PATH: validFiles.pubPath,
    ACTIVE_KID_FILE: validFiles.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  const token = await signAccessToken({ sub: 'user-dup-test' });

  // Ahora configuramos JWKS_PUBLIC_PATH con dos llaves distintas que declaran el mismo `kid_dup_1`
  const dupPubFiles = writeTempAuthFiles({
    privContent: pairA.privJwk,
    pubContent: { keys: [pairA.pubJwk, pairB.pubJwk] },
    kidContent: 'kid_dup_1',
  });

  resetTestEnv({
    JWKS_PRIVATE_PATH: dupPubFiles.privPath,
    JWKS_PUBLIC_PATH: dupPubFiles.pubPath,
    ACTIVE_KID_FILE: dupPubFiles.kidPath,
    JWT_ISSUER: 'https://sso.imssb.gob.mx',
    JWT_AUDIENCE: 'solicitudes-app',
  });

  // 1) En jwt.ts: getPublicJwk() y verifyLocalAccess() deben rechazar el JWKSet completo
  assert.throws(
    () => getPublicJwk(),
    (err) => {
      assert.ok(err instanceof JwtAuthError);
      assert.equal(err.code, 'JWT_KEY_IMPORT_ERROR');
      assert.match(err.message, /Duplicate kid in JWKS_PUBLIC_PATH/);
      return true;
    }
  );

  await assert.rejects(
    () => verifyLocalAccess(token),
    (err) => {
      assert.ok(err instanceof JwtAuthError);
      assert.equal(err.code, 'JWT_KEY_IMPORT_ERROR');
      assert.match(err.message, /Duplicate kid in JWKS_PUBLIC_PATH/);
      return true;
    }
  );

  // 2) En requireAuth.ts: debe rechazar con 401 sin aceptar el token
  const outRequireAuth = await runRequireAuth(token);
  assert.equal(outRequireAuth.nextCalled, false);
  assert.equal(outRequireAuth.res.statusCode, 401);
  assert.deepEqual(outRequireAuth.res.body, { error: 'Invalid/expired token' });
});
