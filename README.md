# Solicitudes App (backend) 🧾

Aplicación backend en Node.js + Express que expone servicios RESTful para dos módulos:
- **Solicitudes de artículos** con base SQLite.
- **Citas de abasto** usando power automate para extraer un archivo compartido de Excel y comprimirlo en base64.

## 🚀 Características por módulo

### 📦 Módulo: Solicitudes
- Captura dinámica tipo todo-list con frontend Angular.
- Autocompletado de artículos con búsqueda por clave o descripción (`/api/articulos?q=...`).
- Base de datos local SQLite.

### 🩺 Módulo: Citas Abasto (v1.0.0)
- Carga de datos desde archivo Excel (vía Power Automate) y enviado en base64 comprimido.

---

## 🛠️ Stack Tecnológico
- **Backend:** Node.js + Express
- **Base de datos:** SQLite (artículos) 
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


## 📄 Variables de entorno requeridas

```
# Comunes
PORT=3000

# Artículos
DB_PATH=./db/articulos.sqlite

# PostgreSQL para citas (pendiente de uso)
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
GET /api/citas/full
```
---

## 👨‍💻 Autor

Desarrollado por Ing. Mario Arturo Serrano Flores 🧑‍💻

---

## 📄 Licencia
MIT
