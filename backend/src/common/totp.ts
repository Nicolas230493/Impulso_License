import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Segundo factor TOTP (RFC 6238): HMAC-SHA1, pasos de 30 s y 6 dígitos, compatible con las apps autenticadoras. */
export const PASO_SEGUNDOS = 30;
const DIGITOS = 6;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(datos: Buffer): string {
  let bits = 0, valor = 0, salida = '';
  for (const byte of datos) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) { salida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function desdeBase32(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, valor = 0;
  const bytes: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Secreto base32 inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) { bytes.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

/** Secreto nuevo de 160 bits (lo recomendado por la RFC 4226), en base32. */
export const generarSecreto = () => base32(randomBytes(20));

export const pasoActual = (ahoraMs = Date.now()) => Math.floor(ahoraMs / 1000 / PASO_SEGUNDOS);

export function codigoParaPaso(secreto: Buffer, paso: number, digitos = DIGITOS): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', secreto).update(contador).digest();
  const desplazamiento = h[h.length - 1] & 0xf;
  const binario = h.readUInt32BE(desplazamiento) & 0x7fffffff;
  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

/**
 * Verifica un código con tolerancia de ±1 paso por desfase de reloj. Devuelve el paso que coincidió (para impedir
 * reutilizar el mismo código) o null. `ultimoPasoUsado` rechaza códigos de pasos ya consumidos.
 */
export function verificarCodigo(secretoBase32: string, codigo: string, opciones: { ahoraMs?: number; ultimoPasoUsado?: number | null } = {}): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const secreto = desdeBase32(secretoBase32);
  const actual = pasoActual(opciones.ahoraMs);
  for (const paso of [actual - 1, actual, actual + 1]) {
    if (opciones.ultimoPasoUsado != null && paso <= opciones.ultimoPasoUsado) continue;
    const esperado = Buffer.from(codigoParaPaso(secreto, paso));
    if (timingSafeEqual(esperado, Buffer.from(codigo))) return paso;
  }
  return null;
}

/** URI para cargar el secreto en una app autenticadora (Google Authenticator, Microsoft Authenticator, etc.). */
export function uriOtpauth(emisor: string, cuenta: string, secreto: string) {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASO_SEGUNDOS}`;
}
