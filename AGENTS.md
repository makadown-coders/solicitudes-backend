# Contexto de trabajo: solicitudes-backend

## Propósito y stack

- API Express 5 con TypeScript y PostgreSQL mediante `pg`.
- La aplicación y montaje de rutas están en `src/app.ts`; las capas habituales son `routes`, `controllers`, `services` y `models`.
- Las consultas analíticas existentes se implementan principalmente como SQL parametrizado en servicios.

## Convenciones del proyecto

- Mantener contratos y mensajes de error existentes salvo cambio explícito.
- Normalizar CLUES y claves CNIS con `UPPER(TRIM(...))` en cruces entre fuentes.
- Usar parámetros de PostgreSQL; nunca interpolar filtros proporcionados por usuarios.
- Convertir valores `numeric` de PostgreSQL explícitamente al mapear DTOs.
- Paginar consultas potencialmente grandes y limitar `pageSize` en backend.
- No agregar migraciones o dependencias si una consulta sobre el esquema vigente resuelve el caso.

## Identidad de unidades médicas

- `unidad_medica_alias.id` identifica el registro de alias, no una unidad médica.
- Los vínculos con `entrada`, `salida` y `traspaso` deben usar `unidad_medica_alias.unidad_medica_id` y los campos `unidad_origen_id`/`unidad_destino_id` correspondientes.
- No relacionar IDs de movimientos contra `unidad_medica_alias.id`.

## Radar de solicitudes

- Los endpoints históricos están bajo `/api/radar-abasto/global/*` y deben conservarse durante la validación de V2.
- V2 vive bajo `/api/radar-abasto/v2/*`; su universo es la unión de claves solicitadas y claves con CPM por unidad.
- `solicitud_bitacora` representa solicitudes generadas/registradas, no prueba de envío o autorización.
- `tmp_existencias` es un snapshot actual; `cargado_en` es `timestamptz` y no representa existencia histórica.
- “CPM sin solicitud observada” no permite concluir falta de necesidad clínica.
- `existencia / CPM` representa múltiplos de CPM. Los días estimados se calculan como `(existencia / CPM) * 30`.
- Los factores de `homologos` expresan cantidad de sustituto equivalente a una unidad de la clave base; validar dirección y evitar dobles conteos.
- No considerar una orden como cobertura local hasta confirmar que su destino puede vincularse con la unidad evaluada.

## Validación

- Ejecutar `npm run build` después de cambios de TypeScript.
- El script `npm test` actualmente no contiene una suite real; no reportarlo como prueba aprobada.
- No escribir secretos ni modificar `.env`. No hacer commit ni push salvo solicitud explícita.
