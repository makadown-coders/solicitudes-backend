# Piloto semanal: Radar de demanda y cobertura

## Flujo recomendado: una petición, un Excel

**Recurrence → HTTP_excel → Send an email (V2)**.

La descarga directa consulta una vez el listado y su evidencia, genera las seis hojas y transmite el archivo. No requiere consultar JSON previamente, no calcula hash ni arma el HTML del correo. Mantiene la escritura incremental a disco y la limpieza del temporal.

### Cambiar el flujo existente

1. Conservar **Recurrence**: lunes, 08:00, zona de Baja California/Tijuana. Concurrencia 1.
2. Retirar **HTTP JSON**, **Parse JSON**, **Create HTML table** y **Compose Cuerpo Correo** de este flujo.
3. En **HTTP_excel**, configurar método GET y pegar esta URI literal (sin expresión concat ni versionDatos):

```text
https://minor-flossy-imssb-737587a4.koyeb.app/api/reportes-radar-semanal/reporte-excel?months=3
```

   Encabezado Accept: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
4. En **Send an email (V2)**:
   - To: correo del responsable durante la prueba; después los destinatarios acordados.
   - Subject (texto): **[PILOTO] Radar de demanda y cobertura — seguimiento semanal**.
   - Body: pegar el HTML de abajo en la vista HTML del editor; eliminar las referencias al Compose y al JSON anteriores.
   - Attachments Name (texto): `radar_demanda_cobertura.xlsx`.
   - Attachments Content: contenido dinámico **Body** de HTTP_excel, o expresión `body('HTTP_excel')`. No convertir a texto ni aplicar Base64 de nuevo.
   - Run after: sólo **is successful**. Si falla HTTP_excel, no enviar correo.

El nombre con fecha también viene en el encabezado HTTP `X-Reporte-Nombre-Archivo` y en Content-Disposition; el nombre fijo anterior evita agregar expresiones innecesarias al flujo. El resumen por unidad está en el Excel; el cuerpo del correo deja de contener una tabla dinámica.

### Cuerpo del correo

```html
<div style="font-family:Segoe UI,Arial,sans-serif;color:#243746;line-height:1.6">
  <h2 style="color:#176b58">Radar de demanda y cobertura</h2>
  <p><strong>PILOTO SEMANAL · INFORMACIÓN DE PRUEBA</strong></p>
  <p>Buen día:</p>
  <p>Les compartimos el reporte para apoyar el seguimiento de claves por unidad médica.</p>
  <p><strong>Las solicitudes analizadas provienen de los registros asociados a LOS EXCELES GENERADOS CON LA HERRAMIENTA DE SOLICITUDES.</strong> Su generación no acredita recepción, autorización, procesamiento ni surtimiento por Abasto y/o Almacenes.</p>
  <p>La estructura ilustra cómo podría presentarse el análisis si posteriormente se integrara el registro de cada solicitud efectivamente procesada. Esa integración aún no forma parte del piloto.</p>
  <p>El archivo considera los últimos tres meses de solicitudes. El envío semanal no limita el análisis a la última semana. Revisen las fechas disponibles: la generación del reporte no representa un corte común de todas las fuentes.</p>
  <p>Les sugerimos comenzar por “Guía y alcance”, “Resumen por unidad” y “Radar”, especialmente las columnas “Requiere seguimiento” y “Motivos de seguimiento”.</p>
  <p>Sin solicitud observada no significa ausencia de necesidad. Las órdenes pendientes no son existencia disponible y una salida no confirma por sí sola recepción ni atención completa.</p>
  <p>Agradeceremos sus observaciones para mejorar la claridad y utilidad del reporte.</p>
  <p>Saludos cordiales,<br>Seguimiento de abasto · Prueba piloto</p>
</div>
```

## Compatibilidad y alcance

- `months`: entero entre 1 y 12, predeterminado 3. Sin filtros adicionales y con un máximo de 50,000 filas del Radar.
- La ruta JSON `/reporte?months=3` sigue disponible para clientes anteriores.
- Si se envía explícitamente `versionDatos`, se conserva la comparación y el posible 409. El flujo simplificado debe omitirlo.
- 400: parámetros inválidos. 422: universo incompleto. 503: reporte ocupado (Retry-After: 30). 500: error de generación. No se ocultan fallos ni se envían archivos parciales.
- Se preservan las seis hojas, las reglas analíticas y el origen del piloto. No hay nuevas dependencias ni tablas por esta simplificación.
- Eliminar la consulta JSON previa evita repetir los cruces; omitir versionDatos elimina el trabajo de hash. No garantiza resolver cualquier timeout: la consulta SQL y la escritura del archivo siguen tomando tiempo y deben medirse en el despliegue real.

## Memoria y concurrencia (instancia de 512 MB)

- Las tablas del Excel se escriben fila a fila en un archivo temporal, con presión de escritura sobre el ZIP y sin tabla global de cadenas compartidas. Se conservan las seis hojas, valores, columnas y formatos porcentuales.
- La respuesta HTTP transmite el archivo desde disco; no carga el XLSX completo en un Buffer. El temporal se elimina al terminar la descarga o ante errores manejados. El directorio temporal de la instancia debe permitir escritura y tener espacio suficiente. Un cierre forzado del proceso puede dejar temporales hasta que la instancia se recicle.
- El hash usa huellas SHA-256 por elemento en lugar de clonar y serializar todo el reporte. El procesamiento cede el event loop por lotes para no bloquear health checks. Sólo se usa en la ruta JSON y cuando el cliente solicita validación explícita. La descarga directa no calcula hash.
- Sólo se prepara un reporte semanal del Radar a la vez por proceso (JSON o Excel). Otra petición recibe HTTP 503, código `reporte_radar_ocupado` y `Retry-After: 30`. Mantener concurrencia 1 en Power Automate y reintentos para 503; nunca enviar correo si falla el adjunto. Esto no limita otros endpoints ni coordina varias réplicas.
- El listado conserva el máximo de 50,000 filas. La evidencia aún se consulta en PostgreSQL y permanece en memoria; no se promete memoria constante para una cantidad arbitraria de movimientos. Las consultas de salidas y órdenes son secuenciales y sus valores numéricos se convierten sin duplicar filas.
- Se agregó la dependencia de producción `exceljs@4.4.0`. El flujo simplificado usa únicamente la URL de Excel, sin versionDatos. No se aumentó el heap ni se cambió NODE_OPTIONS.

Prueba sintética reproducible, sin PostgreSQL ni llamadas a Koyeb:

```text
npm run build
node --test scripts/reporte-radar-semanal.test.cjs
node --max-old-space-size=224 scripts/reporte-radar-memory.cjs 50000
```

Genera 50,000 filas de Radar, 50,000 salidas y 50,000 órdenes, ejecuta la descarga directa de Excel y elimina el archivo. Informa pico de heap muestreado, RSS máximo y duración. Un heap limitado no simula un contenedor completo de 512 MB; las cifras locales no garantizan el consumo con el resto de la API, la base real, otra versión de Node o textos/movimientos más grandes.

### Resultado de la descarga directa

Prueba sintética local en Windows con heap limitado a 224 MB: 50,000 filas de Radar + 50,000 salidas + 50,000 órdenes. La descarga directa completó el archivo en 16 segundos; tamaño 17,684,504 bytes, pico de heap muestreado de 172 MiB y RSS máximo de 430 MiB. Build correcto y 17 pruebas aprobadas, incluyendo una que impide calcular hash durante la descarga directa.

No incluye el tiempo ni la memoria de PostgreSQL o la carga del resto de la API. Debe verificarse en Koyeb antes de dar por resuelto el timeout. No se cambió NODE_OPTIONS ni se agregó una dependencia en este cambio.
