import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Cifrado en reposo (AES-256-GCM) para archivos subidos y secretos de segundo factor.
 * Formato binario: MAGIA (6 bytes) + IV (12) + TAG (16) + texto cifrado. La marca permite convivir con archivos
 * anteriores sin cifrar y detectarlos para migrarlos (npm run cifrar:archivos).
 */
const MAGIA = Buffer.from('ILENC1');
const LARGO_IV = 12;
const LARGO_TAG = 16;
const CABECERA = MAGIA.length + LARGO_IV + LARGO_TAG;

/** Convierte CLAVE_CIFRADO (64 caracteres hexadecimales) en la clave de 32 bytes. */
export function claveDesdeHex(hex: string | undefined | null): Buffer | null {
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('CLAVE_CIFRADO debe tener 64 caracteres hexadecimales (32 bytes)');
  return Buffer.from(hex, 'hex');
}

export const estaCifrado = (datos: Buffer) => datos.length >= CABECERA && datos.subarray(0, MAGIA.length).equals(MAGIA);

export function cifrar(datos: Buffer, clave: Buffer): Buffer {
  const iv = randomBytes(LARGO_IV);
  const c = createCipheriv('aes-256-gcm', clave, iv);
  const cuerpo = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([MAGIA, iv, c.getAuthTag(), cuerpo]);
}

/** Descifra y verifica la integridad (GCM): si el archivo fue alterado o la clave no corresponde, lanza un error. */
export function descifrar(datos: Buffer, clave: Buffer): Buffer {
  if (!estaCifrado(datos)) throw new Error('El contenido no está cifrado');
  const iv = datos.subarray(MAGIA.length, MAGIA.length + LARGO_IV);
  const tag = datos.subarray(MAGIA.length + LARGO_IV, CABECERA);
  const d = createDecipheriv('aes-256-gcm', clave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos.subarray(CABECERA)), d.final()]);
}

/** Variante para textos cortos guardados en la base (base64). */
export const cifrarTexto = (texto: string, clave: Buffer) => cifrar(Buffer.from(texto, 'utf8'), clave).toString('base64');
export const descifrarTexto = (b64: string, clave: Buffer) => descifrar(Buffer.from(b64, 'base64'), clave).toString('utf8');
