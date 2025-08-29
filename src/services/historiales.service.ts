// src/services/historiales.service.ts
import axios from 'axios';
import { SolicitudArchivo } from '../models/solicitudArchivo.model';
import { SolicitudEncuestaPiloto } from '../models/solicitudEncuestaPiloto';

const FLOW_URL = process.env.AZURE_SP_ABASTO_URL!;
const ENCUESTA_URL = process.env.AZURE_SP_ENCUESTA_URL!;

class HistorialesService {

    /**
     * Envia copia de solicitud de insumos a SharePoint y genera registro 
     * en la "base de datos" mediante Power Automate
     * @param data 
     * @returns 
     */
    async enviarArchivoASharePoint(data: SolicitudArchivo) {
        const response = await axios.post(FLOW_URL, data, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;
    }
    
    async enviarEncuestaASharePoint(data: SolicitudEncuestaPiloto) {
        const response = await axios.post(ENCUESTA_URL, data, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;
    }


}

export default HistorialesService;