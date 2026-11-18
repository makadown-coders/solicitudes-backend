import { Almacen, Cabecera, Centro, Consulta, Despacho, Detalle, Fila, Informe } from '../models/solicitudes/primer-nivel/Surtimiento';

const meses = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
export function mesPedido(texto: string): string | null {
  const t = (texto || '').trim().toLowerCase().replace(/\s+/g,' ');
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(t)) return t;
  const m = /^(?:(\d{1,2})\s*-\s*(\d{1,2}) )?([a-z]+) (?:de )?(\d{4})$/.exec(t);
  if (!m) return null;
  const n = meses.indexOf(m[3])+1;
  if (!n || (m[1] && (+m[1]<1 || +m[1]>+m[2] || +m[2]>new Date(Date.UTC(+m[4],n,0)).getUTCDate()))) return null;
  return m[4]+'-'+String(n).padStart(2,'0');
}

export function conciliar(q: Consulta, corte: string, centros: Centro[], almacenes: Almacen[], cab: Cabecera[], detalle: Detalle[], salidas: Despacho[]): Informe {
  const avisos = new Set<string>();
  const periodoDudoso = new Set<string>();
  const grupos = new Map<string,Cabecera[]>();
  const centrosPorId = new Map(centros.map(u=>[u.id,u]));
  const centrosPorClues = new Map(centros.map(u=>[u.clues,u]));
  for (const c of cab) {
    if (!mesPedido(c.periodo)) { periodoDudoso.add(c.clues); avisos.add(c.clues+' · Pedido '+c.id+' con periodo por validar: '+(c.periodo || 'vacío')); continue; }
    if (mesPedido(c.periodo)!==q.mes) continue;
    const lista = grupos.get(c.clues) || []; lista.push(c); grupos.set(c.clues,lista);
  }
  const filas = new Map<string,Fila>();
  const cabPorId = new Map<string,string>();
  for (const [clues, lista] of grupos) {
    for (const c of lista) cabPorId.set(c.id, clues);
    if (lista.length > 1) avisos.add(clues+' · '+lista.length+' solicitudes acumuladas. Posible reexportación o corrección; se incluyeron todos los registros del periodo.');
  }
  function fila(u: Centro, clave: string): Fila {
    const key = JSON.stringify([u.clues,clave]);
    let f=filas.get(key);
    if (!f) { f={tieneMovimiento:false,solicitudIds:[],clues:u.clues,nombre:u.nombre,municipio:u.municipio,clave,descripcion:'',medida:'',presentacionSas:'',solicitado:null,surtido:0,pendiente:null,excedente:null,cobertura:null,relacion:null,estado:'',validar:false}; filas.set(key,f); }
    return f;
  }
  const conDetalle = new Set<string>();
  for (const d of detalle) {
    const clues = cabPorId.get(d.id);
    if (!clues) continue;
    conDetalle.add(d.id);
    const f = fila(centrosPorClues.get(clues)!, d.clave);
    f.solicitudIds.push(d.id); // El servicio entrega un detalle agregado por cabecera y clave.
    f.solicitado = (f.solicitado ?? 0) + d.cantidad;
    f.descripcion = d.descripcion;
    if (f.medida && d.medidas && f.medida !== d.medidas) f.estado='Unidades de medida por validar';
    if (d.medidas) f.medida=d.medidas;
    if (d.invalido || !d.clave) f.estado='Detalle de solicitud por validar';
  }
  for (const [id,clues] of cabPorId) if (!conDetalle.has(id)) avisos.add(clues+' · Pedido sin renglones: '+id);
  const conSalida = new Set<Fila>();
  const observadas = new Set<number>();
  const comparables=new Set(q.presentaciones);
  const origenDudoso=new Set<string>();
  const ultimaFecha=new Map<number,string>();
  for (const s of salidas) {
    if (!s.origen) { origenDudoso.add(JSON.stringify([s.destino,s.clave])); avisos.add('Almacén sin identificar · destino '+(s.destino??'desconocido')+' · '+s.dia+' · '+s.clave); continue; }
    if (!s.dia) {
      avisos.add('Salida sin fecha, fuera del cálculo · almacén '+s.origen+' · destino '+(s.destino??'desconocido')+' · '+(s.clave||'sin clave'));
      continue;
    }
    observadas.add(s.origen);
    if(s.dia>(ultimaFecha.get(s.origen)||'')) ultimaFecha.set(s.origen,s.dia);
    const u=centrosPorId.get(s.destino!);
    if (!u) { if (!s.identificado || s.centro) avisos.add('Destino por validar · ID '+(s.destino??'ausente')+' · almacén '+s.origen+' · '+s.dia+' · '+s.clave); continue; }
    if (!s.clave || !u.unico) {
      avisos.add((!s.clave?'Clave SAS ausente':'CLUES ambigua')+' · destino '+u.id+' · almacén '+s.origen+' · '+s.dia);
      continue;
    }
    const f=fila(u,s.clave);
    f.tieneMovimiento=true;
    if (!f.descripcion) f.descripcion=s.descripcion;
    if (s.descripcion && !f.presentacionSas.split('\n').includes(s.descripcion)) f.presentacionSas += (f.presentacionSas?'\n':'')+s.descripcion;
    if (s.invalidas) {
      avisos.add(u.clues+' · '+s.clave+' · '+s.dia+' · almacén '+s.origen+' · cantidades inválidas excluidas: '+s.invalidas);
      f.estado='Cantidad SAS por validar';
    }
    if (s.cantidad !== null && Number.isFinite(s.cantidad)) {
      conSalida.add(f);
      f.surtido+=s.cantidad;
    }
  }
  const faltan=q.ventanas.some(v=>!v.almacenId || !observadas.has(v.almacenId));
  for(const v of q.ventanas) if(!v.almacenId || !observadas.has(v.almacenId)) avisos.add(v.zona+' · '+(v.almacenId?'Sin movimientos observados en la ventana':'Seleccione el almacén institucional'));
  const parcial=q.ventanas.some(v=>v.hasta>corte || (ultimaFecha.get(v.almacenId!)||'')<v.hasta);
  for(const v of q.ventanas) if(v.almacenId && observadas.has(v.almacenId)) avisos.add(v.zona+' · Última salida observada: '+ultimaFecha.get(v.almacenId)+'. Cierre de carga sin confirmar.');
  const filasPedido: Fila[]=[], sinSolicitud: Fila[]=[];
  for (const f of filas.values()) {
    if (!centrosPorClues.get(f.clues)?.unico) f.estado='CLUES ambigua';
    else if(origenDudoso.has(JSON.stringify([centrosPorClues.get(f.clues)?.id,f.clave]))) f.estado='Almacén de origen por validar';
    if (!grupos.has(f.clues) && periodoDudoso.has(f.clues) && !f.estado) f.estado='Periodo del pedido por validar';
    if (f.solicitado===null && !f.estado) f.estado='Salida sin solicitud identificada';
    if (!f.estado && faltan) f.estado=conSalida.has(f)?'Información SAS incompleta':'Sin salida registrada al corte · información incompleta';
    if (!f.estado && f.solicitado===0) f.estado='Solicitud en cero';
    if (!f.estado && f.surtido!==0) {
      f.validar=true;
      if (!comparables.has(JSON.stringify([f.clues,f.clave]))) f.estado='Presentación por validar';
    }
    if (!f.estado && f.solicitado!==null && f.solicitado>0) {
      f.pendiente=Math.max(f.solicitado-f.surtido,0); f.excedente=Math.max(f.surtido-f.solicitado,0);
      f.relacion=100*f.surtido/f.solicitado; f.cobertura=Math.min(f.relacion,100);
      f.estado=!conSalida.has(f)?(parcial?'Sin salida registrada al corte · ventana parcial':'Sin salida registrada al corte'):f.surtido===0?'Surtido neto cero':f.surtido<0?'Surtido neto negativo':f.excedente?'Excedente':f.pendiente?'Parcial':'Cubierta';
    }
    if (f.estado.includes('validar') || f.estado==='CLUES ambigua') avisos.add(f.clues+' · '+f.clave+' · '+f.estado);
    (f.solicitado===null?sinSolicitud:filasPedido).push(f);
  }
  return {corte,almacenes,filas:filasPedido,sinSolicitud,incidencias:[...avisos],ventanas:q.ventanas};
}
