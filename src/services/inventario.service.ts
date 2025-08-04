// src/services/inventario.service.ts
import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';
import { PowerAutomateResponse } from '../models/powerAutomateResponse.model';
import { AzureAbastoEndpoint } from '../enums/AzureEndpoint.enum';

dotenv.config();

class InventarioService {
    /**
     * Obtiene inventario desde Power Automate según el endpoint especificado
     * @param endpoint - El endpoint definido en AzureEndpoint.enum.ts
     * @returns 
     */
    async obtenerInventarioDePowerAutomate64(endpoint: AzureAbastoEndpoint = AzureAbastoEndpoint.INVENTARIO): Promise<string> {
        console.log(`🔁 Obteniendo inventario desde Azure: ${endpoint}`);        
        try {
             const url = process.env[endpoint] as string;
            if (!url) {
                console.error(`❌ La variable de entorno "${endpoint}" no está definida.`);
                return null;
            }

             // Hacer POST al flujo de Power Automate
            const response: AxiosResponse<PowerAutomateResponse> = await axios.post(
                url,
                { claveSecreta: process.env.AZURE_PAYLOAD_SECRET },
                { headers: { 'Content-Type': 'application/json' } }
            );

            if (!response.data?.archivo) {
                console.error('❌ No se recibió el archivo base64 en la respuesta.');
                return;
            }

            console.log(`✅ Inventario ${endpoint} en Base64 cargado desde Power Automate.`);
            return response.data.archivo;

        } catch (err: any) {
            console.error('❌ Error al obtener informacion desde Power Automate', err);            
        }
        return null;
    }

}


export default InventarioService;