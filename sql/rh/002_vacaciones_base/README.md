# RH-VAC-DB.1 — Control histórico de vacaciones (`002_vacaciones_base`)

## 1. Modelo lógico
- `public.rh_vacacion_derecho` (`persona_id` → `public.persona.id`)
- `public.rh_vacacion_disfrute` (`derecho_id` → `public.rh_vacacion_derecho.id`)
- `public.rh_vacacion_movimiento` (`derecho_id` → `public.rh_vacacion_derecho.id`, `disfrute_id` → `public.rh_vacacion_disfrute.id`, `movimiento_reversado_id` → `self`)

## 2. Diccionario de tablas
- **`rh_vacacion_derecho`**: `id`, `persona_id`, `ejercicio_anio`, `periodo_numero`, `estado`, `observaciones`, `creado_por`, `actualizado_por`, `creado_en`, `actualizado_en`.
- **`rh_vacacion_disfrute`**: `id`, `derecho_id`, `fecha_inicio`, `fecha_fin`, `dias_solicitados`, `estado`, `observaciones`, `registrado_por`, `autorizado_por`, `autorizado_en`, `creado_en`, `actualizado_en`.
- **`rh_vacacion_movimiento`**: `id`, `derecho_id`, `tipo_movimiento`, `dias`, `fecha_efectiva`, `fecha_registro`, `disfrute_id`, `movimiento_reversado_id`, `motivo`, `responsable_id`.

## 3. Ejercicios y periodos de origen
`ejercicio_anio` representa el año de origen del derecho; `periodo_numero` (`>= 1`) permite múltiples periodos sin imponer exactamente dos.

## 4. Solicitudes y disfrutes
`fecha_inicio` y `fecha_fin` pueden pertenecer a un año distinto de `ejercicio_anio` (p. ej. disfrute en marzo 2026 contra derecho 2025). `dias_solicitados` es independiente de `fecha_fin - fecha_inicio`.

## 5. Estados
- Derecho: `ACTIVO`, `CERRADO`, `CANCELADO`.
- Disfrute: `PENDIENTE`, `AUTORIZADO`, `RECHAZADO`, `CANCELADO`.

## 6. Movimientos de saldo y 7. Reversiones
- Convención de signo en `dias`: positivo para abonos (`ASIGNACION`, `AJUSTE_POSITIVO`), negativo para cargos (`DISFRUTE`, `AJUSTE_NEGATIVO`).
- Una cancelación no borra el movimiento original: inserta un `REVERSO` con signo opuesto apuntando a `movimiento_reversado_id` (protegido por `uq_rh_vac_mov_reverso_unico`).

## 8. Estrategia de auditoría
Referencias `uuid` opcionales hacia `public.app_users(id)` (`creado_por`, `actualizado_por`, `registrado_por`, `autorizado_por`, `responsable_id`).

## 9. Ejemplo de cálculo de saldo
`SELECT COALESCE(SUM(dias), 0) AS saldo FROM public.rh_vacacion_movimiento WHERE derecho_id = $1;`

## 10. Ampliaciones futuras y 11. Reglas pendientes
- Si una solicitud llegara a distribuirse entre varios ejercicios, se puede agregar una tabla puente `rh_vacacion_disfrute_asignacion` sin romper `rh_vacacion_movimiento`.
- Pendiente confirmar con RH: días por antigüedad/contratación, días hábiles vs. naturales, festivos y caducidad.

## 12. Procedimiento UP, VERIFY y DOWN
```bash
psql -f sql/rh/002_vacaciones_base/002_vacaciones_base.up.sql
psql -f sql/rh/002_vacaciones_base/002_vacaciones_base.verify.sql
# DOWN (destruye datos RH de vacaciones):
psql -f sql/rh/002_vacaciones_base/002_vacaciones_base.down.sql
```
