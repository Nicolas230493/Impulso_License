import { inflateRawSync } from 'zlib';

/**
 * Protección contra "bombas zip" (un .xlsx es un ZIP). Antes de entregar el archivo a ExcelJS se recorre el directorio
 * central y se descomprime cada entrada con un tope igual al tamaño declarado: si alguna se expande más de lo que
 * dice, o el total supera los límites, se rechaza sin agotar la memoria del servidor.
 */
export interface LimitesZip {
  maxEntradas: number;
  maxBytesEntrada: number;
  maxBytesTotal: number;
}

export const LIMITES_XLSX: LimitesZip = { maxEntradas: 2_000, maxBytesEntrada: 50 * 1024 * 1024, maxBytesTotal: 100 * 1024 * 1024 };

const FIRMA_FIN = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

export class ZipInseguroError extends Error {}

/** Lanza ZipInseguroError si el archivo no es un ZIP válido o excede los límites. */
export function verificarZip(datos: Buffer, limites: LimitesZip = LIMITES_XLSX): void {
  const fin = buscarFin(datos);
  const entradas = datos.readUInt16LE(fin + 10);
  const tamCentral = datos.readUInt32LE(fin + 12);
  const inicioCentral = datos.readUInt32LE(fin + 16);
  if (entradas === 0xffff || tamCentral === 0xffffffff || inicioCentral === 0xffffffff) throw new ZipInseguroError('ZIP64 no admitido');
  if (entradas > limites.maxEntradas) throw new ZipInseguroError(`Demasiadas entradas (${entradas})`);
  if (inicioCentral + tamCentral > fin) throw new ZipInseguroError('Directorio central inválido');

  let p = inicioCentral, total = 0;
  for (let i = 0; i < entradas; i++) {
    if (p + 46 > datos.length || datos.readUInt32LE(p) !== FIRMA_CENTRAL) throw new ZipInseguroError('Entrada del directorio central inválida');
    const metodo = datos.readUInt16LE(p + 10);
    const comprimido = datos.readUInt32LE(p + 20);
    const descomprimido = datos.readUInt32LE(p + 24);
    const largoNombre = datos.readUInt16LE(p + 28), largoExtra = datos.readUInt16LE(p + 30), largoComentario = datos.readUInt16LE(p + 32);
    const local = datos.readUInt32LE(p + 42);
    if (descomprimido > limites.maxBytesEntrada) throw new ZipInseguroError('Una entrada excede el tamaño permitido');
    total += descomprimido;
    if (total > limites.maxBytesTotal) throw new ZipInseguroError('El contenido descomprimido excede el tamaño permitido');

    if (local + 30 > datos.length || datos.readUInt32LE(local) !== FIRMA_LOCAL) throw new ZipInseguroError('Encabezado local inválido');
    const inicioDatos = local + 30 + datos.readUInt16LE(local + 26) + datos.readUInt16LE(local + 28);
    if (inicioDatos + comprimido > datos.length) throw new ZipInseguroError('Entrada truncada');
    const bloque = datos.subarray(inicioDatos, inicioDatos + comprimido);
    if (metodo === 0) {
      if (comprimido !== descomprimido) throw new ZipInseguroError('Entrada almacenada inconsistente');
    } else if (metodo === 8) {
      let real: Buffer;
      try {
        // Si la entrada se expande más de lo declarado, zlib corta y lanza un error (no se agota la memoria).
        real = inflateRawSync(bloque, { maxOutputLength: Math.max(descomprimido, 1) });
      } catch {
        throw new ZipInseguroError('Una entrada se expande más de lo declarado');
      }
      if (real.length !== descomprimido) throw new ZipInseguroError('Tamaño descomprimido inconsistente');
    } else {
      throw new ZipInseguroError(`Método de compresión no admitido (${metodo})`);
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
}

function buscarFin(datos: Buffer): number {
  const minimo = Math.max(0, datos.length - 22 - 0xffff);
  for (let i = datos.length - 22; i >= minimo; i--) if (datos.readUInt32LE(i) === FIRMA_FIN) return i;
  throw new ZipInseguroError('No es un archivo ZIP válido');
}
