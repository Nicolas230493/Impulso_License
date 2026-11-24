/**
 * Validación estructural de archivos subidos (hallazgo 24), además de la firma binaria.
 * Devuelve un mensaje de error o null si el archivo es aceptable.
 */

/** Construcciones de PDF que ejecutan código o lanzan acciones al abrirse. */
const PDF_ACTIVO = /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA|SubmitForm|ImportData)\b/;

export function validarPdf(buffer: Buffer): string | null {
  const cabecera = buffer.subarray(0, 1024).toString('latin1');
  if (!/^%PDF-[12]\.\d/.test(cabecera)) return 'El PDF no tiene una cabecera válida';
  const cola = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1');
  if (!cola.includes('%%EOF')) return 'El PDF está incompleto o dañado (falta el marcador de fin de archivo)';
  const texto = buffer.toString('latin1');
  if (!/\bobj\b/.test(texto) || !/(trailer|\/Type\s*\/XRef|startxref)/.test(texto)) return 'El PDF no tiene una estructura válida';
  // Los nombres de PDF pueden codificarse en hexadecimal (#4A = J): se normalizan antes de buscar.
  const normalizado = texto.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (PDF_ACTIVO.test(normalizado)) return 'El PDF contiene contenido activo (scripts, acciones o adjuntos) y no se admite';
  return null;
}

export function validarPng(buffer: Buffer): string | null {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 33 || !firma.every((b, i) => buffer[i] === b)) return 'La imagen PNG no es válida';
  if (buffer.subarray(12, 16).toString('latin1') !== 'IHDR') return 'La imagen PNG no es válida';
  if (!buffer.subarray(Math.max(0, buffer.length - 12)).includes(Buffer.from('IEND', 'latin1'))) return 'La imagen PNG está incompleta';
  return null;
}

export function validarJpeg(buffer: Buffer): string | null {
  if (buffer.length < 4) return 'La imagen JPG no es válida';
  // Fin de imagen (FFD9), tolerando bytes de relleno al final.
  const cola = buffer.subarray(Math.max(0, buffer.length - 64));
  for (let i = cola.length - 2; i >= 0; i--) if (cola[i] === 0xff && cola[i + 1] === 0xd9) return null;
  return 'La imagen JPG está incompleta o dañada';
}

export function validarEstructura(mime: string, buffer: Buffer): string | null {
  if (mime === 'application/pdf') return validarPdf(buffer);
  if (mime === 'image/png') return validarPng(buffer);
  if (mime === 'image/jpeg') return validarJpeg(buffer);
  return 'Formato no admitido';
}
