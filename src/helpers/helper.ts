
export function excelDateToJSDate(serial: number): Date {
    try {
        const daysSince1900 = serial - 1; // Ajuste porque el 1 de enero de 1900 es el día 1
        const date = new Date(1900, 0, daysSince1900);
        return date;
    } catch (error) {
        console.error('Error al convertir la fecha:', error);
        console.error('Serial:', serial);
        throw error;
    }
}

/**
 * Convierte una fecha en formato de serial de Excel a un string en formato ISO (YYYY-MM-DD).
 * Si la entrada es null o ya se encuentra en formato ISO, se devuelve la entrada sin cambios.
 * @param serial Fecha en formato de serial de Excel
 * @returns string | null
 */
export function excelDateToDatestring(serial: string | null): string | null {
    try {
        if (!serial) return null;
        if ((serial + '').includes('-') || (serial + '').includes('/')) return serial;
        // console.log('invocando excelDateToJSDate', serial);
        const jsDate = excelDateToJSDate(+serial);
        // console.log('jsDate', jsDate);

        const day = String(jsDate.getDate()).padStart(2, '0');
        const month = String(jsDate.getMonth() + 1).padStart(2, '0'); // Los meses en JavaScript son 0-indexados
        const year = jsDate.getFullYear();

        const dateString = `${year}-${month}-${day}`;
        // console.log('dateString', dateString);
        // console.log('es fecha?', (dateString as any) instanceof Date);
        return dateString;
    } catch (error) {
        console.error('Error al convertir la fecha (excelDateToDatestring):', error);
        console.error('Serial:', serial);
        throw error;
    }
}

/**
 * Convierte una cadena con fechas separadas por guiones o slashes a una cadena con fechas en formato ISO (yyyy-mm-dd)
 * separadas por slashes.
 * @example '01-01-2022 02-02-2023' -> '2022-01-01/2023-02-02'
 * @example '01/01/2022' -> '2022-01-01'
 * @example '01-02-03' -> null (no cumple el formato)
 * @example '01-02-2023 03-04-2024' -> null (no cumple el formato)
 * @example null -> null
 * @param input Cadena con fechas separadas por guiones o slashes
 * @returns string | null
 */
export function formatFechaMultiple(input: string | null | undefined): string | null {
    if (!input) return null;
  
    // Elimina espacios en blanco
    const cleaned = input.toString().replace(/\s+/g, '');
  
    // Divide por guiones o slashes
    const partes = cleaned.split(/[-/]/);
  
    const fechas: string[] = [];
    for (let i = 0; i < partes.length; i += 3) {
      if (partes[i] && partes[i + 1] && partes[i + 2]) {
        const dia = partes[i];
        const mes = partes[i + 1];
        const anio = partes[i + 2];
  
        if (/^\d{2}$/.test(dia) && /^\d{2}$/.test(mes) && /^\d{4}$/.test(anio)) {
          fechas.push(`${anio}-${mes}-${dia}`); // yyyy-mm-dd
        }
      }
    }
  
    return fechas.length > 0 ? fechas.join('/') : null;
  }
  