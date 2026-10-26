/**
 * Configuración provisional para el formato operativo de Abasto.
 * Migrar posteriormente a catálogo/base de datos si se formaliza el proceso.
 *
 * CLUES es la única llave de asignación. El orden de los arreglos define el
 * orden de las columnas dentro de cada ruta.
 */
export const JURISDICCIONES_DISTRIBUCION = ['ENSENADA', 'MEXICALI', 'TIJUANA'] as const;
export type JurisdiccionDistribucion = typeof JURISDICCIONES_DISTRIBUCION[number];

type RutaProvisional = {
  jurisdiccion: JurisdiccionDistribucion;
  ruta: number;
  clues: readonly string[];
};

export const RUTAS_PRIMER_NIVEL_PROVISIONALES: readonly RutaProvisional[] = [
  { jurisdiccion: 'ENSENADA', ruta: 1, clues: ['BCIMB001434', 'BCIMB000285', 'BCIMB001270', 'BCIMB000150', 'BCIMB000186'] },
  { jurisdiccion: 'ENSENADA', ruta: 2, clues: ['BCIMB000174', 'BCIMB000220', 'BCIMB000145', 'BCIMB000331'] },
  { jurisdiccion: 'ENSENADA', ruta: 3, clues: ['BCIMB000191', 'BCIMB000302', 'BCIMB000314'] },
  { jurisdiccion: 'ENSENADA', ruta: 4, clues: ['BCIMB000232', 'BCIMB000203', 'BCIMB000215', 'BCIMB000290', 'BCIMB000326', 'BCIMB000343', 'BCIMB001265', 'BCIMB001306', 'BCIMB001480', 'BCIMB001492'] },
  { jurisdiccion: 'ENSENADA', ruta: 5, clues: ['BCIMB000080', 'BCIMB000051', 'BCIMB000063', 'BCIMB001656', 'BCIMB001661', 'BCIMB000116'] },
  { jurisdiccion: 'ENSENADA', ruta: 6, clues: ['BCIMB000162'] },
  { jurisdiccion: 'ENSENADA', ruta: 7, clues: ['BCIMB000121', 'BCIMB000104', 'BCIMB000075', 'BCIMB000092'] },
  { jurisdiccion: 'ENSENADA', ruta: 8, clues: ['BCIMB001410', 'BCIMB001451', 'BCIMB001463', 'BCIMB001516'] },

  { jurisdiccion: 'MEXICALI', ruta: 1, clues: ['BCIMB000133'] },
  { jurisdiccion: 'MEXICALI', ruta: 2, clues: ['BCIMB000553', 'BCIMB000652', 'BCIMB000565', 'BCIMB000512'] },
  { jurisdiccion: 'MEXICALI', ruta: 3, clues: ['BCIMB000541', 'BCIMB001603', 'BCIMB001690'] },
  { jurisdiccion: 'MEXICALI', ruta: 4, clues: ['BCIMB001475', 'BCIMB000640', 'BCIMB000536', 'BCIMB000500'] },
  { jurisdiccion: 'MEXICALI', ruta: 5, clues: ['BCIMB000570', 'BCIMB000524', 'BCIMB000582', 'BCIMB000664'] },
  { jurisdiccion: 'MEXICALI', ruta: 6, clues: ['BCIMB001504', 'BCIMB000635', 'BCIMB000594'] },
  { jurisdiccion: 'MEXICALI', ruta: 7, clues: ['BCIMB000430', 'BCIMB000442', 'BCIMB000413'] },
  { jurisdiccion: 'MEXICALI', ruta: 8, clues: ['BCIMB000401', 'BCIMB000384', 'BCIMB000466', 'BCIMB000454'] },
  { jurisdiccion: 'MEXICALI', ruta: 9, clues: ['BCIMB000372', 'BCIMB000396', 'BCIMB000471', 'BCIMB000495'] },
  { jurisdiccion: 'MEXICALI', ruta: 10, clues: ['BCIMB000606', 'BCIMB000611', 'BCIMB000483', 'BCIMB000425'] },

  { jurisdiccion: 'TIJUANA', ruta: 1, clues: ['BCIMB000693', 'BCIMB000705', 'BCIMB000710', 'BCIMB000722', 'BCIMB001673'] },
  { jurisdiccion: 'TIJUANA', ruta: 2, clues: ['BCIMB001055', 'BCIMB001060', 'BCIMB001731', 'BCIMB001644'] },
  { jurisdiccion: 'TIJUANA', ruta: 3, clues: ['BCIMB000903', 'BCIMB000990', 'BCIMB000961', 'BCIMB001620', 'BCIMB000850', 'BCIMB000891'] },
  { jurisdiccion: 'TIJUANA', ruta: 4, clues: ['BCIMB000886', 'BCIMB000985', 'BCIMB001002', 'BCIMB001446', 'BCIMB000862'] },
  { jurisdiccion: 'TIJUANA', ruta: 5, clues: ['BCIMB000845', 'BCIMB001760', 'BCIMB000932', 'BCIMB001014'] },
  { jurisdiccion: 'TIJUANA', ruta: 6, clues: ['BCIMB001026', 'BCIMB001072', 'BCIMB000944', 'BCIMB001521', 'BCIMB000920', 'BCIMB000973'] },
  { jurisdiccion: 'TIJUANA', ruta: 7, clues: ['BCIMB001043', 'BCIMB001096', 'BCIMB001755', 'BCIMB001101'] },
  { jurisdiccion: 'TIJUANA', ruta: 8, clues: ['BCIMB000956', 'BCIMB000915', 'BCIMB000874', 'BCIMB001031'] },
];

export const RUTA_SIN_ASIGNAR = 'RECOLECCIÓN / SIN RUTA';
