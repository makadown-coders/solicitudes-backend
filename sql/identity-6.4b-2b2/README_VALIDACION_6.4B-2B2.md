# Microintervención 6.4B-2B.2 / 6.4B-2B.2A — Instrucciones de Validación Previa, Aplicación, Verificación Posterior y Reversión

> **ADVERTENCIA**: No ejecutar ninguno de estos scripts en la base de datos compartida o productiva sin autorización expresa. Las pruebas dinámicas (`001_protect_app_users_persona_link.test.sql`) están diseñadas exclusivamente para un entorno PostgreSQL aislado de pruebas.

---

## 1. Archivos incluidos en esta carpeta

- `001_protect_app_users_persona_link.up.sql`: Script de migración propuesta endurecida (función `public.auto_link_persona_for_app_user()` y trigger `t_app_users_autolink_persona_upd_email`).
- `001_protect_app_users_persona_link.down.sql`: Script de reversión exacta al estado original del dump (`dump-postgres-202611111225.sql`).
- `001_protect_app_users_persona_link.test.sql`: Suite de pruebas SQL transaccional (21 escenarios: 13 originales + 8 de endurecimiento 6.4B-2B.2A) para ejecutar únicamente en una base PostgreSQL aislada.

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

### 3.1 Suite transaccional de una sesión (Escenarios 1 a 21)
En una instancia local/efímera de PostgreSQL cargada con el esquema de pruebas:

```bash
psql -v ON_ERROR_STOP=1 -d <db_aislada_pruebas> -f sql/identity-6.4b-2b2/001_protect_app_users_persona_link.test.sql
```

Si los 21 escenarios pasan sin error, el script finaliza con `ROLLBACK` dejando la base aislada sin cambios.

### 3.2 Prueba multisesión de contención real por `pg_advisory_xact_lock` (INSERT vs UPDATE y UPDATE vs UPDATE)
En la misma base PostgreSQL aislada (con la migración `UP` cargada), abrir dos terminales `psql` simultáneas (`Sesión A` y `Sesión B`):

1. **Caso Dos UPDATE simultáneos hacia el mismo correo normalizado**:
   - **Sesión A**:
     ```sql
     BEGIN;
     UPDATE public.app_users SET email = '  Colision.Concurrente@test.local ' WHERE id = '<uuid_cuenta_1>';
     -- No hacer COMMIT todavía; mantiene el pg_advisory_xact_lock sobre 'colision.concurrente@test.local'
     ```
   - **Sesión B**:
     ```sql
     BEGIN;
     UPDATE public.app_users SET email = 'colision.concurrente@TEST.local' WHERE id = '<uuid_cuenta_2>';
     -- La Sesión B queda en espera del advisory lock hasta que Sesión A termine.
     ```
   - **Sesión A**: Ejecutar `COMMIT;`. Inmediatamente la **Sesión B** despierta, evalúa `EXISTS (SELECT 1 FROM public.app_users ...)` viendo la fila confirmada de la Sesión A, y aborta con `ERROR: Ya existe otra cuenta en app_users con el correo normalizado (colision.concurrente@test.local)` (`SQLSTATE 23505`), conservando intacto el `persona_id` de `<uuid_cuenta_2>`.
   - Ejecutar `ROLLBACK;` en Sesión B y revertir los datos de prueba.

2. **Caso INSERT concurrente con UPDATE hacia el mismo correo normalizado**:
   - Repetir el mismo patrón: mientras la **Sesión A** tiene un `UPDATE` (o `INSERT`) abierto sin confirmar hacia `'mismo.correo@test.local'`, la **Sesión B** ejecuta un `INSERT` (o `UPDATE`) hacia `'  MISMO.CORREO@TEST.LOCAL  '`. Ambas adquieren exactamente la misma llave `pg_advisory_xact_lock(hashtext('app_users_autolink_email'), hashtext(v_email))`, serializando la ejecución e impidiendo duplicados.

---

## 4. Limitaciones conocidas de los `advisory locks`

1. **Alcance ligado al disparo del trigger**:
   - El bloqueo `pg_advisory_xact_lock` se adquiere dentro de `public.auto_link_persona_for_app_user()`. Si una sesión con privilegios de propietario/superusuario deshabilita los triggers (`ALTER TABLE public.app_users DISABLE TRIGGER ALL` o `SET session_replication_role = 'replica'`), el trigger no se ejecutará y solo actuará la restricción `app_users_email_key UNIQUE (email)` (sensible a mayúsculas/espacios).
2. **Espacio de hash de 32 bits (`hashtext`)**:
   - `pg_advisory_xact_lock(int4, int4)` utiliza dos enteros de 32 bits; una colisión de hash entre dos correos distintos solo provocaría espera transaccional momentánea (falso positivo de serialización), nunca un falso negativo de seguridad.
3. **Defensa definitiva en esquema**:
   - La garantía física absoluta en PostgreSQL independiente de triggers es un índice único funcional `CREATE UNIQUE INDEX ON public.app_users (LOWER(TRIM(email)))`, el cual queda reservado para una microintervención posterior cuando sea explícitamente autorizado.

---

## 5. Aplicación de la migración (cuando sea autorizada)

```bash
psql -v ON_ERROR_STOP=1 -d <db_objetivo> -f sql/identity-6.4b-2b2/001_protect_app_users_persona_link.up.sql
```

---

## 6. Validación posterior (Solo lectura, inmediatamente después de aplicar)

Repetir las consultas de la **Sección 2** y verificar que:

1. El conteo de `public.app_users` (`3` cuentas activas vinculadas a sus mismas personas activas) y `public.app_user_roles` (`3` asignaciones `ADMIN_TIC GLOBAL`) permanece **idéntico**.
2. `pg_get_triggerdef` para `t_app_users_autolink_persona_upd_email` muestra:
   `BEFORE UPDATE OF email, persona_id ON public.app_users FOR EACH ROW WHEN ((old.email IS DISTINCT FROM new.email) OR (old.persona_id IS DISTINCT FROM new.persona_id)) EXECUTE FUNCTION auto_link_persona_for_app_user()`
3. El conteo de `public.persona` y `public.persona_correo` no sufrió ninguna alteración (no se insertaron filas para las 64 personas sin `persona_correo`).

---

## 7. Procedimiento de reversión (Rollback del catálogo)

En caso de requerir restaurar exactamente las definiciones anteriores de la función y los triggers:

```bash
psql -v ON_ERROR_STOP=1 -d <db_objetivo> -f sql/identity-6.4b-2b2/001_protect_app_users_persona_link.down.sql
```

> **Advertencia sobre reversión (`DOWN`)**: El script `001_protect_app_users_persona_link.down.sql` restaura exclusivamente las definiciones originales de la función `public.auto_link_persona_for_app_user()` y de los triggers sin modificar filas existentes. **Revertir la función no revierte automáticamente los cambios de datos** (nuevas cuentas, nuevas personas o actualizaciones de correo) que pudieran haberse producido después del despliegue.
