# Solicitudes App (backend) 🧾

Aplicación backend en Node.js + Express que expone servicios RESTful para dos módulos:
- **Solicitudes de artículos** con base SQLite.
- **Citas de abasto** con base PostgreSQL.

## 🚀 Características por módulo

### 📦 Módulo: Solicitudes
- Captura dinámica tipo todo-list con frontend Angular.
- Autocompletado de artículos con búsqueda por clave o descripción (`/api/articulos?q=...`).
- Base de datos local SQLite.

### 🩺 Módulo: Citas Abasto (v1.0.0)
- API REST con soporte de paginación, ordenamiento y filtrado.
- Conexión a PostgreSQL.
- Búsqueda global (`search`) sobre múltiples campos.
- Filtros individuales combinables.
- Ordenamiento por columna (`sortBy`, `sortOrder`).
- Paginación controlada (`page`, `limit`), con compatibilidad de frontend para control dinámico.
- Carga inicial de datos desde archivo Excel (vía Power Automate).

---

## 🛠️ Stack Tecnológico
- **Backend:** Node.js + Express
- **Base de datos:** SQLite (artículos) + PostgreSQL (citas)
- **Excel parsing:** `xlsx`

---

## 📦 Instalación local del backend

```bash
git clone https://github.com/tu-usuario/solicitudes-backend.git
cd solicitudes-backend
npm install
```

### 🔧 Ejecutar en desarrollo con nodemon + ts-node
```bash
npm run dev
```

### 🏗️ Compilar a producción (carpeta `dist`)
```bash
npm run build
```

### 🚀 Ejecutar build compilado
```bash
npm start
```

---

## 🌱 Semilla automática de citas
Al iniciar el servidor, si la tabla `citas` en PostgreSQL está vacía, se invoca automáticamente un flujo de Power Automate para recuperar un archivo `.xlsx`, se transforma y se inserta en la tabla.

## 📄 Variables de entorno requeridas

```
# Comunes
PORT=3000

# Artículos
DB_PATH=./db/articulos.sqlite

# PostgreSQL para citas
POSTGRES_USERNAME=usuario
POSTGRES_PASSWORD=clave
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=nombrebd

# Flujo de Power Automate
AZURE_URL=https://prod-xx.westus.logic.azure.com:... (URL del flujo)
AZURE_PAYLOAD_SECRET=... (clave secreta esperada por el flujo)
```

---

## ☁️ Deploy

### 🚀 Railway (SQLite)
Usado solo para el módulo de artículos. Sigue esta guía:
👉 [https://docs.railway.app/guides/express](https://docs.railway.app/guides/express)

```bash
railway up
```

---

## 🔌 Endpoints disponibles

### 📘 Artículos
```
GET /api/articulos?q=paracetamol
```

### 📘 Citas Abasto
```
GET /api/citas?page=1&limit=25&search=ceftriaxona
```
Parámetros soportados:
- `page`, `limit`
- `search` global
- Filtros por campo (e.g. `proveedor=Roche`)
- Ordenamiento: `sortBy=clave_cnis&sortOrder=ASC`

---

## 👨‍💻 Autor

Desarrollado por Mario Arturo Serrano Flores 🧑‍💻

---

## 📄 Licencia
MIT
