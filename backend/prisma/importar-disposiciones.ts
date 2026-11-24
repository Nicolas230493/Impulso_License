/**
 * Carga histórica del Excel de disposiciones de Secretaría (fase 5).
 *
 *   npm run importar:disposiciones -- --plantilla                     → genera plantilla-disposiciones.xlsx
 *   npm run importar:disposiciones -- <archivo.xlsx> [--institucion COD] → simulación con reporte
 *   npm run importar:disposiciones -- <archivo.xlsx> --aplicar          → aplica
 *
 * Columnas (fila 1 = encabezados): Número | Fecha | DNI | Código | Desde | Hasta | Observaciones
 * - Número de disposición "N/AAAA" (o solo N: se toma el año de la fecha). Código = variante o motivo del nomenclador.
 * - Si ya existe una solicitud del docente con ese motivo y período, se le asocia la disposición; si no, se crea la
 *   licencia histórica (FINALIZADA, o AUTORIZADA si todavía no terminó) con las designaciones vigentes en esa fecha.
 * - La secuencia de disposiciones del año se ajusta al mayor número cargado, para no repetir números.
 * - El formato real del Excel de Secretaría no se conoce todavía: ajustar las columnas cuando se tenga un ejemplo.
 */
import { PrismaClient, SituacionRevista } from '@prisma/client';
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { formatoISO, hoy, parseFecha } from '../src/common/fechas';
import { resolverVariantes } from '../src/modules/licencias/variantes';
import { formatoNumero } from '../src/modules/licencias/reglas-negocio';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const COLUMNAS = ['Número', 'Fecha', 'DNI', 'Código', 'Desde', 'Hasta', 'Observaciones'];

const texto = (v: ExcelJS.CellValue) => (v instanceof Date ? formatoISO(v) : v && typeof v === 'object' && 'text' in v ? String(v.text) : String(v ?? '')).trim();
const fecha = (v: ExcelJS.CellValue) => {
  const t = texto(v);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return parseFecha(dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : t);
};

async function plantilla() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Disposiciones');
  ws.addRow(COLUMNAS).font = { bold: true };
  ws.addRow(['15/2025', '10/03/2025', '23456789', '1.1.1', '03/03/2025', '07/03/2025', 'Ejemplo: borrar esta fila']);
  await wb.xlsx.writeFile('plantilla-disposiciones.xlsx');
  console.log('Plantilla generada: plantilla-disposiciones.xlsx');
}

async function main() {
  if (args.includes('--plantilla')) return plantilla();
  const ruta = args.find((x) => !x.startsWith('--') && args[args.indexOf(x) - 1] !== '--institucion');
  if (!ruta) throw new Error('Indique el archivo .xlsx (o --plantilla)');
  const codInst = args[args.indexOf('--institucion') + 1];
  const inst = args.includes('--institucion') ? await prisma.institucion.findUnique({ where: { codigo: codInst } }) : await prisma.institucion.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!inst) throw new Error('Institución inexistente');
  const regimen = await prisma.regimenLicencia.findUniqueOrThrow({ where: { institucionId_codigo: { institucionId: inst.id, codigo: 'LEY-647E' } } });
  const motivos = await prisma.motivoLicencia.findMany({ where: { regimenId: regimen.id }, include: { variantes: { where: { activa: true } }, tipoEspejo: true } });
  const admin = await prisma.usuario.findFirst({ where: { institucionId: inst.id, roles: { some: { rol: { codigo: 'ADMIN' } } } } });
  if (!admin) throw new Error('La institución no tiene un administrador para registrar la carga');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(ruta) as never);
  const ws = wb.worksheets[0];
  const enc = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(texto);
  if (COLUMNAS.some((c, i) => enc[i]?.toLowerCase() !== c.toLowerCase())) throw new Error(`Encabezados esperados: ${COLUMNAS.join(' | ')}`);

  const reporte: string[] = ['fila;resultado;detalle'];
  const maxPorAnio = new Map<number, number>();
  let asociadas = 0, creadas = 0, errores = 0;
  for (let n = 2; n <= ws.rowCount; n++) {
    const v = ws.getRow(n).values as ExcelJS.CellValue[];
    if (!texto(v[1]) && !texto(v[3])) continue;
    const anotar = (resultado: string, detalle: string) => reporte.push(`${n};${resultado};"${detalle.replace(/"/g, '""')}"`);
    try {
      const fDisp = fecha(v[2]), desde = fecha(v[5]), hasta = fecha(v[6]);
      const [num, anioTxt] = texto(v[1]).split('/');
      const anio = Number(anioTxt) || fDisp.getUTCFullYear();
      const numero = `${Number(num)}/${anio}`;
      if (!Number(num)) throw new Error(`Número de disposición inválido: ${texto(v[1])}`);
      const codigo = texto(v[4]);
      const motivo = motivos.find((m) => m.codigo === codigo || codigo.startsWith(`${m.codigo}.`));
      if (!motivo?.tipoEspejo) throw new Error(`Código del nomenclador desconocido: ${codigo}`);
      const docente = await prisma.docente.findFirst({ where: { institucionId: inst.id, dni: texto(v[3]) }, include: { designaciones: true } });
      if (!docente) throw new Error(`No hay docente con DNI ${texto(v[3])}`);
      if (await prisma.instrumentoLegal.findFirst({ where: { institucionId: inst.id, tipo: 'DISPOSICION', numero } })) { anotar('OMITIDA', `La disposición ${numero} ya está cargada`); continue; }
      maxPorAnio.set(anio, Math.max(maxPorAnio.get(anio) ?? 0, Number(num)));

      const existente = await prisma.solicitudLicencia.findFirst({ where: { docenteId: docente.id, motivoId: motivo.id, fechaDesde: desde, fechaHasta: hasta } });
      if (existente) {
        if (aplicar) await prisma.instrumentoLegal.create({ data: { institucionId: inst.id, solicitudId: existente.id, tipo: 'DISPOSICION', numero, fecha: fDisp, emisor: 'Dirección', favorable: true, registradoPorId: admin.id } });
        asociadas++; anotar('ASOCIADA', `${numero} → solicitud ${existente.numero}`); continue;
      }
      const vigentes = docente.designaciones.filter((d) => d.fechaDesde <= hasta && (!d.fechaHasta || d.fechaHasta >= desde));
      if (!vigentes.length) throw new Error('El docente no tenía designaciones vigentes en ese período');
      const variantes = codigo.split('.').length === 3 ? motivo.variantes.filter((x) => x.codigo === codigo) : motivo.variantes;
      const res = resolverVariantes(variantes, vigentes);
      if (res.errores.length) throw new Error(res.errores.join(' / '));
      if (aplicar) {
        await prisma.$transaction(async (tx) => {
          const [seq] = await tx.$queryRaw<{ ultimo: number }[]>`
            INSERT INTO "secuencias_solicitudes" ("institucion_id", "anio", "ultimo") VALUES (${inst.id}, ${desde.getUTCFullYear()}, 1)
            ON CONFLICT ("institucion_id", "anio") DO UPDATE SET "ultimo" = "secuencias_solicitudes"."ultimo" + 1 RETURNING "ultimo"`;
          const s = await tx.solicitudLicencia.create({
            data: {
              institucionId: inst.id, numero: formatoNumero(inst.codigo, desde.getUTCFullYear(), Number(seq.ultimo)), docenteId: docente.id,
              tipoLicenciaId: motivo.tipoEspejo!.id, motivoId: motivo.id, fechaDesde: desde, fechaHasta: hasta,
              diasComputados: Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1, motivo: texto(v[7]) || null,
              estado: hasta < hoy() ? 'FINALIZADA' : 'AUTORIZADA', solicitanteId: admin.id, canalIngreso: 'CUADERNO',
              designaciones: { create: res.asignadas.map((x) => ({ designacionId: x.designacionId, varianteId: x.varianteId, revista: x.revista as SituacionRevista })) },
              historial: { create: { estadoNuevo: hasta < hoy() ? 'FINALIZADA' : 'AUTORIZADA', usuarioId: admin.id, comentario: `Carga histórica de la disposición ${numero}` } },
              instrumentos: { create: { institucionId: inst.id, tipo: 'DISPOSICION', numero, fecha: fDisp, emisor: 'Dirección', favorable: true, registradoPorId: admin.id } },
            },
          });
          await tx.auditoria.create({ data: { institucionId: inst.id, usuarioId: admin.id, accion: 'CARGA_HISTORICA', entidad: 'solicitud', entidadId: s.id, valoresNuevos: { disposicion: numero, codigo } } });
        });
      }
      creadas++; anotar('CREADA', `${numero}: ${codigo} del ${formatoISO(desde)} al ${formatoISO(hasta)}`);
    } catch (e) {
      errores++; anotar('ERROR', (e as Error).message);
    }
  }
  if (aplicar)
    for (const [anio, ultimo] of maxPorAnio)
      await prisma.$executeRaw`
        INSERT INTO "secuencias_documentos" ("institucion_id", "tipo", "anio", "ultimo") VALUES (${inst.id}, 'DISPOSICION', ${anio}, ${ultimo})
        ON CONFLICT ("institucion_id", "tipo", "anio") DO UPDATE SET "ultimo" = GREATEST("secuencias_documentos"."ultimo", ${ultimo})`;
  writeFileSync('reporte-carga-disposiciones.csv', reporte.join('\n'), 'utf8');
  console.log(`${aplicar ? 'Aplicado' : 'Simulación'}: ${asociadas} asociadas, ${creadas} licencias históricas, ${errores} con error. Detalle: reporte-carga-disposiciones.csv`);
}

main()
  .catch((e) => { console.error(`Error: ${(e as Error).message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
