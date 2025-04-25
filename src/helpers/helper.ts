
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
        console.log('invocando excelDateToJSDate', serial);
        const jsDate = excelDateToJSDate(+serial);
        console.log('jsDate', jsDate);

        const day = String(jsDate.getDate()).padStart(2, '0');
        const month = String(jsDate.getMonth() + 1).padStart(2, '0'); // Los meses en JavaScript son 0-indexados
        const year = jsDate.getFullYear();

        const dateString = `${year}-${month}-${day}`;
        console.log('dateString', dateString);
        console.log('es fecha?', (dateString as any) instanceof Date);
        return dateString;
    } catch (error) {
        console.error('Error al convertir la fecha (excelDateToDatestring):', error);
        console.error('Serial:', serial);
        throw error;
    }
}
