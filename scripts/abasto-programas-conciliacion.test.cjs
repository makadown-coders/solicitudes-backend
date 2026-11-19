const test = require('node:test');
const assert = require('node:assert/strict');
const { conciliarNecesidadesConSas } = require('../dist/services/abasto-programas-conciliacion');

const necesidad = (clues, clave, cantidad, vertiente = 'APS', programa = null, evidencia = 'REGISTRADA') => ({
  solicitudId: `${clues}-${clave}-${programa ?? vertiente}`, clues, clave, cantidad, vertiente, programa,
  programaNombre: programa, evidencia,
});

test('atribuye SAS una sola vez, conserva negativos y porcentajes mayores a 100', () => {
  const generales = [
    { clues: 'U1', clave: 'APS', cantidad: 100 },
    { clues: 'U1', clave: 'PP', cantidad: 50 },
    { clues: 'U1', clave: 'DOS', cantidad: 100 },
    { clues: 'U1', clave: 'CLAVE', cantidad: 100 },
    { clues: 'U1', clave: 'NEG', cantidad: 20 },
    { clues: 'U1', clave: 'EXC', cantidad: 10 },
  ];
  const programaticas = [
    necesidad('U1', 'APS', 100),
    necesidad('U1', 'PP', 50, 'PROGRAMAS_PREVENTIVOS', 'DENTAL'),
    necesidad('U1', 'DOS', 60, 'PROGRAMAS_PREVENTIVOS', 'DENTAL'),
    necesidad('U1', 'DOS', 40, 'PROGRAMAS_PREVENTIVOS', 'VACUNACION'),
    necesidad('U1', 'CLAVE', 70),
    necesidad('U1', 'NEG', 20),
    necesidad('U1', 'EXC', 10, 'PROGRAMAS_PREVENTIVOS', 'DENTAL', 'INFERIDA'),
  ];
  const salidas = [
    { clues: 'U1', clave: 'APS', cantidad: 80 },
    { clues: 'U1', clave: 'PP', cantidad: 50 },
    { clues: 'U1', clave: 'DOS', cantidad: 75 },
    { clues: 'U1', clave: 'CLAVE', cantidad: 90 },
    { clues: 'U1', clave: 'NEG', cantidad: -5 },
    { clues: 'U1', clave: 'EXC', cantidad: 25 },
    { clues: 'U1', clave: 'SIN', cantidad: 12 },
  ];

  const result = conciliarNecesidadesConSas(generales, programaticas, salidas);
  assert.equal(result.filas.find(row => row.clave === 'APS').surtidoSas, 80);
  assert.equal(result.filas.find(row => row.clave === 'PP').cobertura, 100);
  assert.equal(result.filas.filter(row => row.clave === 'DOS').every(row => row.surtidoSas === null), true);
  assert.equal(result.compartidas.find(row => row.clave === 'DOS').surtidoSas, 75);
  assert.equal(result.filas.find(row => row.clave === 'CLAVE').atribucionSas, 'COMPARTIDA');
  assert.equal(result.compartidas.find(row => row.clave === 'CLAVE').cantidadNoClasificada, 30);
  assert.equal(result.filas.find(row => row.clave === 'NEG').surtidoSas, -5);
  assert.equal(result.filas.find(row => row.clave === 'NEG').pendiente, 25);
  assert.equal(result.filas.find(row => row.clave === 'EXC').relacionSurtidoSolicitado, 250);
  assert.equal(result.filas.find(row => row.clave === 'EXC').cobertura, 100);
  assert.deepEqual(result.salidasSinNecesidad, [{ clues: 'U1', clave: 'SIN', cantidad: 12 }]);
});
