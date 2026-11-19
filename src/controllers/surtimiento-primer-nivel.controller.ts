import { Request, Response } from 'express';
import { analizar } from '../services/surtimiento-primer-nivel.service';
import { Ventana } from '../models/solicitudes/primer-nivel/Surtimiento';

function fecha(s: unknown): s is string {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10)===s;
}
export async function analizarSurtimiento(req: Request,res: Response) {
  const q=req.body;
  if (!q || typeof q.mes!=='string' || !/^\d{4}-(0[1-9]|1[012])$/.test(q.mes) ||
    !['MES_CALENDARIO','ULTIMOS_30_DIAS'].includes(q.modalidad??'MES_CALENDARIO') ||
    !Array.isArray(q.ventanas) || !q.ventanas.length || q.ventanas.length>3 ||
    !q.ventanas.every((v:Ventana)=>v && ['AZM','AZT','AZE'].includes(v.zona) &&
      fecha(v.desde) && fecha(v.hasta) && v.desde<=v.hasta && (v.almacenId==null||Number.isSafeInteger(v.almacenId))) ||
    new Set(q.ventanas.map((v:Ventana)=>v.zona)).size!==q.ventanas.length) {
    res.status(400).json({error:'Revise el periodo, las ventanas y las selecciones.'}); return;
  }
  try {res.json(await analizar(q));} catch(e) {
    res.status(e instanceof RangeError?400:500).json({error:e instanceof RangeError?e.message:'No fue posible consultar los registros de abasto.'});
  }
}
