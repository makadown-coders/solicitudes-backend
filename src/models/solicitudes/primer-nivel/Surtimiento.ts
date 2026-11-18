export interface Ventana { zona: string; desde: string; hasta: string; almacenId?: number }
export interface Consulta { mes: string; ventanas: Ventana[]; presentaciones: string[] }
export interface Centro { id: number; clues: string; nombre: string; municipio: string; unico: boolean }
export interface Almacen { id: number; nombre: string; zonas: string[] }
export interface Cabecera { id: string; clues: string; periodo: string; fecha: string; tipo: string; contexto: boolean }
export interface Detalle { id: string; clave: string; cantidad: number; invalido: boolean; descripcion: string; medidas: string }
export interface Despacho { origen: number | null; destino: number | null; clave: string; cantidad: number | null; invalidas: number; dia: string | null; descripcion: string; centro: boolean; identificado: boolean }
export interface Fila { tieneMovimiento: boolean; solicitudIds: string[]; clues: string; nombre: string; municipio: string; clave: string; descripcion: string; medida: string; presentacionSas: string; solicitado: number|null; surtido: number; pendiente: number|null; excedente: number|null; cobertura: number|null; relacion: number|null; estado: string; validar: boolean }
export interface Informe { corte: string; almacenes: Almacen[]; filas: Fila[]; incidencias: string[]; sinSolicitud: Fila[]; ventanas: Ventana[] }
