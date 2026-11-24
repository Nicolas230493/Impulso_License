/**
 * Migración de las solicitudes del régimen anterior a códigos del nomenclador 647-E (fase 5).
 *
 *   npm run migrar:solicitudes                 → simulación: muestra qué se mapea y escribe el reporte de revisión
 *   npm run migrar:solicitudes -- --aplicar    → aplica lo que se pudo mapear
 *   npm run migrar:solicitudes -- --resueltas revision.csv [--aplicar]
 *       → suma las decisiones manuales: en el CSV de revisión, completar la columna "variante elegida" con el código
 *         de la variante (p. ej. 1.5.1). Si las designaciones tienen distinta revista, un código por revista separados
 *         por coma (p. ej. "1.5.1, 1.5.5"). Las filas sin completar siguen pendientes.
 *
 * - El mapeo tipo → motivo está en prisma/datos/mapeo-tipos-anteriores.json (null = revisión manual).
 * - La variante de cada designación sale de su revista; si hay más de una posible queda para revisión manual.
 * - La numeración LIC- no cambia (correlatividad). Se registra en la auditoría.
 */
import { PrismaClient, SituacionRevista } from '@prisma/client';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolverVariantes } from '../src/modules/licencias/variantes';

const prisma = new PrismaClient();
const aplicar = process.argv.includes('--aplicar');
const mapeo: Record<string, string | null> = JSON.parse(readFileSync(join(__dirname, 'datos', 'mapeo-tipos-anteriores.json'), 'utf8'));

/** Lee un CSV separado por ";" con comillas dobles (el formato que escribe este script; Excel lo respeta al guardar). */
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  const t = texto.replace(/^﻿/, '');
  const cerrarFila = () => {
    fila.push(celda);
    celda = '';
    if (fila.some((x) => x.trim())) filas.push(fila);
    fila = [];
  };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ';') { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      cerrarFila();
    } else celda += c;
  }
  cerrarFila();
  return filas;
}

/** Número de solicitud → códigos de variante elegidos a mano (opción --resueltas). */
function leerResueltas(): Map<string, string[]> {
  const i = process.argv.indexOf('--resueltas');
  if (i < 0) return new Map();
  const archivo = process.argv[i + 1];
  if (!archivo || archivo.startsWith('--')) throw new Error('Falta el archivo después de --resueltas');
  const [encabezado = [], ...filas] = leerCsv(readFileSync(archivo, 'utf8'));
  const col = encabezado.findIndex((h) => h.trim().toLowerCase() === 'variante elegida');
  if (col < 0) throw new Error('El CSV no tiene la columna "variante elegida"');
  const res = new Map<string, string[]>();
  for (const f of filas) {
    const codigos = (f[col] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (f[0]?.trim() && codigos.length) res.set(f[0].trim(), codigos);
  }
  return res;
}

interface Revision { numero: string; docente: string; tipo: string; motivo: string; problema: string }
const csv = (filas: Revision[]) =>
  ['numero;docente;tipo anterior;motivo propuesto;problema;variante elegida', ...filas.map((f) => [f.numero, f.docente, f.tipo, f.motivo, f.problema, ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'))].join('\n');

async function main() {
  const resueltas = leerResueltas();
  const revision: Revision[] = [];
  let migradas = 0;
  const instituciones = await prisma.institucion.findMany();
  for (const inst of instituciones) {
    const regimen = await prisma.regimenLicencia.findUnique({ where: { institucionId_codigo: { institucionId: inst.id, codigo: 'LEY-647E' } } });
    if (!regimen) { console.log(`${inst.nombre}: sin nomenclador cargado, se omite.`); continue; }
    const motivos = await prisma.motivoLicencia.findMany({ where: { regimenId: regimen.id }, include: { variantes: { where: { activa: true } }, tipoEspejo: true } });
    const porCodigo = new Map(motivos.map((m) => [m.codigo, m]));
    const motivoDeVariante = new Map(motivos.flatMap((m) => m.variantes.map((v) => [v.codigo, m] as const)));
    const pendientes = await prisma.solicitudLicencia.findMany({
      where: { institucionId: inst.id, motivoId: null },
      include: { tipoLicencia: true, docente: true, designaciones: { include: { designacion: true } } },
      orderBy: { fechaSolicitud: 'asc' },
    });
    for (const s of pendientes) {
      const base = { numero: s.numero, docente: `${s.docente.apellido}, ${s.docente.nombre}`, tipo: s.tipoLicencia.codigo };
      const elegidos = resueltas.get(s.numero) ?? [];
      let codigo = mapeo[s.tipoLicencia.codigo];
      if (elegidos.length) {
        const ms = new Set(elegidos.map((c) => motivoDeVariante.get(c)?.codigo));
        if (ms.has(undefined)) { revision.push({ ...base, motivo: codigo ?? '', problema: `Variante elegida inexistente o inactiva: ${elegidos.join(', ')}` }); continue; }
        if (ms.size > 1) { revision.push({ ...base, motivo: codigo ?? '', problema: 'Las variantes elegidas son de motivos distintos' }); continue; }
        codigo = [...ms][0]!;
      }
      if (!codigo) { revision.push({ ...base, motivo: '', problema: codigo === null ? 'Sin equivalente directo: elegir el motivo a mano' : 'Tipo no previsto en el mapeo' }); continue; }
      const motivo = porCodigo.get(codigo);
      if (!motivo?.tipoEspejo) { revision.push({ ...base, motivo: codigo, problema: 'El motivo no existe en el nomenclador cargado' }); continue; }
      // La revista que se congela es la de la designación hoy; para licencias viejas conviene revisarla.
      const desigs = s.designaciones.map((d) => ({ id: d.designacionId, situacionRevista: d.designacion.situacionRevista }));
      // Decisión manual: a cada designación le toca la variante elegida que corresponde a su revista.
      const elecciones = desigs.flatMap((d) => {
        const v = motivo.variantes.find((x) => elegidos.includes(x.codigo) && (!x.revistas.length || x.revistas.includes(d.situacionRevista)));
        return v ? [{ designacionId: d.id, varianteId: v.id }] : [];
      });
      if (desigs.some((d) => d.situacionRevista === 'PROVISIONAL')) {
        revision.push({ ...base, motivo: codigo, problema: 'Una designación es "Provisional", que no existe en la Ley 647-E: corrija su situación de revista (interino o transitorio) en la ficha del docente y vuelva a correr la migración' });
        continue;
      }
      const res = resolverVariantes(motivo.variantes, desigs, elecciones);
      if (res.errores.length) { revision.push({ ...base, motivo: codigo, problema: res.errores.join(' / ') }); continue; }
      if (aplicar) {
        await prisma.$transaction(async (tx) => {
          await tx.solicitudLicencia.update({ where: { id: s.id }, data: { motivoId: motivo.id, tipoLicenciaId: motivo.tipoEspejo!.id, version: { increment: 1 } } });
          for (const x of res.asignadas)
            await tx.solicitudDesignacion.update({ where: { solicitudId_designacionId: { solicitudId: s.id, designacionId: x.designacionId } }, data: { varianteId: x.varianteId, revista: x.revista as SituacionRevista } });
          await tx.auditoria.create({
            data: { institucionId: inst.id, accion: 'MIGRAR_A_NOMENCLADOR', entidad: 'solicitud', entidadId: s.id, valoresAnteriores: { tipo: s.tipoLicencia.codigo }, valoresNuevos: { motivo: codigo, variantes: res.asignadas.map((x) => x.varianteId), manual: elegidos.length > 0 } },
          });
        });
      }
      migradas++;
    }
  }
  const archivo = join(process.cwd(), 'revision-migracion-solicitudes.csv');
  writeFileSync(archivo, csv(revision), 'utf8');
  console.log(`${aplicar ? 'Migradas' : 'Se pueden migrar'}: ${migradas}. Para revisión manual: ${revision.length} (detalle en ${archivo}).`);
  if (!aplicar) console.log('Simulación: no se modificó nada. Use --aplicar para escribir los cambios.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
