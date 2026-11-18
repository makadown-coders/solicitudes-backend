# RH-DB.1 — Esquema base de Listas de Asistencia (`001_asistencias_base`)

## 1. Propósito del esquema
Definir las tablas mínimas en PostgreSQL 17.4 (`public`) para gestionar adscripciones laborales, periodos mensuales, listas de asistencia por trabajador/unidad y detalle diario de entradas y salidas, reutilizando `public.persona`, `public.unidad_medica` y `public.app_users`.

## 2. Modelo lógico de relaciones
- `public.rh_adscripcion_laboral.persona_id` → `public.persona(id)` (`integer`)
- `public.rh_adscripcion_laboral.unidad_medica_id` → `public.unidad_medica(id)` (`integer`)
- `public.rh_lista_asistencia.periodo_id` → `public.rh_periodo_asistencia(id)` (`integer`)
- `public.rh_lista_asistencia.persona_id` → `public.persona(id)` (`integer`)
- `public.rh_lista_asistencia.unidad_medica_id` → `public.unidad_medica(id)` (`integer`)
- `public.rh_lista_asistencia.adscripcion_laboral_id` → `public.rh_adscripcion_laboral(id)` (`integer`, opcional)
- `public.rh_lista_asistencia.creado_por` / `actualizado_por` → `public.app_users(id)` (`uuid`, opcional)
- `public.rh_asistencia_detalle.lista_asistencia_id` → `public.rh_lista_asistencia(id)` (`integer`, `ON DELETE CASCADE`)

## 3. Diccionario de tablas y columnas
- **`rh_adscripcion_laboral`**: `id`, `persona_id`, `unidad_medica_id`, `matricula`, `puesto`, `turno`, `jornada`, `horario`, `vigente_desde`, `vigente_hasta`, `activo`, `observaciones`, `creado_en`, `actualizado_en`.
- **`rh_periodo_asistencia`**: `id`, `anio`, `mes`, `fecha_inicio`, `fecha_fin`, `estado` (`ABIERTO` | `CERRADO`), `creado_en`, `actualizado_en`.
- **`rh_lista_asistencia`**: `id`, `periodo_id`, `persona_id`, `unidad_medica_id`, `adscripcion_laboral_id`, `matricula_snapshot`, `puesto_snapshot`, `turno_snapshot`, `jornada_snapshot`, `horario_snapshot`, `estado` (`BORRADOR` | `CAPTURADA` | `VALIDADA` | `CERRADA`), `documento_referencia`, `observaciones`, `creado_por`, `actualizado_por`, `creado_en`, `actualizado_en`.
- **`rh_asistencia_detalle`**: `id`, `lista_asistencia_id`, `fecha`, `hora_entrada`, `hora_salida`, `observaciones`, `creado_en`, `actualizado_en`.

## 4. Restricciones y decisiones de diseño
- Se usa `unidad_medica.id` (`integer`) y **no** `cluesimb`, ya que unidades administrativas como `OFICINA CENTRAL` (`id = 177`) tienen `cluesimb = 'N/A'`.
- Se permiten `hora_entrada IS NULL` y `hora_salida IS NULL` (ausencia de checada no equivale automáticamente a falta).
- No se restringe `hora_entrada <= hora_salida` para soportar turnos nocturnos.
- `documento_referencia` almacena únicamente una referencia textual sin binarios ni proveedor fijo.
- La FK compuesta `fk_rh_lista_adscripcion_coherente` garantiza que, cuando se vincule `adscripcion_laboral_id`, esta pertenezca a la misma `persona_id` y `unidad_medica_id` de la lista.
- `rh_periodo_asistencia` valida mediante `CHECK` que `fecha_inicio` y `fecha_fin` correspondan exactamente al mes natural `(anio, mes)`.

## 5. Tratamiento de histórico
Cada `rh_lista_asistencia` guarda `adscripcion_laboral_id` junto con columnas `*_snapshot` (`matricula_snapshot`, `puesto_snapshot`, `turno_snapshot`, `jornada_snapshot`, `horario_snapshot`), garantizando que una lista pasada conserve los datos vigentes en ese mes aunque `persona` o `rh_adscripcion_laboral` cambien después.

## 6. Manejo de cambios de adscripción
La restricción `UNIQUE (periodo_id, persona_id, unidad_medica_id)` permite que una misma persona tenga dos listas en el mismo mes si cambia de `unidad_medica_id` durante el periodo.

## 7. Ejemplos conceptuales
- Trabajador `persona_id = 10` cambia de Unidad A (`id = 12`) a Unidad B (`id = 45`) el 16 de marzo: tendrá una `rh_lista_asistencia` para `(marzo, 10, 12)` y otra para `(marzo, 10, 45)`.

## 8. Procedimiento para aplicar UP (NO ejecutar sin autorización)
```bash
psql -f sql/rh/001_asistencias_base/001_asistencias_base.up.sql
```

## 9. Procedimiento para ejecutar VERIFY
```bash
psql -f sql/rh/001_asistencias_base/001_asistencias_base.verify.sql
```

## 10. Procedimiento y riesgos de DOWN
```bash
psql -f sql/rh/001_asistencias_base/001_asistencias_base.down.sql
```
> **Riesgo:** `DOWN` elimina las 4 tablas RH y destruirá cualquier dato de asistencias capturado en producción.

## 11. Funcionalidades pendientes
- Validación en backend de que `rh_asistencia_detalle.fecha` pertenezca al rango `[fecha_inicio, fecha_fin]` del `rh_periodo_asistencia` asociado.
- Catálogos de incidencias, permisos, vacaciones y almacenamiento de documentos PDF/Excel.
