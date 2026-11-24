import { Socket } from 'net';

/**
 * Cliente mínimo de clamd (protocolo INSTREAM): envía el archivo en bloques y devuelve el veredicto.
 * Falla cerrada: si el antivirus está configurado y no responde, el archivo no se acepta.
 */
export type ResultadoEscaneo = { limpio: true } | { limpio: false; amenaza: string };

const BLOQUE = 64 * 1024;

export class AntivirusNoDisponibleError extends Error {}

export function escanearConClamd(datos: Buffer, host: string, puerto: number, timeoutMs = 30_000): Promise<ResultadoEscaneo> {
  return new Promise((resolve, reject) => {
    const s = new Socket();
    let respuesta = '';
    let terminado = false;
    const fallar = (motivo: string) => {
      if (terminado) return;
      terminado = true;
      s.destroy();
      reject(new AntivirusNoDisponibleError(motivo));
    };
    s.setTimeout(timeoutMs, () => fallar('el antivirus no respondió a tiempo'));
    s.on('error', (e) => fallar(`no se pudo conectar con el antivirus: ${e.message}`));
    s.on('data', (b) => { respuesta += b.toString('utf8'); });
    s.on('end', () => {
      if (terminado) return;
      terminado = true;
      const r = respuesta.replace(/\0/g, '').trim();
      if (/:\s*OK$/.test(r)) return resolve({ limpio: true });
      const m = /:\s*(.+)\s+FOUND$/.exec(r);
      if (m) return resolve({ limpio: false, amenaza: m[1] });
      reject(new AntivirusNoDisponibleError(`respuesta inesperada del antivirus: ${r.slice(0, 200)}`));
    });
    s.connect(puerto, host, () => {
      s.write('zINSTREAM\0');
      for (let i = 0; i < datos.length; i += BLOQUE) {
        const parte = datos.subarray(i, i + BLOQUE);
        const largo = Buffer.alloc(4);
        largo.writeUInt32BE(parte.length);
        s.write(largo);
        s.write(parte);
      }
      s.end(Buffer.alloc(4)); // bloque de largo 0: fin del archivo
    });
  });
}
