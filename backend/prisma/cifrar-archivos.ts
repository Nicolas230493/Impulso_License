/**
 * Cifra en disco los archivos subidos antes de activar CLAVE_CIFRADO (AES-256-GCM).
 *
 *   npm run cifrar:archivos               simulación: informa cuántos faltan cifrar
 *   npm run cifrar:archivos -- --aplicar  los cifra
 *
 * Verifica el hash SHA-256 registrado antes de cifrar y escribe primero en un archivo temporal que después
 * reemplaza al original (si se interrumpe, el original queda intacto). Se puede correr varias veces.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { readFile, rename, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { cifrar, claveDesdeHex, descifrar, estaCifrado } from '../src/common/cifrado';

async function main() {
  // Node 20.12+: carga backend/.env sin dependencias extra (las variables ya definidas tienen prioridad).
  try { process.loadEnvFile('.env'); } catch { /* sin .env: se usan las variables del entorno */ }
  const aplicar = process.argv.includes('--aplicar');
  const clave = claveDesdeHex(process.env.CLAVE_CIFRADO);
  if (!clave) throw new Error('Defina CLAVE_CIFRADO en backend/.env');
  const dir = resolve(process.env.STORAGE_DIR ?? './storage');
  const prisma = new PrismaClient();
  let cifrados = 0, yaCifrados = 0, faltantes = 0, alterados = 0;
  try {
    for (const a of await prisma.archivo.findMany({ select: { id: true, ruta: true, sha256: true } })) {
      const ruta = join(dir, a.ruta);
      const datos = await readFile(ruta).catch(() => null);
      if (!datos) { faltantes++; console.warn(`Falta en disco: ${a.id}`); continue; }
      if (estaCifrado(datos)) {
        // Comprueba que la clave sea la correcta.
        descifrar(datos, clave);
        yaCifrados++;
        continue;
      }
      if (createHash('sha256').update(datos).digest('hex') !== a.sha256) { alterados++; console.warn(`No coincide con su hash (no se toca): ${a.id}`); continue; }
      if (aplicar) {
        const temporal = `${ruta}.cifrando`;
        await writeFile(temporal, cifrar(datos, clave), { mode: 0o600 });
        await rename(temporal, ruta);
      }
      cifrados++;
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`${aplicar ? 'Cifrados' : 'A cifrar'}: ${cifrados} · ya cifrados: ${yaCifrados} · faltan en disco: ${faltantes} · alterados: ${alterados}`);
  if (!aplicar && cifrados) console.log('Vuelva a correr con --aplicar para cifrarlos.');
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
