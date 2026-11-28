export const CAMPOS_TECNICOS = ['serial', 'marca', 'modelo', 'ip', 'conexion', 'observaciones'] as const;
type CampoTecnico = typeof CAMPOS_TECNICOS[number];
type ValoresTecnicos = Partial<Record<CampoTecnico, string | null>>;

export class EdicionTecnicaInvalida extends Error {}
export class EdicionTecnicaDesactualizada extends Error {
  constructor(readonly campos: CampoTecnico[]) {
    super('Otro usuario modificó los datos técnicos del equipo. Consulte los valores actuales.');
  }
}

export function prepararEdicionTecnica(valores: ValoresTecnicos, clearFields: unknown, originales: unknown) {
  const esCampo = (campo: unknown): campo is CampoTecnico =>
    CAMPOS_TECNICOS.some((permitido) => permitido === campo);
  if (clearFields !== undefined && (!Array.isArray(clearFields) || !clearFields.every(esCampo))) {
    throw new EdicionTecnicaInvalida('clear_fields debe contener solo nombres de campos técnicos.');
  }
  const limpiar = new Set<CampoTecnico>(clearFields as CampoTecnico[] | undefined);
  const cambios = CAMPOS_TECNICOS.flatMap<{ campo: CampoTecnico; valor: string | null }>((campo) => {
    const valor = valores[campo];
    if (limpiar.has(campo)) {
      if (valor != null) throw new EdicionTecnicaInvalida(`El campo ${campo} no puede actualizarse y limpiarse a la vez.`);
      return [{ campo, valor: null }];
    }
    return valor == null ? [] : [{ campo, valor }];
  });
  if (originales === undefined) return { cambios, esperados: [] };
  if (!originales || typeof originales !== 'object' || Array.isArray(originales)) {
    throw new EdicionTecnicaInvalida('expected_values debe ser un objeto de valores originales.');
  }
  const claves = Object.keys(originales);
  const valoresOriginales = originales as Record<string, unknown>;
  if (claves.length !== cambios.length || claves.some((campo) =>
    !cambios.some((cambio) => cambio.campo === campo) ||
    (valoresOriginales[campo] !== null && typeof valoresOriginales[campo] !== 'string')
  )) {
    throw new EdicionTecnicaInvalida('expected_values debe incluir el valor original de cada campo modificado.');
  }
  const esperados = cambios.map(({ campo }) => ({ campo, valor: valoresOriginales[campo] as string | null }));
  return { cambios, esperados };
}
