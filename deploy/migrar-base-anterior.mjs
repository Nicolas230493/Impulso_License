#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pasa los datos de la base anterior (EduLicencias: contenedor edulicencias-db, base "edulicencias", volumen *_pgdata)
// a la base nueva de Impulso License (contenedor impulso-license-db, base "impulso_license", volumen *_pgdata_impulso).
// Funciona igual en Linux, macOS y Windows (PowerShell o cmd): solo necesita Node y Docker.
//
//   node deploy/migrar-base-anterior.mjs                → pasa los datos; se niega si la base nueva ya tiene tablas
//   node deploy/migrar-base-anterior.mjs --reemplazar   → respalda la base nueva y la reemplaza por los datos anteriores
//
// - La base anterior NO se modifica: se lee con pg_dump. Su volumen queda intacto como respaldo.
// - Se guardan respaldos en ./respaldos/ (la base anterior siempre; la nueva, si se reemplaza).
// - Si la base nueva solo tiene datos de demostración (seed), use --reemplazar: los datos reales tienen prioridad.
// - Variables de entorno opcionales: VIEJO_CONTENEDOR (edulicencias-db), VIEJO_VOLUMEN (se detecta), VIEJO_USUARIO
//   (edulicencias), VIEJO_DB (edulicencias), NUEVO_CONTENEDOR (impulso-license-db), DOCKER_BIN (docker; p. ej. podman).
//
// Al final indica los pasos siguientes en backend/. Los archivos adjuntos (backend/storage) no se tocan.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const REEMPLAZAR = process.argv.includes('--reemplazar');
const TEMPORAL = 'edulicencias-migracion';
const DOCKER = process.env.DOCKER_BIN || 'docker';

const paso = (t) => console.log(`\n▶ ${t}`);
const fallar = (t) => { console.error(`\n✘ ${t}`); process.exit(1); };
const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Ejecuta docker sin shell (mismo comportamiento en todas las plataformas). */
function docker(args, { capturar = false, permitirFallo = false } = {}) {
  const r = spawnSync(DOCKER, args, { cwd: RAIZ, encoding: 'utf8', stdio: capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (r.error) fallar(r.error.code === 'ENOENT' ? `${DOCKER} no está instalado o no está en el PATH.` : r.error.message);
  if (r.status !== 0 && !permitirFallo) fallar(`Falló: docker ${args.join(' ')}${capturar && r.stderr ? `\n${r.stderr.trim()}` : ''}`);
  return { ok: r.status === 0, salida: (r.stdout ?? '').trim() };
}

/** Lee el .env de docker compose (KEY=valor, con o sin comillas). */
function leerEnv(ruta) {
  if (!existsSync(ruta)) fallar('Falta el archivo .env junto a docker-compose.yml (ver .env.example).');
  const env = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!m || linea.trimStart().startsWith('#')) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function esperar(contenedor, usuario, base) {
  for (let i = 0; i < 60; i++) {
    if (docker(['exec', contenedor, 'pg_isready', '-U', usuario, '-d', base], { capturar: true, permitirFallo: true }).ok) return;
    dormir(1000);
  }
  fallar(`El contenedor ${contenedor} no respondió.`);
}

const env = leerEnv(join(RAIZ, '.env'));
for (const k of ['POSTGRES_ADMIN_USER', 'POSTGRES_DB', 'APP_DB_USER', 'MIGRACION_DB_USER']) if (!env[k]) fallar(`Defina ${k} en .env`);
const { POSTGRES_ADMIN_USER: ADMIN, POSTGRES_DB: DB, APP_DB_USER: APP, MIGRACION_DB_USER: DUENO } = env;
const VIEJO_CONTENEDOR = process.env.VIEJO_CONTENEDOR ?? 'edulicencias-db';
const VIEJO_USUARIO = process.env.VIEJO_USUARIO ?? 'edulicencias';
const VIEJO_DB = process.env.VIEJO_DB ?? 'edulicencias';
const NUEVO = process.env.NUEVO_CONTENEDOR ?? 'impulso-license-db';
const FECHA = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
mkdirSync(join(RAIZ, 'respaldos'), { recursive: true });
// Rutas relativas a la raíz (cwd de docker): sin "C:", que docker cp podría confundir con contenedor:ruta en Windows.
const archivoViejo = `respaldos/edulicencias-${FECHA}.dump`;
// Nombre de proyecto de docker compose: la carpeta, en minúsculas y solo con [a-z0-9_-].
const PROYECTO = (process.env.COMPOSE_PROJECT_NAME || basename(RAIZ)).toLowerCase().replace(/[^a-z0-9_-]/g, '');

// Limpieza silenciosa: nunca falla ni muestra errores (también corre al salir por un error).
const limpiar = () => spawnSync(DOCKER, ['rm', '-f', TEMPORAL], { stdio: 'ignore' });
process.on('exit', limpiar);

if (!docker(['version', '--format', '{{.Server.Version}}'], { capturar: true, permitirFallo: true }).ok)
  fallar(`${DOCKER} está instalado pero el servicio no responde: inicie Docker Desktop (Windows) o el servicio docker (Linux).`);

// 1. Origen: el contenedor anterior si está corriendo; si no, uno temporal sobre su volumen (sin publicar puertos).
paso('Base anterior');
let origen;
if (docker(['inspect', '-f', '{{.State.Running}}', VIEJO_CONTENEDOR], { capturar: true, permitirFallo: true }).salida === 'true') {
  origen = VIEJO_CONTENEDOR;
  console.log(`Uso el contenedor en ejecución ${origen}.`);
} else {
  let volumen = process.env.VIEJO_VOLUMEN;
  if (!volumen) {
    const candidatos = docker(['volume', 'ls', '-q'], { capturar: true }).salida.split(/\r?\n/).filter((v) => /(^|_)pgdata$/.test(v));
    volumen = candidatos.find((v) => v === `${PROYECTO}_pgdata`) ?? (candidatos.length === 1 ? candidatos[0] : undefined);
    if (!volumen)
      fallar(candidatos.length
        ? `Hay varios volúmenes posibles (${candidatos.join(', ')}). Indique el de EduLicencias con la variable VIEJO_VOLUMEN.`
        : 'No encontré el volumen de la base anterior (…_pgdata). Indíquelo con la variable VIEJO_VOLUMEN.');
  }
  console.log(`Levanto un contenedor temporal sobre el volumen ${volumen} (sin puertos publicados).`);
  limpiar();
  docker(['run', '-d', '--name', TEMPORAL, '-e', 'POSTGRES_PASSWORD=no-se-usa', '-v', `${volumen}:/var/lib/postgresql/data`, 'postgres:16-alpine'], { capturar: true });
  origen = TEMPORAL;
}
esperar(origen, VIEJO_USUARIO, VIEJO_DB);
const cuenta = (contenedor, usuario, base) =>
  docker(['exec', contenedor, 'psql', '-U', usuario, '-d', base, '-tAc', 'SELECT count(*) FROM solicitudes_licencias'], { capturar: true, permitirFallo: true }).salida || '?';
console.log(`Solicitudes en la base anterior: ${cuenta(origen, VIEJO_USUARIO, VIEJO_DB)}`);

paso(`Respaldo de la base anterior → respaldos/edulicencias-${FECHA}.dump`);
docker(['exec', origen, 'pg_dump', '-U', VIEJO_USUARIO, '-d', VIEJO_DB, '-Fc', '--no-owner', '--no-privileges', '-f', '/tmp/anterior.dump']);
docker(['cp', `${origen}:/tmp/anterior.dump`, archivoViejo]);
docker(['exec', origen, 'rm', '-f', '/tmp/anterior.dump']);

// 2. Destino: la base nueva (la levanta si hace falta).
paso(`Base nueva (${DB})`);
docker(['compose', 'up', '-d', 'postgres']);
esperar(NUEVO, ADMIN, DB);
const psqlNuevo = (sql, opciones) => docker(['exec', NUEVO, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', ADMIN, '-d', DB, '-tAc', sql], opciones);
const tablas = Number(psqlNuevo("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'", { capturar: true }).salida);
if (tablas > 0) {
  if (!REEMPLAZAR)
    fallar(`La base nueva ya tiene ${tablas} tablas (¿corrió migraciones o el seed?). No la toco.\n` +
      '  Si sus datos se pueden descartar (p. ej. solo datos de demostración), vuelva a correr con --reemplazar:\n' +
      '  se respalda antes en respaldos/ y se reemplaza por los datos de la base anterior.');
  paso(`Respaldo de la base nueva → respaldos/impulso_license-antes-${FECHA}.dump`);
  docker(['exec', NUEVO, 'pg_dump', '-U', ADMIN, '-d', DB, '-Fc', '-f', '/tmp/nueva.dump']);
  docker(['cp', `${NUEVO}:/tmp/nueva.dump`, `respaldos/impulso_license-antes-${FECHA}.dump`]);
  docker(['exec', NUEVO, 'rm', '-f', '/tmp/nueva.dump']);
  psqlNuevo(`DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION "${DUENO}";`, { capturar: true });
}

// 3. Restauración en una sola transacción: o entra todo, o no entra nada. Los objetos quedan del dueño del esquema
//    y el usuario de la app recibe solo permisos sobre los datos (script de roles, que es idempotente).
paso(`Restauración de los datos anteriores en ${DB}`);
docker(['cp', archivoViejo, `${NUEVO}:/tmp/anterior.dump`]);
docker(['exec', NUEVO, 'pg_restore', '-U', ADMIN, '-d', DB, `--role=${DUENO}`, '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', '/tmp/anterior.dump']);
docker(['exec', NUEVO, 'rm', '-f', '/tmp/anterior.dump']);
docker(['exec', NUEVO, 'sh', '/docker-entrypoint-initdb.d/01-usuario-app.sh']);
console.log(`Solicitudes en la base nueva: ${cuenta(NUEVO, ADMIN, DB)}`);

console.log(`
✔ Datos pasados. La base anterior y su volumen quedan intactos; los respaldos están en ./respaldos/.

Siga en backend/:
  1. En backend/.env, DATABASE_URL con el usuario de la app y DATABASE_URL_MIGRACIONES con el dueño del esquema:
       DATABASE_URL=postgresql://${APP}:<APP_DB_PASSWORD>@localhost:5433/${DB}?schema=public
       DATABASE_URL_MIGRACIONES=postgresql://${DUENO}:<MIGRACION_DB_PASSWORD>@localhost:5433/${DB}?schema=public
  2. npm run db:deploy                              (migraciones 647-E sobre los datos pasados)
  3. npm run cargar:nomenclador -- --aplicar        (nomenclador oficial 2026; primero sin --aplicar para ver)
  4. npm run migrar:solicitudes                     (simulación + revision-migracion-solicitudes.csv)
     npm run migrar:solicitudes -- --aplicar        (aplica lo que se pudo mapear)
     Completar "variante elegida" en el CSV y:
     npm run migrar:solicitudes -- --resueltas revision-migracion-solicitudes.csv --aplicar
  5. (Opcional) npm run importar:disposiciones -- <excel> para la carga histórica de disposiciones.`);
