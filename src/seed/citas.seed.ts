// src/seed/citas.seed.ts
import XLSX from 'xlsx';
import { Pool, PoolClient } from 'pg';
import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import { excelDateToDatestring, formatFechaMultiple } from '../helpers/helper';
import { CitaRow } from '../models/CitaRow';
import { PowerAutomateResponse } from '../models/PowerAutomateResponse';

dotenv.config();

const pool = new Pool({
    user: process.env.POSTGRES_USERNAME,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DATABASE,
    password: process.env.POSTGRES_PASSWORD,
    port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432,
});

export async function seedCitasSiNecesario(): Promise<void> {
    let client: PoolClient | null = null;
    let fila: any = null;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT COUNT(*) FROM citas');
        const count = parseInt(result.rows[0].count, 10);

        if (count === 0) {
            console.log('⚠️ Tabla [citas] vacía, solicitando datos al flujo Power Automate...');

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
                const fechaCita = fila[27];
                // columnas 28 y 29 no se usan en el excel        
                const observacion = fila[30];

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
                            (fechaRecepcionAlmacen+'').replace('NaN-NaN-NaN', '') : null,
                        numeroRemision,
                        lote,
                        caducidad ?
                            (caducidad+'').replace('NaN-NaN-NaN', '') : null,
                        estatus,
                        folioAbasto,
                        almacenHospital,
                        evidencia,
                        carga ?? null,
                        fechaCita ? excelDateToDatestring(fechaCita) : null,
                        observacion]
                );
            }

            console.log(`✅ Datos cargados desde Power Automate. Total: ${rows.length} registros.`);
        } else {
            console.log(`✔️ Tabla [citas] ya tiene ${count} registros. Seed omitido.`);
        }
    } catch (err: any) {
        console.error('❌ Error al ejecutar el seed de citas:', err);
        console.log('🔁 Procesando fila:', fila);
    } finally {
        if (client) {
            client.release();
        }
    }
}