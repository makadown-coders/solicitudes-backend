// src/services/citas.service.ts
import { Cita } from '../models/cita.model';
import axios from 'axios';
import { pool } from '../db/pool';
import { AxiosResponse } from 'axios';
import { PowerAutomateResponse } from '../models/powerAutomateResponse.model';

export default class CitasService {
  async init(reset: boolean) {
    if (reset) {
      await pool.query('TRUNCATE TABLE public.citas;');
    }
    return { ok: true };
  }

  /* Metodo BATCHA para esta estructura de citas
  public.citas (
    ejercicio integer,
    orden_de_suministro varchar(100),
    institucion varchar(50),
  contrato varchar(100),
    tipo_de_entrega varchar(100),
    clues_destino varchar(100),
    unidad varchar(255),
    fte_fmto varchar(100),
    proveedor varchar(255),
    clave_cnis varchar(100),
    descripcion text,
    compra varchar(100),
    tipo_de_red varchar(100),
    tipo_de_insumo varchar(100),
    grupo_terapeutico varchar(100),
    precio_unitario numeric,
    no_de_piezas_emitidas integer,
  fecha_emision date,
    fecha_limite_de_entrega date,
    pzas_recibidas_por_la_entidad numeric,
    fecha_recepcion_almacen varchar(100),
    numero_de_remision varchar(100),
    lote text,
    caducidad text,
    estatus varchar(100),
    folio_abasto varchar(100),
    almacen_hospital_que_recibio varchar(100),
    evidencia text,
    carga varchar(100),
    fecha_de_cita date
);
 */
  async batch(rows: Cita[]) {
    if (!rows?.length) return { inserted: 0 };
    const sql = `
      INSERT INTO public.citas (
        ejercicio,
        orden_de_suministro,
        institucion,
        contrato,
        tipo_de_entrega,
        clues_destino,
        unidad,
        fte_fmto,
        proveedor,
        clave_cnis,
        descripcion,
        compra,
        tipo_de_red,
        tipo_de_insumo,
        grupo_terapeutico,
        precio_unitario,
        no_de_piezas_emitidas,
        fecha_emision,
        fecha_limite_de_entrega,
        pzas_recibidas_por_la_entidad,
        fecha_recepcion_almacen,
        numero_de_remision,
        lote,
        caducidad,
        estatus,
        folio_abasto,
        almacen_hospital_que_recibio,
        evidencia,
        carga,
        fecha_de_cita)
      SELECT
        (x->>'ejercicio')::integer,
        NULLIF(x->>'orden_de_suministro',''),
        NULLIF(x->>'institucion',''),
        NULLIF(x->>'contrato',''),
        NULLIF(x->>'tipo_de_entrega',''),
        NULLIF(x->>'clues_destino',''),
        NULLIF(x->>'unidad',''),
        NULLIF(x->>'fte_fmto',''),
        NULLIF(x->>'proveedor',''),
        NULLIF(x->>'clave_cnis',''),
        NULLIF(x->>'descripcion',''),
        NULLIF(x->>'compra',''),
        NULLIF(x->>'tipo_de_red',''),
        NULLIF(x->>'tipo_de_insumo',''),
        NULLIF(x->>'grupo_terapeutico',''),
        (x->>'precio_unitario')::numeric,
        (x->>'no_de_piezas_emitidas')::integer,
        NULLIF(x->>'fecha_emision','')::date,
        NULLIF(x->>'fecha_limite_de_entrega','')::date,
        (x->>'pzas_recibidas_por_la_entidad')::numeric,
        NULLIF(x->>'fecha_recepcion_almacen',''),
        NULLIF(x->>'numero_de_remision',''),
        NULLIF(x->>'lote',''),
        NULLIF(x->>'caducidad',''),
        NULLIF(x->>'estatus',''),
        NULLIF(x->>'folio_abasto',''),
        NULLIF(x->>'almacen_hospital_que_recibio',''),
        NULLIF(x->>'evidencia',''),
        NULLIF(x->>'carga',''),
        NULLIF(x->>'fecha_de_cita','')::date
      FROM jsonb_array_elements($1::jsonb) AS x;
    `;
    const { rowCount } = await pool.query(sql, [JSON.stringify(rows)]);
    return { inserted: rowCount || 0 };
  }

  /**
   * En vias de deprecación!
   * @returns 
   */
  async obtenerCitasDePowerAutomate64(): Promise<string> {
    console.log('🔁 Obteniendo info con Power Automate');
    let citasRetorno: Cita[] = [];
    let fila: any = null;
    try {
      // Hacer POST al flujo de Power Automate
      const response: AxiosResponse<PowerAutomateResponse> = await axios.post(
        process.env.AZURE_URL as string, // Aseguramos que AZURE_URL no sea undefined
        { claveSecreta: process.env.AZURE_PAYLOAD_SECRET },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.data?.archivo) {
        console.error('❌ No se recibió el archivo base64 en la respuesta.');
        return;
      }

      console.log(`✅ Datos en Base64 cargados desde Power Automate.`);
      return response.data.archivo;

    } catch (err: any) {
      console.error('❌ Error al ejecutar el seed de citas:', err);
      console.log('🔁 Procesando fila:', fila);
    }
    return null;
  }
}
