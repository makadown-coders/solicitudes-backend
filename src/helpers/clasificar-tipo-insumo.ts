export type TipoInsumo = 'MED' | 'MC' | null;

export function clasificarTipoInsumo(claveInput: unknown, categoria: unknown): TipoInsumo {
  const clave = String(claveInput ?? '').trim().toUpperCase();
  const prefijo = clave.split('.')[0];
  if (['060', '070', '080', '160', '180', '200', '204', '254', '311', '531', '537'].includes(prefijo)) {
    return 'MC';
  }
  const categoriaNormalizada = String(categoria ?? '').trim().toUpperCase();
  if (categoriaNormalizada.includes('MEDICAMENTO')) return 'MED';
  if (categoriaNormalizada.includes('MATERIAL') && categoriaNormalizada.includes('CURACI')) return 'MC';
  if (prefijo === '010') return 'MED';
  return null;
}
