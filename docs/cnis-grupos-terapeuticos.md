# Consulta de grupos terapéuticos CNIS

Esta API expone en modo de solo lectura la clasificación terapéutica CNIS de las claves presentes en `public.articulos`.

## Endpoints

- `GET /api/cnis/grupos-terapeuticos`: grupos que tienen al menos una clave relacionada con `public.articulos`.
- `GET /api/cnis/grupos-terapeuticos/articulos`: asociaciones distintas entre clave y grupo. Una clave puede aparecer varias veces cuando pertenece a más de un grupo.
- `GET /api/cnis/grupos-terapeuticos/{numero}/articulos`: artículos distintos asociados al grupo indicado. Un grupo sin coincidencias devuelve `[]`.

## Correspondencia de claves

La relación se obtiene normalizando exclusivamente `articulos.clave` con:

```sql
regexp_replace(trim(a.clave), '[^0-9]', '', 'g')
```

El resultado se compara con `cnis.insumo.clave_normalizada`. La columna `articulos.clavea` no participa en la correspondencia.

Las consultas utilizan `cnis.insumo_grupo` para conservar la relación muchos a muchos y no modifican tablas, vistas ni datos. El número del grupo se envía a PostgreSQL como parámetro `$1`.

Por alcance actual, estas rutas no incluyen autenticación ni autorización.
