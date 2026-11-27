import type { PoolClient } from 'pg';
import { pool } from '../db/pool';

export class ConflictoAsignacion extends Error {
  constructor(readonly codigo: 'ASIGNACION_DESACTUALIZADA' | 'UNIDAD_INCONSISTENTE', mensaje: string) {
    super(mensaje);
  }
}

export async function cerrarAsignacionVigente(
  client: PoolClient, dispositivoId: number, unidadActual: number, esperada?: number | null,
): Promise<void> {
  const { rows: [vigente] } = await client.query<{ id: number; unidad_medica_id: number | null }>(
    'SELECT id, unidad_medica_id FROM asignacion_dispositivo WHERE dispositivo_id = $1 AND fecha_retiro IS NULL',
    [dispositivoId],
  );
  if (esperada !== undefined && esperada !== (vigente?.id ?? null)) {
    throw new ConflictoAsignacion('ASIGNACION_DESACTUALIZADA', 'Otro usuario modificó la asignación del equipo.');
  }
  if (!vigente) return;
  if (vigente.unidad_medica_id != null && vigente.unidad_medica_id !== unidadActual) {
    throw new ConflictoAsignacion('UNIDAD_INCONSISTENTE', 'La unidad de la asignación vigente no coincide con la del equipo.');
  }
  await client.query(
    'UPDATE asignacion_dispositivo SET unidad_medica_id = COALESCE(unidad_medica_id, $2), fecha_retiro = statement_timestamp() WHERE id = $1',
    [vigente.id, unidadActual],
  );
}

export async function conDispositivoBloqueado<T>(
  dispositivoId: number,
  movimiento: (client: PoolClient, unidadActual: number) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let rollbackFailed = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const { rows: [dispositivo] } = await client.query<{ unidad_medica_id: number }>(
      'SELECT unidad_medica_id FROM dispositivo WHERE id = $1 FOR UPDATE', [dispositivoId],
    );
    if (!dispositivo) throw new Error('NOT_FOUND');
    const result = await movimiento(client, dispositivo.unidad_medica_id);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      rollbackFailed = true;
      console.error('Error al ejecutar ROLLBACK del movimiento de asignación:', rollbackError);
    }
    throw error;
  } finally {
    client.release(rollbackFailed);
  }
}
