// src/services/trazabilidad.service.ts
import { MovimientoTrazabilidadDTO } from '../models/trazabilidad.dto';
import { pool } from '../db/pool';

class TrazabilidadService {
    private async esCluesAlmacen(cluesimb: string): Promise<boolean> {
        const { rows } = await pool.query(
            `SELECT tu.nombre_tipo
         FROM unidad_medica um
         JOIN tipo_unidad tu ON um.tipo_unidad_id = tu.id
        WHERE um.cluesimb = $1
        LIMIT 1`,
            [cluesimb]
        );
        return (rows[0]?.nombre_tipo || '').toUpperCase() === 'ALMACENES';
    }


    private async obtenerFactorConversion(clave: string, cluesimb: string):
        Promise<{ aplicar: boolean; factor: number }> {
        const { rows } = await pool.query(
            ` SELECT 
        f.en_dispensacion as en_dispensacion,
        COALESCE(f.cantidad_fc, 1) AS cantidad_fc
      FROM factores_conversion f
      JOIN unidad_medica um ON um.cluesimb  = f.cluesimb
      WHERE f.clave = $1
        AND um.cluesimb = $2
      LIMIT 1`,
            [clave, cluesimb]
        );
        if (!rows.length) return { aplicar: false, factor: 1 };
        const aplicar = Number(rows[0].en_dispensacion) === 1;
        const factor = Number(rows[0].cantidad_fc) || 1;
        return { aplicar, factor };
    }

    async obtenerMovimientosPorClaveYClues(clave: string, cluesimb: string): Promise<MovimientoTrazabilidadDTO[]> {
        let currentQuery = '';
        try {
            const resultados: any[] = [];

            // ¿el modal es de ALMACÉN?
            const esModalDeAlmacen = await this.esCluesAlmacen(cluesimb);
            // factor de conversión de la clave
            const { aplicar: aplicarFC, factor } = await this.obtenerFactorConversion(clave, cluesimb);

            // 🟩 ENTRADAS
            currentQuery = `
        SELECT 
          e.fecha, e.clave_cnis, e.descripcion, e.cantidad,
          e.proveedor, e.folio, e.lote, e.fecha_caducidad, e.observaciones,
          um.cluesimb, um.nombre AS nombre_unidad, uma.alias_sas AS alias_unidad,
          -- heurística para detectar si PROVIENE de almacén
          (CASE WHEN COALESCE(e.proveedor,'') ILIKE '%ALMACEN%' THEN TRUE ELSE FALSE END) AS origen_es_almacen
        FROM entrada e
        JOIN unidad_medica_alias uma ON e.unidad_destino_id = uma.id
        JOIN unidad_medica um ON uma.unidad_medica_id = um.id
        WHERE e.clave_cnis = $1 AND um.cluesimb = $2
      `;
            const entradas = await pool.query(currentQuery, [clave, cluesimb]);
            resultados.push(
                ...entradas.rows.map((row) => ({
                    tipo_movimiento: 'entrada',
                    fecha: row.fecha,
                    clave_cnis: row.clave_cnis,
                    descripcion: row.descripcion,
                    cantidad: Number(row.cantidad),
                    proveedor: row.proveedor,
                    folio: row.folio,
                    lote: row.lote,
                    fecha_caducidad: row.fecha_caducidad,
                    observaciones: row.observaciones,
                    cluesimb: row.cluesimb,
                    nombre_unidad: row.nombre_unidad,
                    alias_unidad: row.alias_unidad,
                    _origen_es_almacen: row.origen_es_almacen === true,
                }))
            );

            // 🔁 TRASPASOS
            currentQuery = `
        SELECT 
          t.fecha_recepcion AS fecha,
          t.clave_cnis,
          t.descripcion,
          t.cantidad,
          COALESCE(
            um_origen.cluesimb || ' — ' || a1.alias_sas,
            um_origen.nombre,
            t.unidad_origen_texto
          ) AS proveedor,
          t.folio,
          t.lote,
          t.fecha_caducidad,
          um_destino.cluesimb,
          um_destino.nombre AS nombre_unidad,
          a2.alias_sas     AS alias_unidad,
          -- flag: el ORIGEN es un ALMACÉN (fiable por join)
          (CASE WHEN tu_origen.nombre_tipo = 'ALMACENES' THEN TRUE ELSE FALSE END) AS origen_es_almacen
        FROM traspaso t
        LEFT JOIN unidad_medica_alias a1 ON t.unidad_origen_id = a1.id
        LEFT JOIN unidad_medica um_origen ON a1.unidad_medica_id = um_origen.id
        LEFT JOIN tipo_unidad tu_origen ON um_origen.tipo_unidad_id = tu_origen.id
        JOIN unidad_medica_alias a2 ON t.unidad_destino_id = a2.id
        JOIN unidad_medica um_destino ON a2.unidad_medica_id = um_destino.id
        WHERE t.clave_cnis = $1
          AND um_destino.cluesimb = $2
        ORDER BY t.fecha_recepcion DESC
      `;
            const traspasos = await pool.query(currentQuery, [clave, cluesimb]);
            resultados.push(
                ...traspasos.rows.map((row) => ({
                    tipo_movimiento: 'traspaso',
                    fecha: row.fecha,
                    clave_cnis: row.clave_cnis,
                    descripcion: row.descripcion,
                    cantidad: Number(row.cantidad),
                    proveedor: row.proveedor,
                    folio: row.folio,
                    lote: row.lote,
                    fecha_caducidad: row.fecha_caducidad,
                    observaciones: null,
                    cluesimb: row.cluesimb,
                    nombre_unidad: row.nombre_unidad,
                    alias_unidad: row.alias_unidad,
                    _origen_es_almacen: row.origen_es_almacen === true,
                }))
            );

            // 📤 SALIDAS
            currentQuery = `
        SELECT
          s.fecha_entregado AS fecha,
          s.clave_cnis,
          s.descripcion,
          s.cantidad,
          COALESCE(
            um_destino.cluesimb || ' — ' || a2.alias_sas,
            um_destino.nombre,
            s.unidad_destino_texto
          ) AS proveedor,
          s.folio,
          s.lote,
          s.fecha_caducidad,
          um_origen.cluesimb,
          um_origen.nombre AS nombre_unidad,
          a1.alias_sas     AS alias_unidad
        FROM salida s
        LEFT JOIN unidad_medica_alias a1 ON s.unidad_origen_id = a1.id
        LEFT JOIN unidad_medica um_origen ON a1.unidad_medica_id = um_origen.id
        LEFT JOIN unidad_medica_alias a2 ON s.unidad_destino_id = a2.id
        LEFT JOIN unidad_medica um_destino ON a2.unidad_medica_id = um_destino.id
        WHERE s.clave_cnis = $1
          AND COALESCE(um_origen.cluesimb, s.unidad_origen_texto) = $2
        ORDER BY s.fecha_entregado DESC
      `;
            const salidas = await pool.query(currentQuery, [clave, cluesimb]);
            resultados.push(
                ...salidas.rows.map((row) => ({
                    tipo_movimiento: 'salida',
                    fecha: row.fecha,
                    clave_cnis: row.clave_cnis,
                    descripcion: row.descripcion,
                    cantidad: Number(row.cantidad),
                    proveedor: row.proveedor,
                    folio: row.folio,
                    lote: row.lote,
                    fecha_caducidad: row.fecha_caducidad,
                    observaciones: null,
                    cluesimb: row.cluesimb,
                    nombre_unidad: row.nombre_unidad,
                    alias_unidad: row.alias_unidad,
                }))
            );

            // 🧊 INVENTARIO INICIAL (no aplica factor)
            currentQuery = `
        SELECT 
            make_date(EXTRACT(YEAR FROM now())::int, 1, 1) AS fecha,
            ii.clave_cnis,
            COALESCE(ii.descripcion, 'Inventario inicial') AS descripcion,
            ii.cantidad,
            CASE ii.tipo
                WHEN 'SI' THEN 'SOBRANTE INICIAL'
                WHEN 'FHI' THEN 'FALTANTE INICIAL'
                WHEN 'FI' THEN 'FALTANTE INICIAL'
                WHEN 'II' THEN 'INVENTARIO INICIAL'
                ELSE 'Desconocido'
            END AS proveedor,
            CASE ii.tipo
                WHEN 'SI' THEN 'entrada'
                WHEN 'FHI' THEN 'faltante'
                WHEN 'FI' THEN 'faltante'
                WHEN 'II' THEN 'entrada'
                ELSE 'Desconocido'
            END AS tipo_movimiento,
            NULL::text AS folio,
            ii.lote,
            ii.fecha_caducidad,
            um.cluesimb,
            um.nombre AS nombre_unidad,
            uma.alias_sas AS alias_unidad
        FROM inventario_inicial ii
        JOIN unidad_medica_alias uma ON ii.unidad_id = uma.id
        JOIN unidad_medica um ON uma.unidad_medica_id = um.id
        WHERE ii.clave_cnis = $1
          AND um.cluesimb  = $2
      `;

            // ✅ APLICAR FACTOR (solo unidad, y solo entradas/traspasos)
            let final = resultados;
            if (!esModalDeAlmacen && aplicarFC && factor !== 1) {
                final = resultados.map((m) => {
                    const esEntradaOTR = m.tipo_movimiento === 'entrada' || m.tipo_movimiento === 'traspaso';
                    // TODO: la heurística de "viene de almacén" es solo para entradas o traspasos, 
                    // pero no es 100% confiable... idealmente debería venir un flag desde el query 
                    // donde la unidad que envia tampoco aplique factor de conversion, pero por ahora se queda asi:
                    const vieneDeAlmacen =
                         m._origen_es_almacen === true ||
                         (m.tipo_movimiento === 'entrada' && (m.proveedor || '').toUpperCase().includes('ALMACEN'));
                    if (esEntradaOTR && vieneDeAlmacen) {
                        return { ...m, cantidad: Number(m.cantidad) * factor };
                    }
                    return m;
                });
            }
            // inventario inicial no maneja factor
            const inventarioInicial = await pool.query(currentQuery, [clave, cluesimb]);
            final.push(
                ...inventarioInicial.rows.map((row) => ({
                    tipo_movimiento: row.tipo_movimiento,
                    fecha: row.fecha,
                    clave_cnis: row.clave_cnis,
                    descripcion: row.descripcion,
                    cantidad: Number(row.cantidad),
                    proveedor: row.proveedor,
                    folio: row.folio,
                    lote: row.lote,
                    fecha_caducidad: row.fecha_caducidad,
                    observaciones: null,
                    cluesimb: row.cluesimb,
                    nombre_unidad: row.nombre_unidad,
                    alias_unidad: row.alias_unidad,
                    _origen_es_almacen: false,
                }))
            );

            // limpiar flags internos y ordenar asc
            final.forEach((m: any) => delete m._origen_es_almacen);
            final.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
            return final;

        } catch (error) {
            console.error('Error al obtener los movimientos de trazabilidad:', error);
            console.error('Query:', currentQuery);
            throw error;
        }
    }

    /**
     * Version anterior de obtenerMovimientosPorClaveYClues
     * @param clave 
     * @param cluesimb 
     * @returns 
     */
    async obtenerMovimientosPorClaveYCluesv1(clave: string, cluesimb: string): Promise<MovimientoTrazabilidadDTO[]> {
        let currentQuery = '';
        try {
            const resultados: MovimientoTrazabilidadDTO[] = [];

            currentQuery = `SELECT 
          e.fecha, e.clave_cnis, e.descripcion, e.cantidad,
          e.proveedor, e.folio, e.lote, e.fecha_caducidad, e.observaciones,
          um.cluesimb, um.nombre AS nombre_unidad, uma.alias_sas AS alias_unidad
         FROM entrada e
         JOIN unidad_medica_alias uma ON e.unidad_destino_id = uma.id
         JOIN unidad_medica um ON uma.unidad_medica_id = um.id
       WHERE e.clave_cnis = '${clave}' AND um.cluesimb = '${cluesimb}'`;

            // 🟩 Entradas
            const entradas = await pool.query(
                `SELECT 
          e.fecha, e.clave_cnis, e.descripcion, e.cantidad,
          e.proveedor, e.folio, e.lote, e.fecha_caducidad, e.observaciones,
          um.cluesimb, um.nombre AS nombre_unidad, uma.alias_sas AS alias_unidad
         FROM entrada e
         JOIN unidad_medica_alias uma ON e.unidad_destino_id = uma.id
         JOIN unidad_medica um ON uma.unidad_medica_id = um.id
         WHERE e.clave_cnis = $1 AND um.cluesimb = $2`,
                [clave, cluesimb]
            );

            resultados.push(
                ...entradas.rows.map(row => ({ tipo_movimiento: 'entrada', ...row }))
            );

            currentQuery = `SELECT 
                        t.fecha_recepcion AS fecha,
                        t.clave_cnis,
                        t.descripcion,
                        t.cantidad,
                        COALESCE(
                            um_origen.cluesimb || ' — ' || a1.alias_sas,
                            um_origen.nombre,
                            t.unidad_origen_texto
                        ) AS proveedor,
                        t.folio,
                        t.lote,
                        t.fecha_caducidad,
                        um_destino.cluesimb,
                        um_destino.nombre AS nombre_unidad,
                        a2.alias_sas     AS alias_unidad
                        FROM traspaso t
                        LEFT JOIN unidad_medica_alias a1 ON t.unidad_origen_id = a1.id
                        LEFT JOIN unidad_medica um_origen ON a1.unidad_medica_id = um_origen.id
                        JOIN unidad_medica_alias a2 ON t.unidad_destino_id = a2.id
                        JOIN unidad_medica um_destino ON a2.unidad_medica_id = um_destino.id
                        WHERE t.clave_cnis = '${clave}' AND um_destino.cluesimb = '${cluesimb}'`;

            // 🔁 Traspasos
            const traspasos = await pool.query(
                `SELECT 
                        t.fecha_recepcion AS fecha,
                        t.clave_cnis,
                        t.descripcion,
                        t.cantidad,
                        COALESCE(
                            um_origen.cluesimb || ' — ' || a1.alias_sas,
                            um_origen.nombre,
                            t.unidad_origen_texto
                        ) AS proveedor,
                        t.folio,
                        t.lote,
                        t.fecha_caducidad,
                        um_destino.cluesimb,
                        um_destino.nombre AS nombre_unidad,
                        a2.alias_sas     AS alias_unidad
                        FROM traspaso t
                        LEFT JOIN unidad_medica_alias a1 ON t.unidad_origen_id = a1.id
                        LEFT JOIN unidad_medica um_origen ON a1.unidad_medica_id = um_origen.id
                        JOIN unidad_medica_alias a2 ON t.unidad_destino_id = a2.id
                        JOIN unidad_medica um_destino ON a2.unidad_medica_id = um_destino.id
                        WHERE t.clave_cnis = $1
                        AND um_destino.cluesimb = $2
                        ORDER BY t.fecha_recepcion DESC`,
                [clave, cluesimb]
            );

            resultados.push(
                ...traspasos.rows.map(row => ({ tipo_movimiento: 'traspaso', ...row }))
            );

            currentQuery = `SELECT
            s.fecha_entregado AS fecha,
            s.clave_cnis,
            s.descripcion,
            s.cantidad,            
            COALESCE(
                um_destino.cluesimb || ' — ' || a2.alias_sas,
                um_destino.nombre,
                s.unidad_destino_texto
            ) AS proveedor,
            s.folio,
            s.lote,
            s.fecha_caducidad,            
            um_origen.cluesimb,
            um_origen.nombre AS nombre_unidad,
            a1.alias_sas     AS alias_unidad
            FROM salida s
            LEFT JOIN unidad_medica_alias a1 ON s.unidad_origen_id = a1.id
            LEFT JOIN unidad_medica um_origen ON a1.unidad_medica_id = um_origen.id
            LEFT JOIN unidad_medica_alias a2 ON s.unidad_destino_id = a2.id
            LEFT JOIN unidad_medica um_destino ON a2.unidad_medica_id = um_destino.id
       WHERE s.clave_cnis = '${clave}' AND COALESCE(um.cluesimb, s.unidad_destino_texto) = '${cluesimb}'`;

            // 📤 Salidas
            const salidas = await pool.query(
                `SELECT
                    s.fecha_entregado AS fecha,
                    s.clave_cnis,
                    s.descripcion,
                    s.cantidad,
                    COALESCE(
                        um_destino.cluesimb || ' — ' || a2.alias_sas,
                        um_destino.nombre,
                        s.unidad_destino_texto
                    ) AS proveedor,
                    s.folio,
                    s.lote,
                    s.fecha_caducidad,
                    um_origen.cluesimb,
                    um_origen.nombre AS nombre_unidad,
                    a1.alias_sas     AS alias_unidad
                    FROM salida s
                    LEFT JOIN unidad_medica_alias a1 ON s.unidad_origen_id = a1.id
                    LEFT JOIN unidad_medica um_origen ON a1.unidad_medica_id = um_origen.id
                    LEFT JOIN unidad_medica_alias a2 ON s.unidad_destino_id = a2.id
                    LEFT JOIN unidad_medica um_destino ON a2.unidad_medica_id = um_destino.id
                    WHERE s.clave_cnis = $1
                    AND COALESCE(um_origen.cluesimb, s.unidad_origen_texto) = $2
                    ORDER BY s.fecha_entregado DESC`,
                [clave, cluesimb]
            );

            resultados.push(
                ...salidas.rows.map(row => ({ tipo_movimiento: 'salida', ...row }))
            );

            const inventarioInicial = await pool.query(
                `SELECT 
      make_date(EXTRACT(YEAR FROM now())::int, 1, 1) AS fecha,
      ii.clave_cnis,
      COALESCE(ii.descripcion, 'Inventario inicial') AS descripcion,
      ii.cantidad,
      NULL::text AS unidad,
      'INVENTARIO INICIAL'::text AS proveedor,
      NULL::text AS folio,
      ii.lote,
      ii.fecha_caducidad,
      NULL::text AS observaciones,
      um.cluesimb,
      um.nombre AS nombre_unidad,
      uma.alias_sas AS alias_unidad
    FROM inventario_inicial ii
    JOIN unidad_medica_alias uma ON ii.unidad_id = uma.id
    JOIN unidad_medica um       ON uma.unidad_medica_id = um.id
    WHERE ii.clave_cnis = $1
      AND um.cluesimb = $2`,
                [clave, cluesimb]
            );

            resultados.push(
                ...inventarioInicial.rows.map(row => ({ tipo_movimiento: 'entrada', ...row }))
            );

            return resultados.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        } catch (error) {
            console.error('Error al obtener los movimientos de trazabilidad:', error);
            console.error('Query:', currentQuery);
            throw error;
        }
    }

    /* Crear un metodo para obtener TODOS los factores de conversion con en_dispensacion = 1, es decir:
    SELECT clave, en_dispensacion, cantidad_fc, cluesimb
    FROM public.factores_conversion
    where en_dispensacion = 1;
    NOTA: ESTE METODO SERA LEGACY, YA QUE NO QUEREMOS QUE REGRESE UN MAP!!!
    */
    async obtenerTodosFactoresConversion(): Promise<Map<string, { cluesimb: string; factor: number }>> {
        const { rows } = await pool.query(
            ` SELECT 
        f.clave,
        f.en_dispensacion as en_dispensacion,
        COALESCE(f.cantidad_fc, 1) AS cantidad_fc,
        um.cluesimb
      FROM factores_conversion f
      JOIN unidad_medica um ON um.cluesimb  = f.cluesimb
      WHERE f.en_dispensacion = 1`
        );
        return rows.reduce((map, row) => {
            map.set(row.clave, { cluesimb: row.cluesimb, factor: Number(row.cantidad_fc) });
            return map;
        }, new Map<string, { cluesimb: string; factor: number }>());
    }

    /* Crear un metodo para obtener TODOS los factores de conversion con en_dispensacion = 1, es decir:
    SELECT clave, en_dispensacion, cantidad_fc, cluesimb
    FROM public.factores_conversion
    where en_dispensacion = 1;
    */
    async obtenerTodosFactoresConversion_v2(): Promise<{ clave: string, cluesimb: string, factor: number }[]> {
        const { rows } = await pool.query(
            ` SELECT 
        f.clave,
        f.en_dispensacion as en_dispensacion,
        COALESCE(f.cantidad_fc, 1) AS cantidad_fc,
        um.cluesimb
      FROM factores_conversion f
      JOIN unidad_medica um ON um.cluesimb  = f.cluesimb
      WHERE f.en_dispensacion = 1`
        );
        /* Regresar rows de { clave: string, cluesimb: string, factor: number } */
        return rows.map(row => ({ clave: row.clave, cluesimb: row.cluesimb, factor: Number(row.cantidad_fc) }));
    }
}

export default TrazabilidadService;
