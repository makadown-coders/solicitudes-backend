# SSO Local — IMSSB-BC (para `solicitudes-backend`)

Implementa un **SSO propio** con **JWT RS256** y **refresh tokens rotatorios** en Postgres (tablas en `public` con prefijo `app_`). Mantiene el contrato actual de rutas:

* `POST /api/auth/login` → `{ access_token, refresh_token, user }`
* `POST /api/auth/refresh` → `{ access_token, refresh_token }`
* `GET  /api/auth/me` (Bearer) → `{ profile }`
* `POST /api/auth/logout` *(opcional si lo implementas)*

## Archivos añadidos/modificados

```
scripts/generate-keys.ts
scripts/hash-password.ts
src/setup/env.ts                 # carga dotenv una sola vez
src/db/pool.ts                   # Pool de Postgres único
src/auth/jwt.ts                  # firma JWT RS256
src/auth/jwks.controller.ts      # expone /.well-known/jwks.json
src/auth/requireAuth.ts          # verifica JWT local (allowlist de iss)
src/services/IAuthProvider.ts    # interfaz (para crecer a multi-proveedor)
src/services/localAuth.service.ts
src/services/auth.service.ts     # usa el provider local por defecto
```

---

## 1) Dependencias

```bash
npm i argon2 jose
```

---

## 2) Variables de entorno

Añade a `.env`:

```
# Emisor/Audiencia JWT
JWT_ISSUER=https://imssb-bc.local
JWT_AUDIENCE=imssb-bc

# TTLs
ACCESS_TTL_SECONDS=900
REFRESH_TTL_DAYS=14

# Rutas a llaves (generadas abajo)
JWKS_PUBLIC_PATH=keys/current_public.jwk.json
JWKS_PRIVATE_PATH=keys/current_private.jwk.json
ACTIVE_KID_FILE=keys/ACTIVE_KID

# (Opcional) aceptar varios emisores durante transición
JWT_ISSUER_ALLOWLIST=https://imssb-bc.local,https://xxxxx-xxxxxxx-xxxxxxx-xxxxxxxx.koyeb.app

# Postgres (usa DATABASE_URL o variables sueltas)
# DATABASE_URL=postgres://user:pass@host:5432/db
POSTGRES_HOST=...
POSTGRES_PORT=5432
POSTGRES_DATABASE=...
POSTGRES_USERNAME=...
POSTGRES_PASSWORD=...
```

> El `iss` no requiere DNS real; es un **identificador**. Si luego usas tu URL pública real (Koyeb/on-prem), agrégala en `JWT_ISSUER_ALLOWLIST` mientras migras.

---

## 3) Inicialización de llaves

```bash
npx ts-node scripts/generate-keys.ts
```

Esto crea:

```
keys/current_public.jwk.json
keys/current_private.jwk.json
keys/ACTIVE_KID
```

> Si ves `non-extractable CryptoKey...`, asegúrate de usar `generateKeyPair('RS256', { extractable: true, modulusLength: 2048 })`.

---

## 4) Cargar dotenv + Pool único

En **`src/app.ts`** (al inicio):

```ts
import './setup/env';
```

**`src/setup/env.ts`**

```ts
import 'dotenv/config';
```

**`src/db/pool.ts`**

```ts
import { Pool } from 'pg';

export const pool = process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== ''
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DATABASE,
      user: process.env.POSTGRES_USERNAME,
      password: process.env.POSTGRES_PASSWORD,
    });
```

---

## 5) Esquema de identidad (tablas en `public` con prefijo `app_`)

Ejecuta en tu Postgres:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'app_role_scope_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.app_role_scope_type AS ENUM ('GLOBAL','CLUES','DEPTO');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.app_permissions (
  code TEXT PRIMARY KEY,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.app_role_permissions (
  role_id UUID REFERENCES public.app_roles(id) ON DELETE CASCADE,
  perm_code TEXT REFERENCES public.app_permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, perm_code)
);

CREATE TABLE IF NOT EXISTS public.app_user_roles (
  user_id UUID REFERENCES public.app_users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.app_roles(id) ON DELETE CASCADE,
  scope_type public.app_role_scope_type NOT NULL DEFAULT 'GLOBAL',
  scope_id TEXT NOT NULL DEFAULT '*',  -- sentinela para GLOBAL
  PRIMARY KEY (user_id, role_id, scope_type, scope_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_user_roles_scope_coherence'
  ) THEN
    ALTER TABLE public.app_user_roles ADD CONSTRAINT app_user_roles_scope_coherence
    CHECK (
      (scope_type::text = 'GLOBAL' AND scope_id = '*')
      OR
      (scope_type::text <> 'GLOBAL' AND scope_id IS NOT NULL)
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.app_refresh_tokens (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  hashed_token TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID REFERENCES public.app_refresh_tokens(jti)
);

CREATE INDEX IF NOT EXISTS idx_app_refresh_user    ON public.app_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_app_refresh_expires ON public.app_refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.app_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  resource TEXT,
  ip TEXT,
  user_agent TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB
);

-- Seeds base
INSERT INTO public.app_roles(code, description) VALUES
('ADMIN_TIC','Administrador TI'),
('OPERADOR','Operación general')
ON CONFLICT (code) DO NOTHING;
```

---

## 6) Montar JWKS

En **`src/app.ts`**:

```ts
import { jwksHandler } from './auth/jwks.controller';
app.get('/.well-known/jwks.json', jwksHandler);
```

---

## 7) Usuario inicial y rol

**Hash argon2**

```bash
npx ts-node scripts/hash-password.ts "TuPasswordFuerte#2025"
```

**Usuario**

```sql
INSERT INTO public.app_users(email, password_hash, name)
VALUES ('admin@imssb.bc', '<PEGA_HASH_AQUI>', 'Admin TI')
ON CONFLICT (email) DO NOTHING;
```

**Rol global (`scope_id='*'`)**

```sql
INSERT INTO public.app_user_roles(user_id, role_id, scope_type, scope_id)
SELECT u.id, r.id, 'GLOBAL'::public.app_role_scope_type, '*'
FROM public.app_users u
JOIN public.app_roles r ON r.code='ADMIN_TIC'
WHERE u.email='admin@imssb.bc'
ON CONFLICT DO NOTHING;
```

> En las respuestas de API/JWT, `scope_id='*'` se expone como `null` para no filtrar el sentinela.

---

## 8) Contratos de endpoints

**Login**

```
POST /api/auth/login
{ "email": "admin@imssb.bc", "password": "TuPasswordFuerte#2025" }
→ 200 { access_token, refresh_token, user }
```

**Me**

```
GET /api/auth/me
Authorization: Bearer <access_token>
→ 200 { profile }
```

**Refresh** *(rotación segura: INSERT nuevo → UPDATE viejo → COMMIT)*

```
POST /api/auth/refresh
{ "refresh_token": "<actual>" }
→ 200 { access_token, refresh_token }
```

**JWKS**

```
GET /.well-known/jwks.json
→ 200 { keys: [ { kid, kty, alg, n, e } ] }
```

---

## 9) Verificaciones en DB

```sql
-- Duplicados (no debería haber)
SELECT email, COUNT(*) c FROM public.app_users GROUP BY email HAVING COUNT(*)>1;

-- Tokens activos por usuario
SELECT user_id, COUNT(*) FROM public.app_refresh_tokens
WHERE revoked_at IS NULL AND expires_at > now()
GROUP BY user_id ORDER BY 2 DESC;

-- Purga tokens vencidos (job diario recomendado)
DELETE FROM public.app_refresh_tokens WHERE expires_at < now();
```

---

## 10) Notas de operación

* **Reloj del server**: si difiere mucho, fallan `iat/exp`.
* **Rotación de llaves**: genera nuevas, actualiza `ACTIVE_KID`; mantén la pública anterior en JWKS hasta que caduquen tokens viejos.
* **Issuer allowlist**: durante migraciones de dominio, usa `JWT_ISSUER_ALLOWLIST`; al final deja solo el definitivo.
* **No uses dominio de frontend** como `iss` (el emisor es el backend).

---

## 11) Troubleshooting

* `non-extractable CryptoKey...` → usa `{ extractable: true }` al generar llaves.
* `...replaced_by_fkey` en `/refresh` → inserta **primero** el nuevo token y **después** actualiza el viejo dentro de `BEGIN/COMMIT`.
* Error de tipos en `requireAuth` → no retornes `Response`; usa `return;` vacío (tipo `Promise<void>`).

