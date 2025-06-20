import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import { PowerAutomateResponse } from '../models/PowerAutomateResponse';

dotenv.config();

class InventarioService {
    async obtenerInventarioDePowerAutomate64(): Promise<string> {
        console.log('🔁 Obteniendo inventario con Power Automate');
        
        let fila: any = null;
        try {
            // Hacer POST al flujo de Power Automate
            const response: AxiosResponse<PowerAutomateResponse> = await axios.post(
                process.env.AZURE_INV_URL as string, // Aseguramos que AZURE_INV_URL no sea undefined
                { claveSecreta: process.env.AZURE_PAYLOAD_SECRET },
                { headers: { 'Content-Type': 'application/json' } }
            );

            if (!response.data?.archivo) {
                console.error('❌ No se recibió el archivo base64 en la respuesta.');
                return;
            }

            console.log(`✅ Inventario en Base64 cargado desde Power Automate.`);
            return response.data.archivo;

        } catch (err: any) {
            console.error('❌ Error al ejecutar el seed de citas:', err);
            console.log('🔁 Procesando fila:', fila);
        }
        return null;
    }
}


export default InventarioService;