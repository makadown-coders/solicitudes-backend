// src/services/citas.service.ts
import { PaginationQuery } from '../models/PaginationQuery';
import { PaginationResult } from '../models/PaginationResult';
import { Cita } from '../models/Cita';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { excelDateToDatestring, formatFechaMultiple } from '../helpers/helper';
import { AxiosResponse } from 'axios';
import axios from 'axios';
import XLSX from 'xlsx';
import { CitaRow } from '../models/CitaRow';
import { PowerAutomateResponse } from '../models/PowerAutomateResponse';

dotenv.config();

const pool = new Pool({
  user: process.env.POSTGRES_USERNAME,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10)
});

class CitasService {
  async obtenerCitas(query: PaginationQuery): Promise<PaginationResult<Cita>> {
    console.log('PaginationQuery recibido', query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'fecha_de_cita';
    const sortOrder = (query.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const search = query.search?.trim();

    console.log('sortBy', sortBy);

    /*const allowedSortFields = [
      'fecha_de_cita', 'orden_de_suministro', 'tipo_de_entrega',
      'clave_cnis', 'institucion', 'unidad'
    ];*/
    const sortField = sortBy; // allowedSortFields.includes(sortBy) ? sortBy : 'fecha_de_cita';

    const camposTexto: (keyof Cita)[] = [
      'orden_de_suministro', 'institucion', 'tipo_de_entrega', 'clues_destino', 'unidad',
      'fte_fmto', 'proveedor', 'clave_cnis', 'descripcion', 'compra', 'tipo_de_red',
      'tipo_de_insumo', 'grupo_terapeutico', 'numero_de_remision', 'lote', 'caducidad',
      'estatus', 'folio_abasto', 'almacen_hospital_que_recibio', 'evidencia', 'carga',
      'observacion', 'fecha_recepcion_almacen'
    ];

    const camposNumericos: (keyof Cita)[] = [
      'ejercicio', 'precio_unitario', 'no_de_piezas_emitidas', 'pzas_recibidas_por_la_entidad'
    ];

    const camposFecha: (keyof Cita)[] = [
      'fecha_de_cita', 'fecha_limite_de_entrega'
    ];

    const condiciones: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Filtros explícitos del frontend
    const filtrosExplicitos = new Set(Object.keys(query).filter(k => !['page', 'limit', 'sortBy', 'sortOrder', 'search'].includes(k)));

    // Aplica filtros explícitos
    for (const campo of [...camposTexto, ...camposNumericos, ...camposFecha]) {
      const valor = (query as any)[campo];
      if (valor !== undefined && valor !== null && valor !== '') {
        if (camposTexto.includes(campo)) {
          condiciones.push(`${campo} ILIKE $${idx}`);
          values.push(`%${valor}%`);
          idx++;
        } else if (camposNumericos.includes(campo)) {
          condiciones.push(`${campo} = $${idx}`);
          values.push(Number(valor));
          idx++;
        } else if (camposFecha.includes(campo)) {
          condiciones.push(`${campo} = $${idx}`);
          values.push(valor);
          idx++;
        }
      }
    }

    // Aplica filtro global 'search' sobre los campos no enviados explícitamente
    if (search) {
      const orSearch: string[] = [];
      for (const campo of [...camposTexto, ...camposNumericos, ...camposFecha]) {
        if (!filtrosExplicitos.has(campo)) {
          orSearch.push(`${campo}::text ILIKE $${idx}`);
          values.push(`%${search}%`);
          idx++; // << AQUI es crítico incrementar idx
        }
      }
      if (orSearch.length > 0) {
        condiciones.push(`(${orSearch.join(' OR ')})`);
      }
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
    let filtrosValues = [...values];

    const limitPlaceholder = `$${idx++}`;
    const offsetPlaceholder = `$${idx++}`;
    values.push(limit, offset);

    /*if (search) {
      filtrosValues = values.slice(0, idx - 2);
    }*/

    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      console.log(`SELECT * FROM citas ${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values);
      const citasResult = await client.query<Cita>(
        `SELECT * FROM citas ${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values
      );

      const totalResult = await client.query(
        `SELECT COUNT(*) FROM citas ${whereClause}`,
        filtrosValues
      );

      const total = parseInt(totalResult.rows[0].count, 10);

      return {
        data: citasResult.rows,
        total,
        page,
        limit
      };
    } finally {
      if (client) client.release();
    }
  }

  async buscarOrdenes(orden: string): Promise<any[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          orden_de_suministro, clues_destino, unidad, proveedor, clave_cnis,
          descripcion, tipo_de_red, no_de_piezas_emitidas AS cantidad, fecha_de_cita
         FROM citas
         WHERE orden_de_suministro ILIKE $1
         GROUP BY orden_de_suministro, clues_destino, unidad, proveedor, clave_cnis,
           descripcion, tipo_de_red, no_de_piezas_emitidas, fecha_de_cita
         ORDER BY fecha_de_cita DESC
         LIMIT 10`,
        [`%${orden}%`]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
  
  async obtenerCitasDePowerAutomate(): Promise<Cita[]> {
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

      const buffer = Buffer.from(response.data.archivo, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: CitaRow[] = XLSX.utils.sheet_to_json<CitaRow>(sheet, { header: 1 });
      console.log('🔁 Procesando', rows.length, 'filas.');

      let headerLeido = false;
      for (const popo of rows) {
        fila = popo;
        if (!headerLeido) {
          headerLeido = true;
          continue;
        }
        console.log('🔁 Procesando orden de suministro:', fila[1]);
        const ejercicio = fila[0];
        if (!ejercicio || (ejercicio + '').trim().length === 0) {
          console.log('🔁 fin de archivo detectado. Finalizando obtención de datos', fila);
          break;
        }
        const ordenSuministro = fila[1];
        const institucion = fila[2];
        const tipoEntrega = fila[3];
        const cluesDestino = fila[4];
        const unidad = fila[5];
        const fuenteFinanciamiento = fila[6];
        const proveedor = fila[7];
        const claveCNIS = fila[8];
        const descripcion = fila[9];
        const compra = fila[10];
        const tipoRed = fila[11];
        const tipoInsumo = fila[12];
        const grupoTerapeutico = fila[13];
        const precioUnitario = fila[14];
        const piezasEmitidas = fila[15];
        fila[16] = fila[16] instanceof Date ?
          fila[16] :
          (excelDateToDatestring(fila[16]));
        const fechaLimiteEntrega = fila[16];
        const piezasRecibidas = fila[17];
        // console.log('fechaRecepcionAlmacen before', fila[18]);

        /* Condiciono a que la fecha de recepción siempre sea null 
           si no tiene numero de remision (fila[19]) porque están intimamente ligados
        */
        const fechaRecepcionAlmacen =
          fila[19] === null ? null :
            (fila[18] instanceof Date ? fila[18] :
              (!(fila[18] + '').includes('/') ? excelDateToDatestring(fila[18] + '') :
                (formatFechaMultiple(fila[18] as string | null))
              ))
          ;
        // console.log('fechaRecepcionAlmacen after', fechaRecepcionAlmacen);
        const numeroRemision = fila[19];
        const lote = fila[20];
        const caducidad = fila[21] === null ? null :
          (fila[21] instanceof Date ? fila[21] :
            (!(fila[21] + '').includes('/') ? excelDateToDatestring(fila[21] + '') :
              (formatFechaMultiple(fila[21] as string | null))
            ))
          ;
        const estatus = fila[22];
        const folioAbasto = fila[23];
        const almacenHospital = fila[24];
        const evidencia = fila[25];
        const carga = fila[26];
        const fechaCita = (fila[27] instanceof Date ?
          fila[27] :
          (excelDateToDatestring(fila[27]+'')) )! as Date | null;
        // columnas 28 y 29 no se usan en el excel        
        const observacion = fila[30];

        const nuevoRegistro: Cita = new Cita();
        nuevoRegistro.ejercicio = ejercicio;
        nuevoRegistro.orden_de_suministro = ordenSuministro;
        nuevoRegistro.institucion = institucion;
        nuevoRegistro.tipo_de_entrega = tipoEntrega;
        nuevoRegistro.clues_destino = cluesDestino;
        nuevoRegistro.unidad = unidad;
        nuevoRegistro.fte_fmto = fuenteFinanciamiento;
        nuevoRegistro.proveedor = proveedor;
        nuevoRegistro.clave_cnis = claveCNIS;
        nuevoRegistro.descripcion = descripcion;
        nuevoRegistro.compra = compra;
        nuevoRegistro.tipo_de_red = tipoRed;
        nuevoRegistro.tipo_de_insumo = tipoInsumo;
        nuevoRegistro.fecha_limite_de_entrega = fechaLimiteEntrega;
        nuevoRegistro.grupo_terapeutico = grupoTerapeutico;
        nuevoRegistro.precio_unitario = precioUnitario !== null && precioUnitario !== undefined ? Number(precioUnitario) : null;
        nuevoRegistro.no_de_piezas_emitidas = piezasEmitidas !== null && piezasEmitidas !== undefined ? Number(piezasEmitidas) : null;
        nuevoRegistro.fecha_de_cita = fechaCita;
        nuevoRegistro.pzas_recibidas_por_la_entidad = piezasRecibidas !== null && piezasRecibidas !== undefined ? Number(piezasRecibidas) : null;
        nuevoRegistro.fecha_recepcion_almacen = fechaRecepcionAlmacen ?
          (fechaRecepcionAlmacen + '').replace('NaN-NaN-NaN', '') : null;
        nuevoRegistro.numero_de_remision = numeroRemision;
        nuevoRegistro.lote = lote;
        nuevoRegistro.caducidad = caducidad ?
          (caducidad + '').replace('NaN-NaN-NaN', '') : null;
        nuevoRegistro.estatus = estatus;
        nuevoRegistro.folio_abasto = folioAbasto;
        nuevoRegistro.almacen_hospital_que_recibio = almacenHospital;
        nuevoRegistro.evidencia = evidencia;
        nuevoRegistro.carga = carga ?? null;
        nuevoRegistro.fecha_de_cita = fechaCita;
        nuevoRegistro.observacion = observacion;

        citasRetorno.push(nuevoRegistro);
      }

      console.log(`✅ Datos cargados desde Power Automate. Total: ${citasRetorno.length} registros.`);

    } catch (err: any) {
      console.error('❌ Error al obtener de power automate:', err);
      console.log('🔁 Procesando fila:', fila);
    }
    return citasRetorno;
  }

  async refrescarCitasDesdePowerAutomate(): Promise<number> {
    let client: PoolClient | null = null;
    let fila: any = null;
    let actualizado = 0;
    try {
      client = await pool.connect();

      console.log('Iniciando Refresh⚠️ Solicitando datos al flujo Power Automate...');

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

      const buffer = Buffer.from(response.data.archivo, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: CitaRow[] = XLSX.utils.sheet_to_json<CitaRow>(sheet, { header: 1 });
      let headerLeido = false;
      for (const popo of rows) {
        fila = popo;
        if (!headerLeido) {
          headerLeido = true;
          continue;
        }
        // console.log('🔁 Procesando fila:', fila);
        const ejercicio = fila[0];
        const ordenSuministro = fila[1];
        const institucion = fila[2];
        const tipoEntrega = fila[3];
        const cluesDestino = fila[4];
        const unidad = fila[5];
        const fuenteFormato = fila[6];
        const proveedor = fila[7];
        const claveCNIS = fila[8];
        const descripcion = fila[9];
        const compra = fila[10];
        const tipoRed = fila[11];
        const tipoInsumo = fila[12];
        const grupoTerapeutico = fila[13];
        const precioUnitario = fila[14];
        const piezasEmitidas = fila[15];
        fila[16] = fila[16] instanceof Date ?
          fila[16] :
          (excelDateToDatestring(fila[16]));
        const fechaLimiteEntrega = fila[16];
        const piezasRecibidas = fila[17];
        /* Condiciono a que la fecha de recepción siempre sea null 
           si no tiene numero de remision (fila[19]) porque están intimamente ligados
        */
        let fechaRecepcionAlmacen =
          fila[19] === null ? null :
            (fila[18] instanceof Date ? fila[18] :
              (!(fila[18] + '').includes('/') ? excelDateToDatestring(fila[18] + '') :
                (formatFechaMultiple(fila[18] as string | null))
              ))
          ;
        const numeroRemision = fila[19];
        const lote = fila[20];
        let caducidad = fila[21] === null ? null :
          (fila[21] instanceof Date ? fila[21] :
            (!(fila[21] + '').includes('/') ? excelDateToDatestring(fila[21] + '') :
              (formatFechaMultiple(fila[21] as string | null))
            ))
          ;
        const estatus = fila[22];
        const folioAbasto = fila[23];
        const almacenHospital = fila[24];
        const evidencia = fila[25];
        const carga = fila[26];
        const fechaCita = fila[27];
        // columnas 28 y 29 no se usan en el excel        
        const observacion = fila[30];

        const result = await client.query(
          'SELECT * FROM citas WHERE orden_de_suministro = $1 LIMIT 1',
          [ordenSuministro]
        );

        if (result.rowCount === 0) {
          // Insertar si no existe
          await client.query(
            `INSERT INTO citas (ejercicio,
                              orden_de_suministro,
                              institucion,
                              tipo_de_entrega,
                              clues_destino,
                              unidad,
                              fte_fmto,
                              proveedor,
                              clave_cnis,
                              descripcion, compra, tipo_de_red, tipo_de_insumo,
                              grupo_terapeutico, precio_unitario,
                              no_de_piezas_emitidas, fecha_limite_de_entrega,
                              pzas_recibidas_por_la_entidad,
                              fecha_recepcion_almacen, numero_de_remision,
                              lote, caducidad, estatus, folio_abasto,
                              almacen_hospital_que_recibio,
                              evidencia, carga, fecha_de_cita, observacion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                   $21, $22, $23, $24, $25, $26, $27, $28, $29)`,
            [ejercicio,
              ordenSuministro,
              institucion,
              tipoEntrega,
              cluesDestino,
              unidad,
              fuenteFormato,
              proveedor,
              claveCNIS,
              descripcion,
              compra,
              tipoRed,
              tipoInsumo,
              grupoTerapeutico,
              precioUnitario !== null && precioUnitario !== undefined ? Number(precioUnitario) : null,
              piezasEmitidas !== null && piezasEmitidas !== undefined ? Number(piezasEmitidas) : null,
              fechaLimiteEntrega,
              piezasRecibidas !== null && piezasRecibidas !== undefined ? Number(piezasRecibidas) : null,
              fechaRecepcionAlmacen ?
                (fechaRecepcionAlmacen + '').replace('NaN-NaN-NaN', '') : null,
              numeroRemision,
              lote,
              caducidad ?
                (caducidad + '').replace('NaN-NaN-NaN', '') : null,
              estatus,
              folioAbasto,
              almacenHospital,
              evidencia,
              carga ?? null,
              fechaCita ? excelDateToDatestring(fechaCita) : null,
              observacion]
          );
          actualizado++;
        } else {
          const existente = result.rows[0];
          if (fechaRecepcionAlmacen) {
            fechaRecepcionAlmacen = (fechaRecepcionAlmacen + '').replace('NaN-NaN-NaN', '');
          }
          if (caducidad) {
            caducidad = (caducidad + '').replace('NaN-NaN-NaN', '');
          }

          const cambios =
            existente.pzas_recibidas_por_la_entidad != piezasRecibidas ||
            existente.fechaRecepcionAlmacen != fechaRecepcionAlmacen ||
            existente.numero_de_remision != numeroRemision ||
            existente.lote != lote;

          if (cambios) {
            await client.query(
              `UPDATE citas SET 
                  pzas_recibidas_por_la_entidad = $2,
                  fecha_recepcion_almacen = $3,
                  numero_de_remision = $4,
                  lote = $5, caducidad = $6, 
                  estatus = $7, folio_abasto = $8,
                  almacen_hospital_que_recibio = $9, evidencia = $10, carga = $11,
                  fecha_de_cita = $12, observacion = $13
                 WHERE orden_de_suministro = $1`,
              [ordenSuministro, piezasRecibidas, fechaRecepcionAlmacen,
                numeroRemision,
                lote, caducidad,
                estatus, folioAbasto,
                almacenHospital, evidencia, carga ?? null,
                fechaCita ? excelDateToDatestring(fechaCita) : null, observacion]
            );
            actualizado++;
          }
        }
      }
      console.log(`✅ Datos cargados desde Power Automate. Total: ${rows.length} registros.`);

    } catch (err: any) {
      console.error('❌ Error al ejecutar el refresh de abasto:', err);
      console.log('🔁 Procesando fila:', fila);
    } finally {
      if (client) {
        client.release();
      }
      return actualizado;
    }
  }

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

export default CitasService;
