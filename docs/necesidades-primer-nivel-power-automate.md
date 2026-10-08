# Necesidades de Primer Nivel y Power Automate

El frontend envía la lista a:

```http
POST /api/solicitudes/primer-nivel/enviar
```

El backend valida la unidad y el catálogo, registra `solicitud_bitacora`, genera el Excel en memoria y envía el archivo al flujo configurado en `AZURE_SP_WISHLIST_URL`. El archivo no se devuelve al navegador.

Cuando `periodo` llega vacío, el backend asigna automáticamente el mes y año en curso usando la zona horaria `America/Tijuana`, por ejemplo `Octubre 2026`.

El webhook de Power Automate recibe el contrato existente:

```json
{
  "nombreArchivo": "Necesidades-BCIMB000232-2026-10-08-12345678.xlsx",
  "contenidoBase64": "...",
  "nombre": "Responsable o No especificado",
  "unidad": "Nombre del Centro de Salud",
  "clues": "BCIMB000232",
  "periodo": "Periodo capturado",
  "tipoMime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```

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
