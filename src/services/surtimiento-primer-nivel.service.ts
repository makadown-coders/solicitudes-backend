import { pool } from '../db/pool';
import { Almacen, Cabecera, Centro, Consulta, Despacho, Detalle } from '../models/solicitudes/primer-nivel/Surtimiento';
import { conciliar, mesPedido } from './surtimiento-calculo';

export async function analizar(input: Consulta) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows:[{corte}]}=await client.query("SELECT (now() AT TIME ZONE 'America/Tijuana')::date::text AS corte");
    const {rows:almacenes}=await client.query<Almacen>(`
      SELECT u.id,u.nombre,ARRAY(SELECT DISTINCT upper(trim(a.alias_dash))
        FROM public.unidad_medica_alias a WHERE a.unidad_medica_id=u.id
        AND upper(trim(a.alias_dash)) IN ('AZM','AZT','AZE')
        UNION SELECT upper(trim(a.alias_sas)) FROM public.unidad_medica_alias a
        WHERE a.unidad_medica_id=u.id AND upper(trim(a.alias_sas)) IN ('AZM','AZT','AZE')) zonas
      FROM public.unidad_medica u WHERE EXISTS (SELECT 1 FROM public.v_unidad_medica_detalle v
        WHERE v.id=u.id AND upper(trim(v.tipo_unidad))='ALMACENES') ORDER BY u.nombre,u.id`);
    const ventanas=input.ventanas.map(v=>{
      const matches=almacenes.filter(a=>a.zonas.includes(v.zona));
      const almacenId=v.almacenId ?? (matches.length===1?matches[0].id:undefined);
      if(almacenId && !almacenes.some(a=>a.id===almacenId)) throw new RangeError('Almacén fuera de catálogo.');
      return {...v,almacenId};
    });
    const ids=ventanas.map(v=>v.almacenId).filter(Boolean);
    if(new Set(ids).size!==ids.length) throw new RangeError('Cada ventana debe corresponder a un almacén distinto.');
    const {rows:centros}=await client.query<Centro>(`
      WITH catalogo AS (SELECT id,nombre,activo,upper(trim(cluesimb)) clues,
        count(*) OVER (PARTITION BY upper(trim(cluesimb)))=1 unico FROM public.unidad_medica)
      SELECT u.id,u.clues,u.nombre,u.unico,max(v.nombre_municipio) municipio
      FROM catalogo u JOIN public.v_unidad_medica_detalle v ON v.id=u.id
      WHERE u.activo AND nullif(u.clues,'') IS NOT NULL AND upper(trim(v.tipo_unidad))='CENTRO DE SALUD'
      GROUP BY u.id,u.clues,u.nombre,u.unico`);
    const {rows:cab}=await client.query<Cabecera>(`
      SELECT b.id::text,upper(trim(b.cluesimb)) clues,b.periodo_texto periodo,
        b.created_day::text fecha,b.tipo_pedido tipo,EXISTS(SELECT 1 FROM public.solicitud_primer_nivel_contexto c
        WHERE c.solicitud_id=b.id) contexto FROM public.solicitud_bitacora b
      WHERE upper(trim(b.cluesimb))=ANY($1::text[]) ORDER BY b.created_at,b.id`,[centros.map(c=>c.clues)]);
    const {rows:detalle}=await client.query<Detalle>(`
      WITH d AS (SELECT solicitud_id::text id,upper(trim(clave)) clave,sum(cantidad)::float8 cantidad,
        bool_or(cantidad IS NULL OR cantidad<0) OR count(DISTINCT nullif(upper(trim(unidad_medida)),''))>1 invalido,
        string_agg(DISTINCT nullif(trim(unidad_medida),''),', ') medidas
        FROM public.solicitud_bitacora_detalle WHERE solicitud_id=ANY($1::uuid[])
        GROUP BY solicitud_id,upper(trim(clave)))
      SELECT d.*,coalesce(i.descripcion,'') descripcion FROM d LEFT JOIN LATERAL
        (SELECT descripcion FROM cnis.insumo WHERE upper(trim(clave))=d.clave
        ORDER BY activo DESC,id DESC LIMIT 1) i ON true`,[cab.filter(c=>mesPedido(c.periodo)===input.mes).map(c=>c.id)]);
    const {rows:salidas}=await client.query<Despacho>(`
      WITH ventanas AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS v("almacenId" int,desde date,hasta date)),
      diario AS (SELECT s.fecha_entregado::date dia,s.unidad_origen_id origen,s.unidad_destino_id destino,
        upper(trim(s.clave_cnis)) clave,s.tipo,s.movto,sum(s.cantidad)::float8 cantidad,
        bool_or(s.cantidad IS NULL OR s.cantidad<=0) dudoso,
        string_agg(DISTINCT nullif(trim(s.descripcion),''),E'\\n') descripcion
        FROM public.salida s WHERE EXISTS (SELECT 1 FROM ventanas v
          WHERE (s.unidad_origen_id=v."almacenId" OR NOT EXISTS
            (SELECT 1 FROM public.unidad_medica u WHERE u.id=s.unidad_origen_id))
          AND s.fecha_entregado>=v.desde AND s.fecha_entregado<least(v.hasta,$2::date)+1)
        GROUP BY s.fecha_entregado::date,s.unidad_origen_id,s.unidad_destino_id,upper(trim(s.clave_cnis)),s.tipo,s.movto)
      SELECT d.dia::text,o.id origen,d.destino,d.clave,d.tipo::text tipo,d.movto::text movto,d.cantidad,d.dudoso,d.descripcion,
        nullif(trim(u.cluesimb),'') IS NOT NULL identificado,
        EXISTS(SELECT 1 FROM public.v_unidad_medica_detalle v WHERE v.id=d.destino
          AND upper(trim(v.tipo_unidad))='CENTRO DE SALUD') centro
      FROM diario d LEFT JOIN public.unidad_medica u ON u.id=d.destino
      LEFT JOIN public.unidad_medica o ON o.id=d.origen`,[JSON.stringify(ventanas),corte]);
    await client.query('COMMIT');
    return conciliar({...input,ventanas},corte,centros,almacenes,cab,detalle,salidas);
  } catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
}
