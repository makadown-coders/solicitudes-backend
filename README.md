# Solicitudes / Abasto — Backend (Node + Express + TS) 🧾

Backend en **Node.js + Express (TypeScript)** que expone servicios REST para:
- **Solicitudes de artículos** (autocompletado vía **PostgreSQL**).
- **Abasto** (citas, existencias, CPMs, trazabilidad, RDLS, factores, feature flags, etc.) sobre **PostgreSQL** y **Power Automate** (Excel en Base64).
- **Auth local** (SSO artesanal con JWT RS256 + refresh rotatorio en PostgreSQL).

> ⚠️ Nota operativa: Para datos masivos (citas/inventario) se consulta **Power Automate** y se retorna **Base64**; persistir todo en Postgres en free tiers puede dormir el contenedor y degradar UX.

---

## 🚀 Módulos y endpoints

### 🆕 Cambios en endpoints de esta rama
**Nuevos/expandidos:**
- CPMs: `/api/cpms` (fetch Base64), `/by-unidad-all`, `PATCH /`, `POST /batch`, `/rutas-salud-claves`.
- Existencias: `/api/existencias-temp/by-unidad-full`, `/api/existencias-temp/almacenes-full`.
- Trazabilidad: `/api/trazabilidad/all-factores-conversion`.
- Citas: endpoints de ingesta y métricas (`/init`, `/batch`, `/stats/*`, `/xclave`, `/slim-existencia`).
- Auth: `/api/auth/logout-all`.
- TI/Inventario: `/api/catalogos/*`, `/api/dispositivos`, `/api/ti/personas`, `/api/dispositivos/:id/asignaciones`, `/api/ti/unidades`.
- Balanceo: `/api/balanceo/*`.
- Kits: `/api/kits/*`, `/api/kits/:kitId/claves`, `/api/kits/:codigo/clavesByCodigo`,
  `/api/kits/:kitId/unidades`, `/api/unidades-kits/:unidadId/kits`, `/api/carga-masiva/cpm-kits/*`.
- Radar de abasto global: `/api/radar-abasto/global/snapshot`, `/global/timeline`, `/global/claves-riesgo`.

**Deprecados:** por ahora, ninguno en esta rama.

### 📘 Artículos (PostgreSQL)
Búsqueda de artículos para autocompletado del front.
```
GET /api/articulos?q=paracetamol            # q ≥ 3 chars
```

### 🗂️ Config / Feature Flags (Postgres)
Flags efectivos, listado, actualización y allowlist de unidades.
```
GET    /api/solicitudes-config/effective?cluesimb=BCIMB001656&nivel=PRIMER_NIVEL
GET    /api/solicitudes-config
PATCH  /api/solicitudes-config               # { flag_key, scope, scope_id?, value }
GET    /api/solicitudes-config/allowlist-unidades
```
Claves actuales (valores JSON, típicamente boolean):
- `SOLO_CPMS`
- `BUSCAR_EXISTENCIA_EN_CLUES`
- `APLICAR_ENCUESTAS`
- `APLICAR_EQUIVALENCIAS`
- `CLUES_EXISTENCIAS_ALLOWLIST`
- `IMPORT_LIMIT_TO_KIT`
- `EDIT_CPMS` (lista JSON)

### 📦 Existencias (temporales) por unidad (Postgres)
Staging en `tmp_existencias` con **resolución de unidad** por `cluesimb` / `cluessa` / `alias_sas`.
```
POST   /api/existencias-temp/init?reset=true         # inicializa staging
POST   /api/existencias-temp/batch                   # { fuente, fecha_corte, rows: BatchRow[] }
GET    /api/existencias-temp/by-unidad?cluesimb=...  # existencias agregadas por clave para esa unidad
GET    /api/existencias-temp/has-by-unidad?cluesimb=... # boolean
GET    /api/existencias-temp/by-unidad-full?cluesimb=... # detalle completo por unidad
GET    /api/existencias-temp/almacenes-full?cluesimb=... # detalle por almacén para unidad
```
`BatchRow`:
```ts
{ clave_cnis: string; existencia: number; alias_sas?: string; cluessa?: string; cluesimb?: string }
```

### 📈 CPMs (Postgres)
Consulta por unidad y cruce **expected vs cpm** (views: `v_unidad_cpm`, `v_unidad_kit_claves_expected_vs_cpm`).
```
GET /api/cpms                                   # base64 desde Power Automate
GET /api/cpms/by-unidad?cluesimb=... | ?cluessa=...      # sólo cpm > 0
GET /api/cpms/by-unidad-all?cluesimb=... | ?cluessa=...  # incluye cpm = 0
GET /api/cpms/expected-vs?cluesimb=...&kit=KIT_147&clave=010.000.5720.01&limit=&offset=
PATCH /api/cpms                                  # upsert individual
POST  /api/cpms/batch                            # upsert batch
GET   /api/cpms/rutas-salud-claves               # catálogo rutas/claves
```

### 🔎 Trazabilidad (Postgres)
Unifica **entradas**, **traspasos**, **salidas** (+ inventario inicial) para una clave/unidad.  
Aplica **factor de conversión** a entradas/traspasos cuando el modal es de *unidad* (no almacén).
```
GET /api/trazabilidad?clave=010.000.5720.01&cluesimb=BCIMB001656
GET /api/trazabilidad/all-factores-conversion
```

### 🧮 Factores de conversión (Postgres)
```
GET /api/factores/:clave
GET /api/factores/factor?clave=...&clues=BCIMB001656
```

### 🚚 RDLS — Rutas de Salud (Postgres)
Salidas hacia exterior con paginación por cursor.
```
GET /api/rdls/salidas-exterior?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&ventanaDias=30&limit=200&cursor=...
```

### 🚨 Radar de Abasto (Postgres)
Eventos de riesgo por unidad/clave y vistas globales del estado de abasto.
```
POST /api/radar-abasto/eventos
GET  /api/radar-abasto/eventos
GET  /api/radar-abasto/global/snapshot
GET  /api/radar-abasto/global/timeline
GET  /api/radar-abasto/global/claves-riesgo
GET  /api/radar-abasto/eventos/:id
PATCH /api/radar-abasto/eventos/:id
POST  /api/radar-abasto/eventos/:id/recalcular
```

### 🧾 Citas (Power Automate → Base64)
Uso vigente: retornar payload comprimido desde el flujo (no se persiste en DB aquí).
```
GET /api/citas/full
POST /api/citas/init                              # ?reset=true|false
POST /api/citas/batch                             # { rows: Row[] }
GET  /api/citas                                   # búsqueda (query params)
GET  /api/citas/stats/resumen
GET  /api/citas/stats/proveedores
GET  /api/citas/stats/cumplimiento-claves
POST /api/citas/stats/refresh-mv
GET  /api/citas/xclave
GET  /api/citas/slim-existencia
```

### 📦 Inventario de almacenes (Power Automate → Base64)
Endpoints por almacén o consolidado (variables de entorno por almacén).
```
GET /api/inventario                         # consolidado (Base64)
GET /api/inventario/HGENS | /HGMXL | /HGTKT | /HGTIJ | /HGTZE | /HMITIJ | /HGPR | /HMIMXL | /UOMXL
```

### 🧪 Historial / Encuesta piloto (Power Automate → SharePoint)
- Envío de PDF/Base64 de solicitud (para respaldo/SharePoint).
- Encuesta piloto (CSAT/facilidad/terminó sin trabas).
```
POST /api/historial                         # { cluesimb, nombreArchivo, base64, ... }
POST /api/historial/encuesta                # { timestamp, cluesimb, pilot_site, evento, facilidad_1_5, termino_sin_trabas, csat_1_5, comentario?, app_version? }
```

### 🏷️ Catálogos (Postgres)
CRUD básico:
```
/api/unidades     /api/municipios     /api/localidades     /api/tipo-unidad
```
Catálogos TI:
```
GET /api/catalogos/tipos-dispositivo
GET /api/catalogos/tipos-periferico
GET /api/catalogos/estados-dispositivo
```

### 🧑‍💻 TI: Personas, Dispositivos y Asignaciones (Postgres)
```
GET    /api/ti/personas
GET    /api/ti/personas/:id
POST   /api/ti/personas
PUT    /api/ti/personas/:id
DELETE /api/ti/personas/:id

GET    /api/dispositivos
POST   /api/dispositivos
GET    /api/dispositivos/:id
PUT    /api/dispositivos/:id
POST   /api/dispositivos/:id/asignacion
POST   /api/dispositivos/:id/monitores
PUT    /api/dispositivos/:id/monitores/:monitorId
DELETE /api/dispositivos/:id/monitores/:monitorId
POST   /api/dispositivos/:id/perifericos
PUT    /api/dispositivos/:id/perifericos/:perifericoId
DELETE /api/dispositivos/:id/perifericos/:perifericoId

GET  /api/dispositivos/:id/asignaciones
POST /api/dispositivos/:id/asignaciones
```

### 🏥 Catálogo TI de unidades
```
GET /api/ti/unidades?municipio_id=&localidad_id=&tipo_unidad_id=&q=&page=&pageSize=
```

### ⚖️ Balanceo (Postgres)
```
POST /api/balanceo/ejecutar
GET  /api/balanceo/ultima-ejecucion
GET  /api/balanceo/resumen-actual
GET  /api/balanceo/detalle-actual
```

### 🧰 Kits y configuración CPM
```
GET    /api/kits
POST   /api/kits
PUT    /api/kits/:id
DELETE /api/kits/:id

POST /api/kits/import-matrix
GET  /api/kits/matrix
POST /api/kits/import-one

GET    /api/kits/:kitId/claves
POST   /api/kits/:kitId/claves
DELETE /api/kits/:kitId/claves/:id

GET /api/kits/:codigo/clavesByCodigo

GET /api/kits/:kitId/unidades
PUT /api/kits/:kitId/unidades

GET /api/unidades-kits/:unidadId/kits

POST /api/carga-masiva/cpm-kits/init
POST /api/carga-masiva/cpm-kits/batch
```

### 📥 Carga masiva (Postgres)
Inicializa/ingesta para `entrada`, `traspaso`, `salida`, `inventario_inicial`:
```
POST /api/carga/entradas/init              # limpia tabla
POST /api/carga/entradas/batch             # inserta lote
POST /api/carga/traspasos/init
POST /api/carga/traspasos/batch
POST /api/carga/salidas/init
POST /api/carga/salidas/batch
POST /api/carga/inventario-inicial/init
POST /api/carga/inventario-inicial/batch
```

### 🔐 Auth (SSO local)
```
POST /api/auth/login       # { email, password }          -> { access_token, refresh_token, ... }
POST /api/auth/refresh     # { refresh_token }            -> { access_token, refresh_token, user }
GET  /api/auth/me          # Bearer <access_token> (requireAuth)
POST /api/auth/logout
POST /api/auth/logout-all
```

---

## 🛠️ Stack Tecnológico

- **Runtime:** Node.js 18+ (recomendado 20+), Express, TypeScript  
- **DB:** PostgreSQL  
- **Integraciones:** Power Automate (Excel→Base64), SharePoint  
- **Auth:** SSO local (JWT RS256 + refresh rotatorio en Postgres)  
- **Otros:** `compression` (payloads grandes), CORS habilitado

---

## 📦 Instalación local

```bash
git clone https://github.com/tu-usuario/solicitudes-backend.git
cd solicitudes-backend
npm install
```

### Desarrollo
```bash
npm run dev            # ts-node + nodemon
```

### Build & producción
```bash
npm run build          # compila a dist/
npm start              # arranca dist/
```

> Asegúrate de tener PostgreSQL accesible.

---

## ⚙️ Variables de entorno

```ini
# Servidor
PORT=3000
NODE_ENV=development

# PostgreSQL (abasto)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=nombrebd
POSTGRES_USERNAME=usuario
POSTGRES_PASSWORD=clave

# Power Automate (Citas)
AZURE_URL=https://prod-xx.logic.azure.com/...           # flujo de citas (Base64)
AZURE_CPM_URL=https://prod-xx.logic.azure.com/...       # flujo de CPMs (Base64)
AZURE_PAYLOAD_SECRET=...                                # secreta para payload

# Power Automate (Inventario por almacén / consolidado)
AZURE_INV_URL=https://prod-xx.logic.azure.com/...       # consolidado
AZURE_HGENS_URL=...
AZURE_HGMXL_URL=...
AZURE_HGTKT_URL=...
AZURE_HGTIJ_URL=...
AZURE_HMITIJ_URL=...
AZURE_HGPR_URL=...
AZURE_HMIMXL_URL=...
AZURE_UOMXL_URL=...
AZURE_HGTZE_URL=...

# Power Automate (SharePoint)
AZURE_SP_ABASTO_URL=...     # envío de archivo solicitud
AZURE_SP_ENCUESTA_URL=...   # envío de encuesta piloto

# Auth local (SSO JWT)
JWT_ISSUER=https://imssb-bc.local
JWT_AUDIENCE=imssb-bc
ACCESS_TTL_SECONDS=900
REFRESH_TTL_DAYS=14
JWKS_PUBLIC_PATH=keys/current_public.jwk.json
JWKS_PRIVATE_PATH=keys/current_private.jwk.json
ACTIVE_KID_FILE=keys/ACTIVE_KID
JWT_ISSUER_ALLOWLIST=https://imssb-bc.local

# Otros
SOLICITUDES_HASH_SALT=...
ADMIN_KEY=...

# Supabase (legacy / opcional)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...   # publishable
SUPABASE_SERVICE_ROLE_KEY=...     # opcional (admin ops)
```

---

## 🔧 Requisitos de base de datos (Postgres)

- Tablas típicas de logística: `entrada`, `traspaso`, `salida`, `inventario_inicial`, `unidad_medica`, `unidad_medica_alias`, `tipo_unidad`, etc.
- **Views requeridas**:
  - `v_unidad_cpm`
  - `v_unidad_kit_claves_expected_vs_cpm`
- Staging: `tmp_existencias` (para `/api/existencias-temp`).
- Flags: `feature_flags` (con `flag_key`, `scope`, `scope_id`, `value_json`, `updated_at`).
- Factores: tablas para factor de conversión por clave/clues.
- Radar: `radar_eventos`, `radar_evento_claves` (para `/api/radar-abasto/*`).

> Si una vista/tabla no existe, los endpoints relacionados fallarán con 400/500.

---

## 🔒 Seguridad

- (En construcción) Protege con `requireAuth` los endpoints sensibles (ej. `PATCH /api/solicitudes-config`).  
- CORS habilitado; ajusta orígenes permitidos para producción.

---

## ☁️ Deploy

- **Koyeb ** . Considera:
  - Free tiers pueden dormir contenedores → evita jobs de larga duración.
  - Para datos grandes (citas/inventario), **prefiere** flujos **Power Automate → Base64**.
- Define variables en el panel del proveedor.

---

## 🧭 Roadmap corto

- Endpoints paginados para `trazabilidad` y `existencias-temp/by-unidad`.
- Cache opcional en Redis para `existencias-temp`.
- Endpoints protegidos por rol/claim (admin para flags).

## SSO Local

Esta version agrega un **SSO local** (JWT RS256 + refresh rotatorio en Postgres) sin romper el contrato actual de rutas:
- `POST /api/auth/login` → `{ access_token, refresh_token, user }`
- `POST /api/auth/refresh` → `{ access_token, refresh_token, user }`
- `GET  /api/auth/me` (Bearer) → perfil básico
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`

Para más detalles consultar README_SSO.md
---

## 👤 Autor

## 📋 Acerca de esta aplicación

Esta herramienta es un apoyo en piloto para capturar solicitudes de insumos médicos en **IMSS-Bienestar Baja California**.  
Facilita pedidos ordinarios y extraordinarios, con validaciones, precargas y exportación a Excel.  
**No reemplaza sistemas oficiales.**

| Rol | Nombre |
| --- | --- |
| **Coordinador Institucional del Proyecto** | Lic. Héctor Manuel Avelar Morales |
| **Referente Técnico-Operativo** *(Lineamientos de Abasto)* | Lic. Elia Del Carmen Rojas Villalas / Lic. Abril Núñez Madrid |
| **Diseño y Desarrollo Tecnológico** | Ing. Mario Arturo Serrano Flores |

<p align="center">© 2026 IMSS Bienestar – Baja California</p>


---

## 📄 Licencia
MIT
