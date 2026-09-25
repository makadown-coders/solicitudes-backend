import { createHash, Hash } from 'node:crypto';
import { setImmediate as ceder } from 'node:timers/promises';

// Huellas de 32 bytes por elemento: no clona filas ni serializa el reporte completo.
// Los arreglos son multiconjuntos: ignora su orden, pero conserva duplicados y valores exactos.
function agregar(hash: Hash, value: unknown): void {
  if (Array.isArray(value)) {
    const huellas = value.map(item => {
      const child = createHash('sha256');
      agregar(child, item);
      return child.digest();
    }).sort(Buffer.compare);
    hash.update(`array:${huellas.length}:`);
    for (const huella of huellas) hash.update(huella);
  } else if (value !== null && typeof value === 'object') {
    hash.update('{');
    for (const key of Object.keys(value).sort()) {
      hash.update(JSON.stringify(key)).update(':');
      agregar(hash, (value as Record<string, unknown>)[key]);
      hash.update(',');
    }
    hash.update('}');
  } else {
    hash.update(JSON.stringify(value) ?? 'undefined');
  }
}

async function agregarEnLotes(hash: Hash, value: unknown): Promise<void> {
  if (Array.isArray(value)) {
    const huellas: Buffer[] = [];
    for (let index = 0; index < value.length; index++) {
      const child = createHash('sha256');
      agregar(child, value[index]);
      huellas.push(child.digest());
      if (index % 256 === 255) await ceder();
    }
    huellas.sort(Buffer.compare);
    hash.update(`array:${huellas.length}:`);
    for (const huella of huellas) hash.update(huella);
  } else if (value !== null && typeof value === 'object') {
    hash.update('{');
    for (const key of Object.keys(value).sort()) {
      hash.update(JSON.stringify(key)).update(':');
      await agregarEnLotes(hash, (value as Record<string, unknown>)[key]);
      hash.update(',');
    }
    hash.update('}');
  } else agregar(hash, value);
}

export async function versionReporte(value: unknown): Promise<string> {
  const hash = createHash('sha256').update('radar-v2-memory-1:');
  await agregarEnLotes(hash, value);
  return hash.digest('hex');
}
