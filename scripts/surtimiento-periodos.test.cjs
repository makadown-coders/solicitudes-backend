const assert = require('node:assert/strict');
const { cabeceraElegible, conciliar, rangoUltimos30 } = require('../dist/services/surtimiento-calculo');

const rango=rangoUltimos30('2026-11-19');
assert.deepEqual(rango,{desde:'2026-10-21',hasta:'2026-11-19'});

const movil={mes:'2026-11',modalidad:'ULTIMOS_30_DIAS',solicitudesDesde:rango.desde,solicitudesHasta:rango.hasta,
  ventanas:[{zona:'AZT',desde:rango.desde,hasta:rango.hasta,almacenId:10}]};
const mensual={mes:'2026-11',modalidad:'MES_CALENDARIO',solicitudesDesde:'2026-11-01',solicitudesHasta:'2026-11-30',ventanas:movil.ventanas};
const cab=(id,fecha,periodo='octubre 2026')=>({id,clues:'BC1',periodo,fecha,tipo:'Ordinario',contexto:true});

assert.equal(cabeceraElegible(movil,cab('A','2026-10-21')),true);
assert.equal(cabeceraElegible(movil,cab('B','2026-11-19')),true);
assert.equal(cabeceraElegible(movil,cab('C','2026-10-20')),false);
assert.equal(cabeceraElegible(mensual,cab('D','2026-10-29','noviembre 2026')),true);
assert.equal(cabeceraElegible(mensual,cab('E','2026-11-02','octubre 2026')),false);

// Solicitud del 29 de octubre y salida del 4 de noviembre: coincidencia directa dentro de la ventana móvil.
const centros=[{id:1,clues:'BC1',nombre:'Centro Uno',municipio:'Tijuana',unico:true}];
const cabeceras=[cab('A','2026-10-29'),cab('B','2026-11-02','noviembre 2026')];
const detalles=[
  {id:'A',clave:'010.000.0001.00',cantidad:60,invalido:false,descripcion:'Insumo'},
  {id:'B',clave:'010.000.0001.00',cantidad:40,invalido:false,descripcion:'Insumo'},
];
const salidas=[{origen:10,destino:1,clave:'010.000.0001.00',cantidad:75,invalidas:0,dia:'2026-11-04',descripcion:'Insumo SAS',centro:true,identificado:true}];
const resultado=conciliar(movil,'2026-11-19',centros,[{id:10,nombre:'AZT',zonas:['AZT']}],cabeceras,detalles,salidas);
assert.equal(resultado.filas.length,1);
assert.equal(resultado.filas[0].solicitado,100);
assert.equal(resultado.filas[0].surtido,75);
assert.equal(resultado.filas[0].pendiente,25);
assert.equal(resultado.filas[0].solicitudes.length,2);
assert.equal(resultado.sinSolicitud.length,0);
assert.equal(resultado.limitacionesTemporales.length,1);

console.log('surtimiento-periodos: ventana inclusiva, trazabilidad y conciliación cruzada correctas');
