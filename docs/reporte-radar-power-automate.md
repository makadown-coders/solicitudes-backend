# Piloto semanal: Radar de demanda y cobertura

Reporte independiente del semanal CPM. No modifica `/api/radar-abasto/v2/export` ni la descarga del frontend. Reutiliza los servicios analíticos del Radar V2 y reproduce sus seis hojas en el servidor. No agrega tablas ni dependencias.

## Contrato

- `GET /api/reportes-radar-semanal/reporte?months=3`: JSON para correo.
- `GET /api/reportes-radar-semanal/reporte-excel?months=3&versionDatos=<versionDatos del JSON>`: XLSX binario.
- `months`: entero de 1 a 12; predeterminado 3. Universo completo, sin filtros de unidad, segmento o estado.
- `versionDatos`: hash del contenido analítico, incluidas salidas y órdenes. Opcional para descargas directas, necesario en el flujo para comparar resumen y adjunto.
- `400`: parámetros inválidos. `409`: cambió el contenido desde el JSON; repetir todo el flujo. `422`: universo incompleto o superior a 50,000 filas; no enviar reporte parcial. `500`: no se pudo generar el reporte.
- Sin registros: HTTP 200, tabla vacía y Excel con leyendas explícitas.
- `fechaGeneracion` usa America/Tijuana; `generadoEn` es UTC. No se devuelve `fechaCorte`: las fuentes no tienen un corte común. Las fechas de snapshot se conservan por fila y en `fechasSnapshotExistencias`.
- Las consultas internas no constituyen un snapshot transaccional único; la versión detecta diferencias entre las consultas JSON y Excel, pero no inmoviliza la base. No es un archivo histórico persistido.
- No se configuran destinatarios ni credenciales en el backend. Las rutas usan el mismo montaje y exposición que los reportes existentes.

## Flujo en Power Automate

Crear un flujo independiente llamado **PILOTO — Radar de demanda y cobertura semanal**. Mantenerlo desactivado hasta desplegar el backend y probar el adjunto. Destinatarios tentativos: química Troyo, Lic. Avelar, Elia Rojas y Abril Núñez; completar sus correos institucionales en Outlook, sin inferir direcciones. Primera prueba con el correo del responsable.

Secuencia: **Recurrence → HTTP JSON → Parse JSON → Create HTML table → Compose Cuerpo Correo → HTTP excel → Send an email (V2)**.

1. **Recurrence**: Frequency `Week`, Interval `1`, Monday, 08:00 (horario propuesto). Zona de Baja California/Tijuana, identificador de Windows `Pacific Standard Time (Mexico)`. Elegir una fecha de inicio futura. Configurar concurrencia del disparador a 1 para evitar ejecuciones superpuestas.
2. **HTTP JSON**: método `GET`; URI `https://minor-flossy-imssb-737587a4.koyeb.app/api/reportes-radar-semanal/reporte?months=3`; encabezado `Accept: application/json`. Configurar la autenticación que corresponda al despliegue. El conector HTTP requiere verificar la licencia disponible.
3. **Parse JSON**: Content = `Body` de HTTP JSON. Pegar el esquema siguiente.
4. **Create HTML table**: From = expresión `body('Parse_JSON')?['tablaCorreo']`; Columns = `Automatic`. Las claves son combinaciones unidad–clave, no un conteo estatal de claves CNIS únicas. La columna de seguimiento incluye todo el universo; solicitadas sin existencia incluye únicamente claves con demanda observada y existencia <= 0.
5. **Compose Cuerpo Correo**: pegar esta expresión. Si Power Automate asigna otros nombres internos a las acciones, sustituirlos usando contenido dinámico.

```text
concat(
  '<style>table{border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:13px;width:100%}th{background:#176b58;color:#fff;text-align:left}th,td{padding:9px;border:1px solid #dce5e1}</style>',
  body('Parse_JSON')?['correo']?['encabezadoHtml'],
  body('Create_HTML_table'),
  body('Parse_JSON')?['correo']?['notaMetodologicaHtml']
)
```

6. **HTTP excel**: método `GET`, encabezado `Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. URI como expresión:

```text
concat(
  'https://minor-flossy-imssb-737587a4.koyeb.app/api/reportes-radar-semanal/reporte-excel?months=',
  string(body('Parse_JSON')?['months']),
  '&versionDatos=',
  body('Parse_JSON')?['versionDatos']
)
```

7. **Send an email (V2)**:
   - To: destinatarios del piloto; usar sólo tu correo durante la prueba.
   - Subject: `body('Parse_JSON')?['asuntoCorreo']`.
   - Body: `outputs('Compose_Cuerpo_Correo')`; usar contenido HTML, no pegar la expresión como texto plano.
   - Attachments Name: `body('Parse_JSON')?['nombreArchivo']`.
   - Attachments Content: contenido dinámico **Body** de HTTP excel (`body('HTTP_excel')`). No usar el JSON, ni convertir el archivo a texto, ni aplicar Base64 por segunda vez.
   - Mantener **Run after: is successful**. No enviar si HTTP JSON o HTTP excel fallan.

Agregar una rama de aviso al responsable que corra cuando falle o expire la consulta/generación, sin adjuntar reportes anteriores. Si hay 409, repetir desde HTTP JSON; reintentar sólo Excel con la misma versión no lo resuelve. No enviar correos a destinatarios finales desde esa rama.

El JSON y el Excel se generan en dos consultas independientes y pueden tener distinta hora de generación. El hash exige el mismo contenido analítico; no contiene destinatarios ni secretos. Evitar programar el envío durante cargas de datos. El nombre del adjunto se toma del JSON; un cruce de medianoche puede hacer que difiera del encabezado de la descarga.

## Esquema de Parse JSON

```json
{
  "type": "object",
  "required": ["ok", "piloto", "generadoEn", "fechaGeneracion", "months", "versionDatos", "nombreArchivo", "asuntoCorreo", "resumen", "hospitales", "tablaCorreo", "correo", "advertencias"],
  "properties": {
    "ok": { "type": "boolean" },
    "piloto": { "type": "boolean" },
    "generadoEn": { "type": "string" },
    "fechaGeneracion": { "type": "string" },
    "zonaHoraria": { "type": "string" },
    "months": { "type": "integer" },
    "versionDatos": { "type": "string" },
    "nombreArchivo": { "type": "string" },
    "asuntoCorreo": { "type": "string" },
    "resumen": { "type": "object" },
    "fechasSnapshotExistencias": { "type": "array", "items": { "type": "string" } },
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

## Verificación

Desde el backend:

```text
npm run build
node --test scripts/reporte-radar-semanal.test.cjs
```

Las pruebas usan fuentes simuladas: validan resumen, origen del piloto, XLSX real, seis hojas, evidencia, resultados vacíos, truncamiento, cambio de versión y contrato HTTP local. No acceden a PostgreSQL ni envían correos. `npm test` sigue siendo el placeholder existente, no una suite válida.

Después de desplegar: ejecutar con el correo del responsable, abrir el adjunto, comparar el universo y las seis hojas con una exportación del Radar sin filtros y del mismo periodo. Confirmar los cortes disponibles y que no haya truncamiento. Medir tiempo/tamaño con datos reales antes de activar los lunes. El flow no se crea ni activa mediante estos archivos.

Referencias: [Programación](https://learn.microsoft.com/en-us/power-automate/run-scheduled-tasks), [Outlook](https://learn.microsoft.com/en-us/connectors/office365/).
