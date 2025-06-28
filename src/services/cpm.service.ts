import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import { PowerAutomateResponse } from '../models/PowerAutomateResponse';

dotenv.config();

class CPMService {
    async obtenerCpmDePowerAutomate64(): Promise<string> {
        console.log('🔁 Obteniendo CPMs con Power Automate');
        
        let fila: any = null;
        try {
            // Hacer POST al flujo de Power Automate
            const response: AxiosResponse<PowerAutomateResponse> = await axios.post(
                process.env.AZURE_CPM_URL as string,
                { claveSecreta: process.env.AZURE_PAYLOAD_SECRET },
                { headers: { 'Content-Type': 'application/json' } }
            );

            if (!response.data?.archivo) {
                console.error('❌ No se recibió el archivo base64 en la respuesta.');
                return;
            }

            console.log(`✅ Cpm en Base64 cargado desde Power Automate.`);
            return response.data.archivo;

        } catch (err: any) {
            console.error('❌ Error al ejecutar el seed de citas:', err);
            console.log('🔁 Procesando fila:', fila);
        }
        return null;
    }
}


export default CPMService;