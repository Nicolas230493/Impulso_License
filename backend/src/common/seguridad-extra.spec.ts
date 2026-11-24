import { readFileSync } from 'fs';
import { createServer, Server } from 'net';
import { join } from 'path';
import { deflateRawSync } from 'zlib';
import { cifrar, cifrarTexto, claveDesdeHex, descifrar, descifrarTexto, estaCifrado } from './cifrado';
import { base32, codigoParaPaso, desdeBase32, generarSecreto, pasoActual, uriOtpauth, verificarCodigo } from './totp';
import { verificarZip, ZipInseguroError } from './zip-seguro';
import { AntivirusNoDisponibleError, escanearConClamd } from '../modules/archivos/antivirus';

const CLAVE = Buffer.alloc(32, 7);

describe('cifrado en reposo (AES-256-GCM)', () => {
  it('cifra y descifra; el resultado lleva la marca y no contiene el texto original', () => {
    const datos = Buffer.from('%PDF-1.4 certificado médico confidencial');
    const c = cifrar(datos, CLAVE);
    expect(estaCifrado(c)).toBe(true);
    expect(estaCifrado(datos)).toBe(false);
    expect(c.includes(Buffer.from('confidencial'))).toBe(false);
    expect(descifrar(c, CLAVE)).toEqual(datos);
  });
  it('detecta alteraciones y claves incorrectas', () => {
    const c = cifrar(Buffer.from('dato'), CLAVE);
    const alterado = Buffer.from(c);
    alterado[alterado.length - 1] ^= 1;
    expect(() => descifrar(alterado, CLAVE)).toThrow();
    expect(() => descifrar(c, Buffer.alloc(32, 8))).toThrow();
  });
  it('textos (secretos TOTP) y validación de la clave', () => {
    expect(descifrarTexto(cifrarTexto('JBSWY3DPEHPK3PXP', CLAVE), CLAVE)).toBe('JBSWY3DPEHPK3PXP');
    expect(claveDesdeHex(undefined)).toBeNull();
    expect(() => claveDesdeHex('abc')).toThrow(/64/);
    expect(claveDesdeHex('ab'.repeat(32))).toHaveLength(32);
  });
});

describe('TOTP (RFC 6238)', () => {
  // Vectores oficiales de la RFC 6238 (SHA-1, secreto ASCII "12345678901234567890", 8 dígitos).
  const SECRETO = Buffer.from('12345678901234567890');
  it.each([[59, '94287082'], [1111111109, '07081804'], [1234567890, '89005924'], [2000000000, '69279037']])('t=%i → %s', (t, esperado) => {
    expect(codigoParaPaso(SECRETO, Math.floor(t / 30), 8)).toBe(esperado);
  });
  it('base32 ida y vuelta, y secretos de 160 bits', () => {
    expect(desdeBase32(base32(SECRETO))).toEqual(SECRETO);
    expect(desdeBase32(generarSecreto())).toHaveLength(20);
  });
  it('acepta el código actual y ±1 paso, rechaza otros y los ya usados', () => {
    const s = generarSecreto();
    const ahora = Date.now();
    const paso = pasoActual(ahora);
    const codigo = (p: number) => codigoParaPaso(desdeBase32(s), p);
    expect(verificarCodigo(s, codigo(paso), { ahoraMs: ahora })).toBe(paso);
    expect(verificarCodigo(s, codigo(paso - 1), { ahoraMs: ahora })).toBe(paso - 1);
    expect(verificarCodigo(s, codigo(paso + 3), { ahoraMs: ahora })).toBeNull();
    expect(verificarCodigo(s, codigo(paso), { ahoraMs: ahora, ultimoPasoUsado: paso })).toBeNull();
    expect(verificarCodigo(s, 'abcdef', { ahoraMs: ahora })).toBeNull();
  });
  it('URI para apps autenticadoras', () => {
    expect(uriOtpauth('Impulso License', 'a@b.c', 'ABC')).toBe('otpauth://totp/Impulso%20License%3Aa%40b.c?secret=ABC&issuer=Impulso%20License&algorithm=SHA1&digits=6&period=30');
  });
});

/** ZIP mínimo de una entrada; `declarado` permite mentir sobre el tamaño descomprimido. */
function zip(nombre: string, contenido: Buffer, declarado = contenido.length) {
  const comp = deflateRawSync(contenido);
  const n = Buffer.from(nombre);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(declarado, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(declarado, 24); central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const inicioCentral = 30 + n.length + comp.length;
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(46 + n.length, 12); fin.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, n, comp, central, n, fin]);
}

describe('protección contra bombas zip', () => {
  it('acepta el Excel real del nomenclador', () => {
    expect(() => verificarZip(readFileSync(join(__dirname, '../../prisma/datos/nomenclador-647e-2026.xlsx')))).not.toThrow();
  });
  it('acepta un zip chico y correcto', () => {
    expect(() => verificarZip(zip('a.xml', Buffer.from('<x/>')))).not.toThrow();
  });
  it('rechaza una entrada que declara poco y se expande mucho (bomba)', () => {
    const bomba = zip('a.xml', Buffer.alloc(20 * 1024 * 1024), 1000);
    expect(() => verificarZip(bomba)).toThrow(/se expande más de lo declarado/);
  });
  it('rechaza contenido que supera el límite total', () => {
    const grande = zip('a.xml', Buffer.alloc(2 * 1024 * 1024));
    expect(() => verificarZip(grande, { maxEntradas: 10, maxBytesEntrada: 1024 * 1024, maxBytesTotal: 10 * 1024 * 1024 })).toThrow(ZipInseguroError);
  });
  it('rechaza archivos que no son zip', () => {
    expect(() => verificarZip(Buffer.from('no es un zip'))).toThrow(/ZIP/);
  });
});

describe('antivirus (clamd INSTREAM)', () => {
  let servidor: Server;
  const levantar = (responder: (datos: Buffer) => string | null) =>
    new Promise<number>((ok) => {
      servidor = createServer((s) => {
        const partes: Buffer[] = [];
        s.on('data', (b) => {
          partes.push(b);
          const todo = Buffer.concat(partes);
          // Fin del stream: bloque de largo 0 al final.
          if (todo.length >= 14 && todo.subarray(-4).readUInt32BE(0) === 0) {
            const r = responder(todo);
            if (r !== null) s.end(`${r}\0`);
          }
        });
      }).listen(0, '127.0.0.1', () => ok((servidor.address() as { port: number }).port));
    });
  afterEach(() => servidor?.close());

  it('archivo limpio', async () => {
    const puerto = await levantar((d) => (d.subarray(0, 10).toString() === 'zINSTREAM\0' ? 'stream: OK' : 'ERROR'));
    await expect(escanearConClamd(Buffer.from('%PDF-1.4'), '127.0.0.1', puerto)).resolves.toEqual({ limpio: true });
  });
  it('archivo infectado', async () => {
    const puerto = await levantar(() => 'stream: Eicar-Test-Signature FOUND');
    await expect(escanearConClamd(Buffer.from('X5O!P%@AP'), '127.0.0.1', puerto)).resolves.toEqual({ limpio: false, amenaza: 'Eicar-Test-Signature' });
  });
  it('falla cerrada si no responde o no está disponible', async () => {
    const puerto = await levantar(() => null);
    await expect(escanearConClamd(Buffer.from('x'), '127.0.0.1', puerto, 300)).rejects.toBeInstanceOf(AntivirusNoDisponibleError);
    await expect(escanearConClamd(Buffer.from('x'), '127.0.0.1', 1, 300)).rejects.toBeInstanceOf(AntivirusNoDisponibleError);
  });
});
