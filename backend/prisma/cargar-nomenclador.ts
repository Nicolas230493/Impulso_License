/**
 * Carga (o actualiza) el nomenclador oficial 647-E en una base existente, por ejemplo después de pasar los datos de la
 * base anterior. El seed solo lo carga en bases nuevas. Hace lo mismo que la importación desde Administración →
 * Nomenclador, y además deja una auditoría.
 *
 *   npm run cargar:nomenclador                                  → simulación: muestra las diferencias, no escribe
 *   npm run cargar:nomenclador -- --aplicar                     → carga en todas las instituciones
 *   npm run cargar:nomenclador -- --aplicar --institucion COD   → solo en esa institución
 *   npm run cargar:nomenclador -- --archivo otro.xlsx [...]     → con otro Excel (por defecto prisma/datos/nomenclador-647e-2026.xlsx)
 *
 * Es idempotente: si el nomenclador ya está cargado y no cambió, no crea nada nuevo.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { aplicarNomenclador, cargarActual, diferencias, parsearNomenclador } from '../src/modules/nomenclador/importador';
import { CODIGO_REGIMEN_647E } from '../src/modules/nomenclador/nomenclador.service';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const valor = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const VIGENCIA = new Date(Date.UTC(2026, 0, 1));

async function main() {
  const archivo = valor('--archivo') ?? join(__dirname, 'datos', 'nomenclador-647e-2026.xlsx');
  const nuevo = await parsearNomenclador(readFileSync(archivo));
  if (nuevo.errores.length) {
    for (const e of nuevo.errores) console.error(`${e.hoja} fila ${e.fila}: ${e.mensaje}`);
    throw new Error('El Excel tiene errores: corríjalos antes de cargarlo');
  }
  const cod = valor('--institucion');
  const instituciones = await prisma.institucion.findMany({ where: cod ? { codigo: cod } : {}, orderBy: { createdAt: 'asc' } });
  if (!instituciones.length) throw new Error(cod ? `No existe la institución ${cod}` : 'La base no tiene instituciones');

  for (const inst of instituciones) {
    const existente = await prisma.regimenLicencia.findUnique({ where: { institucionId_codigo: { institucionId: inst.id, codigo: CODIGO_REGIMEN_647E } } });
    const actual = existente ? await cargarActual(prisma as never, existente.id) : { motivos: [], variantes: [] };
    const dif = diferencias(nuevo, actual);
    console.log(`${inst.nombre} (${inst.codigo}): ${existente ? 'nomenclador ya cargado' : 'sin nomenclador'}. ` +
      `Motivos nuevos ${dif.motivosNuevos.length}, variantes nuevas ${dif.variantesNuevas.length}, ` +
      `modificadas ${dif.variantesModificadas.length}, a desactivar ${dif.variantesADesactivar.length}.`);
    if (!aplicar) continue;
    const admin = await prisma.usuario.findFirst({ where: { institucionId: inst.id, roles: { some: { rol: { codigo: 'ADMIN' } } } } });
    const res = await prisma.$transaction(async (tx) => {
      const regimen = existente ?? (await tx.regimenLicencia.create({
        data: {
          institucionId: inst.id, codigo: CODIGO_REGIMEN_647E, nombre: 'Estatuto del Docente — Ley 647-E (Chaco)', tipoGestion: 'PUBLICA',
          normativa: 'Ley 647-E, títulos XVI a XIX (arts. 305 a 350). Nomenclador de licencias 2026.', vigenteDesde: VIGENCIA,
        },
      }));
      const r = await aplicarNomenclador(tx, regimen.id, nuevo, { usuarioId: admin?.id, vigenciaDesde: VIGENCIA });
      await tx.auditoria.create({
        data: { institucionId: inst.id, usuarioId: admin?.id, accion: 'IMPORTAR_NOMENCLADOR', entidad: 'regimen_licencia', entidadId: regimen.id, valoresNuevos: { ...r, origen: 'cargar-nomenclador' } },
      });
      return r;
    }, { timeout: 120_000 });
    console.log(`  → cargado: ${res.motivos} motivos, ${res.variantes} variantes, ${res.reglasCreadas} reglas nuevas, ${res.desactivadas} desactivadas.`);
  }
  if (!aplicar) console.log('Simulación: no se modificó nada. Use --aplicar para cargarlo.');
}

main()
  .catch((e) => { console.error(`Error: ${(e as Error).message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
