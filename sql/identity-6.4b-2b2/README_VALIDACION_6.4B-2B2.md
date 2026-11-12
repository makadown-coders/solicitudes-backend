# Microintervención 6.4B-2B.2 — Instrucciones de Validación Previa, Aplicación, Verificación Posterior y Reversión

> **ADVERTENCIA**: No ejecutar ninguno de estos scripts en la base de datos compartida o productiva sin autorización expresa. Las pruebas dinámicas (`001_protect_app_users_persona_link.test.sql`) están diseñadas exclusivamente para un entorno PostgreSQL aislado de pruebas.

---

## 1. Archivos incluidos en esta carpeta

- `001_protect_app_users_persona_link.up.sql`: Script de migración propuesta (función `public.auto_link_persona_for_app_user()` y trigger `t_app_users_autolink_persona_upd_email`).
- `001_protect_app_users_persona_link.down.sql`: Script de reversión exacta al estado original del dump (`dump-postgres-202611111225.sql`).
- `001_protect_app_users_persona_link.test.sql`: Suite de pruebas SQL transaccional (escenarios 1 a 13) para ejecutar únicamente en una base PostgreSQL aislada.

---

## 2. Validación previa (Solo lectura, antes de aplicar la migración)

Ejecutar las siguientes consultas `SELECT` para registrar la línea base antes de aplicar la migración:

```sql
-- 2.1 Verificar conteo y estado de cuentas SSO y sus vínculos con persona
SELECT
  u.status,
  COUNT(*) AS total_cuentas,
  COUNT(u.persona_id) AS con_persona_id,
  COUNT(*) FILTER (WHERE p.activo IS TRUE) AS con_persona_activa
FROM public.app_users u
LEFT JOIN public.persona p ON p.id = u.persona_id
GROUP BY u.status;

-- 2.2 Verificar asignaciones de roles en app_user_roles
SELECT
  r.code AS rol,
  ur.scope_type,
  ur.scope_id,
  COUNT(*) AS total_asignaciones
FROM public.app_user_roles ur
JOIN public.app_roles r ON r.id = ur.role_id
GROUP BY r.code, ur.scope_type, ur.scope_id;

-- 2.3 Respaldar la definición activa del trigger y de la función en catálogo
SELECT
  t.tgname AS trigger_name,
  t.tgenabled,
  pg_get_triggerdef(t.oid, true) AS trigger_def,
  pg_get_functiondef(p.oid) AS function_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname = 'app_users';
```

**Criterio de aceptación previo**:
- `3` cuentas activas en `public.app_users`, las `3` con `persona_id` no nulo y `p.activo = TRUE`.
- `3` asignaciones `ADMIN_TIC` con `scope_type = 'GLOBAL'` y `scope_id = '*'` en `public.app_user_roles`.

---

## 3. Ejecución de pruebas en base PostgreSQL aislada

En una instancia local/efímera de PostgreSQL cargada con el esquema de pruebas:

```bash
psql -v ON_ERROR_STOP=1 -d <db_aislada_pruebas> -f sql/identity-6.4b-2b2/001_protect_app_users_persona_link.test.sql
```

Si los 13 escenarios pasan sin error, el script finaliza con `ROLLBACK` dejando la base aislada sin cambios.

---

## 4. Aplicación de la migración (cuando sea autorizada)

```bash
psql -v ON_ERROR_STOP=1 -d <db_objetivo> -f sql/identity-6.4b-2b2/001_protect_app_users_persona_link.up.sql
```

---

## 5. Validación posterior (Solo lectura, inmediatamente después de aplicar)

Repetir las consultas de la **Sección 2** y verificar que:

1. El conteo de `public.app_users` (`3` cuentas activas vinculadas a sus mismas personas activas) y `public.app_user_roles` (`3` asignaciones `ADMIN_TIC GLOBAL`) permanece **idéntico**.
2. `pg_get_triggerdef` para `t_app_users_autolink_persona_upd_email` muestra:
   `BEFORE UPDATE OF email, persona_id ON public.app_users FOR EACH ROW WHEN ((old.email IS DISTINCT FROM new.email) OR (old.persona_id IS DISTINCT FROM new.persona_id)) EXECUTE FUNCTION auto_link_persona_for_app_user()`
3. El conteo de `public.persona` y `public.persona_correo` no sufrió ninguna alteración (no se insertaron filas para las 64 personas sin `persona_correo`).

---

## 6. Procedimiento de reversión (Rollback inmediato)

En caso de requerir restaurar exactamente el comportamiento previo:

```bash
psql -v ON_ERROR_STOP=1 -d <db_objetivo> -f sql/identity-6.4b-2b2/001_protect_app_users_persona_link.down.sql
```
