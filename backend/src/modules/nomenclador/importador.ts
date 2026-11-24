/**
 * Importador del Excel oficial del nomenclador (Ley 647-E). Tres pasos:
 *  1. `parsearNomenclador`: lee las 5 hojas y normaliza cada fila (puro, sin base).
 *  2. `diferencias`: compara contra lo cargado y arma la vista previa (puro).
 *  3. `aplicarNomenclador`: escribe motivos y variantes, desactiva lo que ya no está y crea la regla inicial
 *     de las variantes que todavía no tienen ninguna. Nunca modifica versiones de reglas existentes.
 *
 * Formato esperado (igual en las 5 hojas): fila 1 título de la agrupación, fila 2 encabezados, desde la fila 3 datos.
 * Columnas: A motivo · B agrupación · C motivo · D variante · E encuadre legal · F situación de revista ·
 * G forma de pago · H otorgado por · I a L observaciones.
 */
import { verificarZip } from '../../common/zip-seguro';
import { AutoridadLicencia, CategoriaLicencia, PlanillaIL, Prisma, SituacionRevista } from '@prisma/client';
import ExcelJS from 'exceljs';
import { planillaDeMotivo, reglaBase } from './reglas-base';
import { parsearRegla, ReglaDefinicion, Revista } from './regla.schema';

/** Categoría del tipo espejo (para informes por categoría del régimen anterior). */
export function categoriaDeMotivo(codigo: string): CategoriaLicencia {
  if (codigo === '1.4') return 'MATERNIDAD';
  if (codigo === '1.5' || codigo === '2.2' || codigo === '3.2') return 'FAMILIAR';
  if (codigo.startsWith('1.')) return 'SALUD';
  if (codigo === '2.5' || codigo === '2.9') return 'ESTUDIO';
  if (codigo === '2.6') return 'GREMIAL';
  if (codigo.startsWith('2.') || codigo.startsWith('3.')) return 'ADMINISTRATIVA';
  return 'OTRA';
}

export interface VarianteImportada {
  hoja: string;
  fila: number;
  agrupacion: number;
  codigoMotivo: string;
  codigo: string;
  numero: number;
  nombreMotivo: string;
  denominacion: string | null;
  encuadreLegal: string | null;
  revistas: SituacionRevista[];
  pctHaberes: number | null;
  formaPagoTexto: string | null;
  autoridad: AutoridadLicencia | null;
  otorgaTexto: string | null;
  observaciones: string | null;
}

export interface MotivoImportado { codigo: string; agrupacion: number; numero: number; nombre: string; planillaIL: PlanillaIL }
export interface Aviso { hoja: string; fila: number; codigo?: string; mensaje: string }
export interface Nomenclador { motivos: MotivoImportado[]; variantes: VarianteImportada[]; avisos: Aviso[]; errores: Aviso[] }

const texto = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return String(v.result ?? '');
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
};
const limpio = (s: string) => s.replace(/\s+/g, ' ').trim();
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Titular", "Interino/Interina", "Suplente", "Titular / Interino/" → revistas. Interino incluye transitorio (art. 329). */
export function normalizarRevistas(t: string): { revistas: SituacionRevista[]; reconocido: boolean } {
  const s = sinTildes(t);
  if (!s) return { revistas: [], reconocido: true };
  const r = new Set<SituacionRevista>();
  if (s.includes('titular')) r.add('TITULAR');
  if (s.includes('interin')) { r.add('INTERINO'); r.add('TRANSITORIO'); }
  if (s.includes('transitori')) r.add('TRANSITORIO');
  if (s.includes('suplente')) r.add('SUPLENTE');
  return { revistas: [...r], reconocido: r.size > 0 };
}

export function normalizarPago(t: string): number | null {
  const s = sinTildes(t);
  if (!s) return null;
  if (s.includes('sin goce')) return 0;
  const pct = /(\d+)\s*%/.exec(s);
  if (pct) return Number(pct[1]);
  if (s.includes('con goce')) return 100;
  return null;
}

const AUTORIDADES: [RegExp, AutoridadLicencia][] = [
  [/bienestar/, 'BIENESTAR'],
  [/super\.? ?inmediato|superior inmediato/, 'SUPERIOR_INMEDIATO'],
  [/director regional|^regional$/, 'DIRECTOR_REGIONAL'],
  [/supervisor/, 'SUPERVISOR'],
  [/ministro/, 'MINISTRO'],
  [/subsecretari|sub\. de educ/, 'SUBSECRETARIO'],
  [/j\. ?clasif|junta/, 'JUNTA'],
  [/^director$/, 'DIRECTOR'],
];

/** Autoridad principal (con "Ministro/ Subsecretario" se toma Ministro; la alternativa queda en la regla). */
export function normalizarAutoridad(t: string): { autoridad: AutoridadLicencia | null; reconocido: boolean } {
  const s = sinTildes(limpio(t));
  if (!s) return { autoridad: null, reconocido: true };
  const hit = AUTORIDADES.find(([re]) => re.test(s));
  return { autoridad: hit?.[1] ?? null, reconocido: !!hit };
}

const numero = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN);

export async function parsearNomenclador(archivo: Buffer): Promise<Nomenclador> {
  // Antes de descomprimir con ExcelJS: rechaza bombas zip y archivos malformados.
  verificarZip(archivo);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(archivo as never);
  const motivos = new Map<string, MotivoImportado>();
  const variantes: VarianteImportada[] = [];
  const avisos: Aviso[] = [];
  const errores: Aviso[] = [];
  const vistos = new Map<string, string>();

  for (const ws of wb.worksheets) {
    const encabezado = ws.getRow(2).values as ExcelJS.CellValue[];
    if (!sinTildes(texto(encabezado[1])).includes('denominacion') || !sinTildes(texto(encabezado[6])).includes('revista')) {
      errores.push({ hoja: ws.name, fila: 2, mensaje: 'La hoja no tiene el formato esperado (A: denominación del motivo … F: situación de revista)' });
      continue;
    }
    ws.eachRow((row, nFila) => {
      if (nFila < 3) return;
      const v = row.values as ExcelJS.CellValue[];
      const c = (k: number) => limpio(texto(v[k]));
      if (![1, 2, 3, 4, 5, 6, 7, 8].some((k) => c(k))) return;
      const agr = numero(c(2)), mot = numero(c(3));
      const vari = c(4) === '' ? 0 : numero(c(4));
      if (![agr, mot, vari].every(Number.isInteger)) {
        errores.push({ hoja: ws.name, fila: nFila, mensaje: `Código inválido: "${c(2)}.${c(3)}.${c(4)}"` });
        return;
      }
      const codigoMotivo = `${agr}.${mot}`;
      const codigo = `${codigoMotivo}.${vari}`;
      const nombre = c(1);
      if (vistos.has(codigo)) {
        errores.push({ hoja: ws.name, fila: nFila, codigo, mensaje: `Código repetido (también en ${vistos.get(codigo)})` });
        return;
      }
      vistos.set(codigo, `${ws.name} fila ${nFila}`);

      if (!motivos.has(codigoMotivo)) motivos.set(codigoMotivo, { codigo: codigoMotivo, agrupacion: agr, numero: mot, nombre, planillaIL: planillaDeMotivo(codigoMotivo) });
      const nombreMotivo = motivos.get(codigoMotivo)!.nombre;

      const rev = normalizarRevistas(c(6));
      if (!rev.reconocido) avisos.push({ hoja: ws.name, fila: nFila, codigo, mensaje: `Situación de revista no reconocida: "${c(6)}"` });
      if (/interina/i.test(c(6))) avisos.push({ hoja: ws.name, fila: nFila, codigo, mensaje: 'Revista escrita "Interina": se toma como Interino' });
      const aut = normalizarAutoridad(c(8));
      if (!aut.reconocido) avisos.push({ hoja: ws.name, fila: nFila, codigo, mensaje: `Autoridad no reconocida: "${c(8)}"` });
      if (!c(8) && agr <= 3) avisos.push({ hoja: ws.name, fila: nFila, codigo, mensaje: 'El nomenclador no indica quién otorga esta variante' });
      if (/-\s*$/.test(c(5))) avisos.push({ hoja: ws.name, fila: nFila, codigo, mensaje: `Encuadre legal incompleto: "${c(5)}"` });
      // Interinos y transitorios: arts. 329-337; suplentes: arts. 338-346 (solo aplica a licencias y permisos).
      if (agr <= 3 && rev.revistas.includes('SUPLENTE') && !rev.revistas.includes('INTERINO') && /^33[0-7]\b/.test(c(5).replace(/\s/g, '')))
        avisos.push({ hoja: ws.name, fila: nFila, codigo, mensaje: `Variante de suplente encuadrada en ${c(5)} (artículo de interinos); debería ser el 34x equivalente` });
      const pct = normalizarPago(c(7));
      if (c(7) && pct === null) avisos.push({ hoja: ws.name, fila: nFila, codigo, mensaje: `Forma de pago no reconocida: "${c(7)}"` });

      const obs = [...new Set([9, 10, 11, 12, 13].map(c).filter(Boolean))].join(' — ');
      variantes.push({
        hoja: ws.name, fila: nFila, agrupacion: agr, codigoMotivo, codigo, numero: vari, nombreMotivo,
        denominacion: nombre && nombre !== nombreMotivo ? nombre : null,
        encuadreLegal: c(5) || null, revistas: rev.revistas, pctHaberes: pct, formaPagoTexto: c(7) || null,
        autoridad: aut.autoridad, otorgaTexto: c(8) || null, observaciones: obs || null,
      });
    });
  }
  for (const v of variantes) {
    if (!reglaBase({ codigo: v.codigo, revistas: v.revistas as Revista[], pctHaberes: v.pctHaberes }))
      avisos.push({ hoja: v.hoja, fila: v.fila, codigo: v.codigo, mensaje: 'Sin regla inicial: completar la regla antes de usar esta variante' });
  }
  return { motivos: [...motivos.values()], variantes, avisos, errores };
}

// ───────────── Vista previa ─────────────

type VarianteActual = Pick<VarianteImportada, 'codigo' | 'denominacion' | 'encuadreLegal' | 'revistas' | 'pctHaberes' | 'formaPagoTexto' | 'autoridad' | 'otorgaTexto' | 'observaciones'> & { activa: boolean; tieneReglas: boolean };
type MotivoActual = Pick<MotivoImportado, 'codigo' | 'nombre' | 'planillaIL'> & { activo: boolean };
export interface Cambio { campo: string; antes: unknown; despues: unknown }

const CAMPOS_VARIANTE = ['denominacion', 'encuadreLegal', 'revistas', 'pctHaberes', 'formaPagoTexto', 'autoridad', 'otorgaTexto', 'observaciones'] as const;
const igual = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? null) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? null);

export function diferencias(nuevo: Nomenclador, actual: { motivos: MotivoActual[]; variantes: VarianteActual[] }) {
  const motActual = new Map(actual.motivos.map((m) => [m.codigo, m]));
  const varActual = new Map(actual.variantes.map((v) => [v.codigo, v]));
  const motivosNuevos = nuevo.motivos.filter((m) => !motActual.has(m.codigo)).map((m) => m.codigo);
  const motivosModificados = nuevo.motivos
    .filter((m) => motActual.has(m.codigo))
    .map((m) => ({ codigo: m.codigo, cambios: [...(igual(m.nombre, motActual.get(m.codigo)!.nombre) ? [] : [{ campo: 'nombre', antes: motActual.get(m.codigo)!.nombre, despues: m.nombre }])] }))
    .filter((m) => m.cambios.length);
  const variantesNuevas = nuevo.variantes.filter((v) => !varActual.has(v.codigo)).map((v) => v.codigo);
  const variantesModificadas = nuevo.variantes
    .filter((v) => varActual.has(v.codigo))
    .map((v) => {
      const a = varActual.get(v.codigo)!;
      const cambios: Cambio[] = CAMPOS_VARIANTE.filter((k) => !igual(v[k], a[k])).map((k) => ({ campo: k, antes: a[k], despues: v[k] }));
      if (!a.activa) cambios.push({ campo: 'activa', antes: false, despues: true });
      return { codigo: v.codigo, cambios };
    })
    .filter((v) => v.cambios.length);
  const enExcel = new Set(nuevo.variantes.map((v) => v.codigo));
  const variantesADesactivar = actual.variantes.filter((v) => v.activa && !enExcel.has(v.codigo)).map((v) => v.codigo);
  const sinCambios = nuevo.variantes.length - variantesNuevas.length - variantesModificadas.length;
  return { motivosNuevos, motivosModificados, variantesNuevas, variantesModificadas, variantesADesactivar, sinCambios, avisos: nuevo.avisos, errores: nuevo.errores };
}

// ───────────── Aplicación ─────────────

type Cliente = Prisma.TransactionClient;

export async function cargarActual(tx: Cliente, regimenId: string) {
  const motivos = await tx.motivoLicencia.findMany({ where: { regimenId }, include: { variantes: { include: { _count: { select: { reglas: true } } } } } });
  return {
    motivos: motivos.map((m) => ({ codigo: m.codigo, nombre: m.nombre, planillaIL: m.planillaIL, activo: m.activo })),
    variantes: motivos.flatMap((m) => m.variantes.map((v) => ({ ...v, tieneReglas: v._count.reglas > 0 }))),
  };
}

export async function aplicarNomenclador(tx: Cliente, regimenId: string, nuevo: Nomenclador, opciones: { usuarioId?: string; vigenciaDesde: Date }) {
  if (nuevo.errores.length) throw new Error(`El archivo tiene ${nuevo.errores.length} error(es); corríjalos antes de aplicar`);
  const idMotivo = new Map<string, string>();
  for (const m of nuevo.motivos) {
    const r = await tx.motivoLicencia.upsert({
      where: { regimenId_codigo: { regimenId, codigo: m.codigo } },
      create: { regimenId, ...m },
      update: { nombre: m.nombre, agrupacion: m.agrupacion, numero: m.numero, activo: true },
    });
    idMotivo.set(m.codigo, r.id);
  }
  let reglasCreadas = 0;
  for (const v of nuevo.variantes) {
    const motivoId = idMotivo.get(v.codigoMotivo)!;
    const datos = {
      numero: v.numero, denominacion: v.denominacion, encuadreLegal: v.encuadreLegal, revistas: v.revistas, pctHaberes: v.pctHaberes,
      formaPagoTexto: v.formaPagoTexto, autoridad: v.autoridad, otorgaTexto: v.otorgaTexto, observaciones: v.observaciones, activa: true,
    };
    const variante = await tx.varianteLicencia.upsert({
      where: { motivoId_codigo: { motivoId, codigo: v.codigo } },
      create: { motivoId, codigo: v.codigo, ...datos },
      update: datos,
      include: { _count: { select: { reglas: true } } },
    });
    if (variante._count.reglas === 0) {
      const base = reglaBase({ codigo: v.codigo, revistas: v.revistas as Revista[], pctHaberes: v.pctHaberes });
      if (base) {
        const definicion = parsearRegla(base); // valida antes de guardar
        await tx.reglaVariante.create({
          data: { varianteId: variante.id, version: 1, vigenciaDesde: opciones.vigenciaDesde, definicion: definicion as unknown as Prisma.InputJsonValue, nota: 'Regla inicial del nomenclador 2026', creadaPorId: opciones.usuarioId },
        });
        reglasCreadas++;
      }
    }
  }
  // Tipo espejo de cada motivo: la solicitud sigue teniendo un tipo, y lo que ya lee el tipo (informes, calendario,
  // bandeja, política de datos sensibles) funciona igual. Se administra solo desde el nomenclador.
  const reglasPorMotivo = new Map<string, ReglaDefinicion[]>();
  for (const v of nuevo.variantes) {
    const b = reglaBase({ codigo: v.codigo, revistas: v.revistas as Revista[], pctHaberes: v.pctHaberes });
    if (b) reglasPorMotivo.set(v.codigoMotivo, [...(reglasPorMotivo.get(v.codigoMotivo) ?? []), parsearRegla(b)]);
  }
  for (const m of nuevo.motivos) {
    const reglas = reglasPorMotivo.get(m.codigo) ?? [];
    const variantesM = nuevo.variantes.filter((v) => v.codigoMotivo === m.codigo);
    const docs = [...new Set(reglas.flatMap((r) => r.documentacion.filter((d) => d.obligatoria && d.desde === 'PRESENTACION').map((d) => d.nombre)))];
    const datos = {
      codigo: m.codigo, nombre: m.nombre, categoria: categoriaDeMotivo(m.codigo), articulo: variantesM[0]?.encuadreLegal ?? null,
      documentacionRequerida: reglas.length ? docs.filter((d) => reglas.every((r) => r.documentacion.some((x) => x.nombre === d && x.obligatoria))) : [],
      formaComputo: reglas[0]?.unidad === 'HABILES' ? ('DIAS_HABILES' as const) : ('DIAS_CORRIDOS' as const),
      conGoceHaberes: variantesM.some((v) => (v.pctHaberes ?? 0) > 0),
      autoridadCompetente: variantesM[0]?.otorgaTexto ?? null,
      sensible: reglas.some((r) => r.sensible || r.reservada),
      vigenteDesde: opciones.vigenciaDesde,
      activo: m.agrupacion <= 3,
    };
    await tx.tipoLicencia.upsert({ where: { motivoId: idMotivo.get(m.codigo)! }, create: { ...datos, regimenId, motivoId: idMotivo.get(m.codigo)! }, update: datos });
  }

  const codigos = nuevo.variantes.map((v) => v.codigo);
  const desactivadas = await tx.varianteLicencia.updateMany({
    where: { motivo: { regimenId }, codigo: { notIn: codigos }, activa: true },
    data: { activa: false },
  });
  return { motivos: nuevo.motivos.length, variantes: nuevo.variantes.length, reglasCreadas, desactivadas: desactivadas.count };
}
