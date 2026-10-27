import { pool } from '../db/pool';
import { ContextoCapturaPrimerNivel } from '../models/solicitudes/primer-nivel/ContextoCapturaPrimerNivel';

export default class SolicitudesPrimerNivelDestinatariosService {
  obtenerCodigosNotificacion(contextos: ContextoCapturaPrimerNivel[]): string[] {
    const codigos = new Set<string>();
    for (const contexto of contextos) {
      if (contexto.origenCaptura === 'APS') {
        codigos.add('APS');
      } else if (contexto.origenCaptura === 'PROGRAMA_PREVENTIVO') {
        const codigo = String(contexto.referenciaCaptura ?? '').trim().toUpperCase();
        if (codigo) codigos.add(codigo);
      }
    }
    return [...codigos].sort((a, b) => a.localeCompare(b));
  }

  async obtenerCorreosDestinatarios(codigosInput: string[]): Promise<string[]> {
    const codigos = [...new Set(codigosInput
      .map(codigo => String(codigo ?? '').trim().toUpperCase())
      .filter(Boolean))];
    if (!codigos.length) return [];

    const { rows } = await pool.query<{ correo: string }>(`
      SELECT DISTINCT lower(trim(correo)) AS correo
      FROM public.solicitud_primer_nivel_destinatario
      WHERE activo = true
        AND UPPER(TRIM(codigo)) = ANY($1::text[])
        AND NULLIF(trim(correo), '') IS NOT NULL
      ORDER BY correo
    `, [codigos]);
    return [...new Set(rows
      .map(row => String(row.correo ?? '').trim().toLowerCase())
      .filter(Boolean))];
  }
}
