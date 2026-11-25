import { pool } from '../db/pool';
import { Almacen, Cabecera, Centro, Consulta, Despacho, Detalle } from '../models/solicitudes/primer-nivel/Surtimiento';
import { cabeceraElegible, conciliar, detectarSustituciones, rangoUltimos30 } from './surtimiento-calculo';
import HomologosService from './homologos.service';
import { cargarDesgloseProgramatico } from './surtimiento-programatico';

export async function analizar(input: Consulta) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows:[{corte}]}=await client.query("SELECT (now() AT TIME ZONE 'America/Tijuana')::date::text AS corte");
    const modalidad=input.modalidad??'MES_CALENDARIO';
    const rangoBase=rangoUltimos30(corte);
    if(modalidad==='ULTIMOS_30_DIAS' && input.ventanas.some(v=>v.desde>rangoBase.desde)) {
      throw new RangeError('La fecha inicial puede conservarse o moverse hacia atrás para ampliar el análisis.');
    }
    const rango=modalidad==='ULTIMOS_30_DIAS' ? {
      // La ventana inicia en 30 días, pero puede ampliarse hacia atrás.
      // BETWEEN conserva inclusivos el día inicial y la fecha de corte.
      desde:input.ventanas.reduce((min,v)=>v.desde<min?v.desde:min,rangoBase.desde),
      hasta:corte
    } : {
      desde:input.mes+'-01',
      hasta:new Date(Date.UTC(Number(input.mes.slice(0,4)),Number(input.mes.slice(5,7)),0)).toISOString().slice(0,10)
    };
    const consulta: Consulta={...input,modalidad,solicitudesDesde:rango.desde,solicitudesHasta:rango.hasta};
    const {rows:almacenes}=await client.query<Almacen>(`
      WITH zonas_institucionales(zona, cluesimb) AS (
        VALUES ('AZM','BCIMB001405'), ('AZT','BCIMB001335'), ('AZE','BCIMB001340')
      )
      SELECT u.id,u.nombre,ARRAY(SELECT z.zona FROM zonas_institucionales z
        WHERE z.cluesimb=upper(trim(u.cluesimb))
        UNION SELECT upper(trim(a.alias_dash))
        FROM public.unidad_medica_alias a WHERE a.unidad_medica_id=u.id
        AND upper(trim(a.alias_dash)) IN ('AZM','AZT','AZE')
        UNION SELECT upper(trim(a.alias_sas)) FROM public.unidad_medica_alias a
        WHERE a.unidad_medica_id=u.id AND upper(trim(a.alias_sas)) IN ('AZM','AZT','AZE')) zonas
      FROM public.unidad_medica u WHERE EXISTS (SELECT 1 FROM public.v_unidad_medica_detalle v
        WHERE v.id=u.id AND upper(trim(v.tipo_unidad))='ALMACENES') ORDER BY u.nombre,u.id`);
    const pendientes = input.ventanas.filter(v => {
      const candidatos = almacenes.filter(a => a.zonas.includes(v.zona));
      return candidatos.length !== 1 || candidatos[0].zonas.length !== 1;
    });
    if (pendientes.length) {
      const zonas = pendientes.map(v => v.zona).join(', ');
      throw new RangeError('Revise la configuración del catálogo para '+zonas+
        '. Cada zona debe corresponder a un único almacén institucional.');
    }
    const ventanas = input.ventanas.map(({zona, desde, hasta}) => ({
      zona, desde, hasta, almacenId: almacenes.find(a => a.zonas.includes(zona))!.id
    }));
    const {rows:centros}=await client.query<Centro>(`
      WITH catalogo AS (SELECT id,nombre,activo,upper(trim(cluesimb)) clues,
        count(*) OVER (PARTITION BY upper(trim(cluesimb)))=1 unico FROM public.unidad_medica)
      SELECT u.id,u.clues,u.nombre,u.unico,max(v.nombre_municipio) municipio,
        CASE
          WHEN u.clues='BCIMB000133' THEN 'MEXICALI'
          WHEN upper(trim(max(v.nombre_municipio))) IN ('TIJUANA','TECATE','PLAYAS DE ROSARITO') THEN 'TIJUANA'
          WHEN upper(trim(max(v.nombre_municipio))) IN ('MEXICALI','SAN FELIPE') THEN 'MEXICALI'
          WHEN upper(trim(max(v.nombre_municipio))) IN ('ENSENADA','SAN QUINTIN','SAN QUINTÍN') THEN 'ENSENADA'
          ELSE upper(trim(max(v.nombre_municipio)))
        END jurisdiccion
      FROM catalogo u JOIN public.v_unidad_medica_detalle v ON v.id=u.id
      WHERE u.activo AND nullif(u.clues,'') IS NOT NULL AND upper(trim(v.tipo_unidad))='CENTRO DE SALUD'
      GROUP BY u.id,u.clues,u.nombre,u.unico`);
    const {rows:cab}=await client.query<Cabecera>(`
      SELECT b.id::text,upper(trim(b.cluesimb)) clues,b.periodo_texto periodo,
        (b.created_at AT TIME ZONE 'America/Tijuana')::date::text fecha,b.tipo_pedido tipo,EXISTS(SELECT 1 FROM public.solicitud_primer_nivel_contexto c
        WHERE c.solicitud_id=b.id) contexto FROM public.solicitud_bitacora b
      WHERE upper(trim(b.cluesimb))=ANY($1::text[])
        AND ($2::text<>'ULTIMOS_30_DIAS' OR (b.created_at AT TIME ZONE 'America/Tijuana')::date BETWEEN $3::date AND $4::date)
      ORDER BY b.created_at,b.id`,[centros.map(c=>c.clues),modalidad,rango.desde,rango.hasta]);
    const {rows:detalle}=await client.query<Detalle>(`
      WITH d AS (SELECT solicitud_id::text id,upper(trim(clave)) clave,sum(cantidad)::float8 cantidad,
        bool_or(cantidad IS NULL OR cantidad<0) invalido
        FROM public.solicitud_bitacora_detalle WHERE solicitud_id=ANY($1::uuid[])
        GROUP BY solicitud_id,upper(trim(clave)))
      SELECT d.*,coalesce(i.descripcion,'') descripcion FROM d LEFT JOIN LATERAL
        (SELECT descripcion FROM cnis.insumo WHERE upper(trim(clave))=d.clave
        ORDER BY activo DESC,id DESC LIMIT 1) i ON true`,[cab.filter(c=>cabeceraElegible(consulta,c)).map(c=>c.id)]);
    const {rows:salidas}=await client.query<Despacho>(`
      WITH ventanas AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS v("almacenId" int,desde date,hasta date)),
      diario AS (SELECT s.fecha_entregado::date dia,s.unidad_origen_id origen,s.unidad_destino_id destino,
        upper(trim(s.clave_cnis)) clave,
        sum(s.cantidad) FILTER (WHERE s.cantidad::text NOT IN ('NaN','Infinity','-Infinity'))::float8 cantidad,
        count(*) FILTER (WHERE s.cantidad IS NULL OR s.cantidad::text IN ('NaN','Infinity','-Infinity'))::int invalidas,
        string_agg(DISTINCT nullif(trim(s.descripcion),''),E'\\n') descripcion
        FROM public.salida s WHERE EXISTS (SELECT 1 FROM ventanas v
          WHERE (s.unidad_origen_id=v."almacenId" OR NOT EXISTS
            (SELECT 1 FROM public.unidad_medica u WHERE u.id=s.unidad_origen_id))
          AND ((s.fecha_entregado>=v.desde AND s.fecha_entregado<least(v.hasta,$2::date)+1)
            OR (s.fecha_entregado IS NULL AND s.unidad_origen_id=v."almacenId")))
        GROUP BY s.fecha_entregado::date,s.unidad_origen_id,s.unidad_destino_id,upper(trim(s.clave_cnis)))
      SELECT d.dia::text,o.id origen,d.destino,d.clave,d.cantidad,d.invalidas,d.descripcion,
        nullif(trim(u.cluesimb),'') IS NOT NULL identificado,
        EXISTS(SELECT 1 FROM public.v_unidad_medica_detalle v WHERE v.id=d.destino
          AND upper(trim(v.tipo_unidad))='CENTRO DE SALUD') centro
      FROM diario d LEFT JOIN public.unidad_medica u ON u.id=d.destino
      LEFT JOIN public.unidad_medica o ON o.id=d.origen`,[JSON.stringify(ventanas),corte]);
    const informe=conciliar({...consulta,ventanas},corte,centros,almacenes,cab,detalle,salidas);
    informe.desgloseProgramatico = await cargarDesgloseProgramatico(
      client, informe.filas, cab.filter(c => cabeceraElegible(consulta, c)), detalle,
    );
    const clavesFaltantes=Array.from(new Set(informe.filas
      .filter(f=>f.pendiente!==null && f.pendiente>0 && !!f.clave).map(f=>f.clave)));
    const relaciones=clavesFaltantes.length
      ? await new HomologosService().batchForward(clavesFaltantes)
      : [];
    informe.sustituciones=detectarSustituciones(informe,relaciones);
    await client.query('COMMIT');
    return informe;
  } catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
}
