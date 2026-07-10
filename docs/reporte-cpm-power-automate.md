# Reporte semanal CPM en Power Automate

El flujo sugerido es `Recurrence -> HTTP -> Parse JSON -> Create HTML table -> Compose -> HTTP excel -> Send an email (V2)`.

1. Solicitar el JSON con `GET /api/reportes-cpm-semanal/reporte`.
2. En **Create HTML table**, usar `body('Parse_JSON')?['tablaCorreo']`.
3. En **Compose**, usar:

```text
concat(
  body('Parse_JSON')?['correo']?['encabezadoHtml'],
  outputs('Create_HTML_table'),
  body('Parse_JSON')?['correo']?['notaMetodologicaHtml']
)
```

4. Solicitar el mismo corte con `GET /api/reportes-cpm-semanal/reporte-excel?fechaCorte=2026-06-19`. En el flujo, sustituir la fecha fija por `body('Parse_JSON')?['fechaCorte']`.
5. En **Send an email (V2)**, configurar Subject como `body('Parse_JSON')?['asuntoCorreo']`, Attachment Name como `body('Parse_JSON')?['nombreArchivo']` y Attachment Content como `body('HTTP_excel')`.

## Esquema de Parse JSON

```json
{
  "type": "object",
  "required": ["ok", "fechaCorte", "generadoEn", "nombreArchivo", "asuntoCorreo", "resumen", "hospitales", "tablaCorreo", "correo", "advertencias"],
  "properties": {
    "ok": { "type": "boolean" },
    "fechaCorte": { "type": "string" },
    "fechaCorteAnterior": { "type": ["string", "null"] },
    "generadoEn": { "type": "string" },
    "nombreArchivo": { "type": "string" },
    "asuntoCorreo": { "type": "string" },
    "resumen": { "type": "object" },
    "hospitales": { "type": "array", "items": { "type": "object" } },
    "tablaCorreo": { "type": "array", "items": { "type": "object" } },
    "correo": {
      "type": "object",
      "required": ["encabezadoHtml", "notaMetodologicaHtml"],
      "properties": {
        "encabezadoHtml": { "type": "string" },
        "notaMetodologicaHtml": { "type": "string" }
      }
    },
    "advertencias": { "type": "array", "items": { "type": "string" } }
  }
}
```

Los endpoints conservan la misma exposición que `/api/catalogo-claves/reporte`. Como endurecimiento opcional puede incorporarse posteriormente una API key basada en `REPORTES_CPM_API_KEY` en la infraestructura de integraciones.
