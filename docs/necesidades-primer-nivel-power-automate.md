# Necesidades de Primer Nivel y Power Automate

El frontend envía la lista a:

```http
POST /api/solicitudes/primer-nivel/enviar
```

El backend valida la unidad y el catálogo, registra `solicitud_bitacora`, genera el Excel en memoria y envía el archivo al flujo configurado en `AZURE_SP_WISHLIST_URL`. El archivo no se devuelve al navegador.

## Vista previa local del Excel

Durante desarrollo local, el frontend puede solicitar el mismo archivo mediante:

```http
POST /api/solicitudes/primer-nivel/vista-previa-excel
```

La ruta reutiliza la validación, las consultas y el generador Excel del flujo productivo, pero no crea registros en `solicitud_bitacora` ni invoca `AZURE_SP_WISHLIST_URL`. Devuelve el archivo directamente como `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

Como protección adicional, sólo responde cuando el backend se accede mediante `localhost`, `127.0.0.1` o `::1`, y permanece deshabilitada cuando `NODE_ENV=production`.

Cuando `periodo` llega vacío, el backend asigna automáticamente el mes y año en curso usando la zona horaria `America/Tijuana`, por ejemplo `Octubre 2026`.

El Excel contiene dos hojas: `Lista de necesidades`, con la captura original de la unidad, y `Análisis operativo`, con CPM de la unidad, meses solicitados, existencias referenciales AZM/AZT/AZE, total en almacenes y faltante referencial. Las existencias provienen del snapshot disponible en PostgreSQL y deben validarse antes del surtimiento.

El webhook de Power Automate recibe el contrato existente:

```json
{
  "nombreArchivo": "Necesidades-BCIMB000232-2026-10-08-12345678.xlsx",
  "contenidoBase64": "...",
  "nombre": "Responsable o No especificado",
  "unidad": "Nombre del Centro de Salud",
  "clues": "BCIMB000232",
  "periodo": "Periodo capturado",
  "tipoMime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "correos": [
    "destinatario.adicional@imssbienestar.gob.mx"
  ]
}
```

`correos` contiene los CC adicionales resueltos por el backend a partir del contexto validado de APS y Programas Preventivos. Power Automate puede usar `join(triggerBody()?['correos'], ';')`; una lista vacÃ­a conserva el envÃ­o sin CC adicional.

## Flujo sugerido

1. Recibir la petición HTTP.
2. Crear o reemplazar el archivo en SharePoint usando `nombreArchivo` y `base64ToBinary(contenidoBase64)`.
3. Enviar correo desde una cuenta institucional o buzón compartido.
4. Configurar los destinatarios de Almacén dentro de Power Automate, no en el código fuente.
5. Usar `nombreArchivo` como nombre del adjunto y `base64ToBinary(contenidoBase64)` como contenido.
6. Responder HTTP 2xx únicamente cuando SharePoint y el correo hayan finalizado correctamente.

Si el webhook falla, el endpoint responde con error y el frontend conserva la lista. La bitácora usa el mecanismo de deduplicación existente, por lo que un reintento del mismo contenido no agrega nuevamente el detalle.

## Respuesta al frontend

El navegador recibe solamente folio, unidad, CLUES, periodo, total de insumos, total de piezas y fecha de recepción. No recibe el contenido del Excel ni inicia una descarga.
