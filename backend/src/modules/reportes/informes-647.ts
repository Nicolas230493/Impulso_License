/**
 * Informes de la adecuación normativa (fase 4): planillas IL1 e IL2, estadística mensual, concepto anual (art. 348) y
 * registro de prórrogas del art. 347. Reemplazan las planillas que hoy arma Secretaría a mano.
 *
 * Las columnas son PROVISORIAS hasta tener los modelos reales de cada planilla (pregunta abierta del spec).
 * Los tipos sensibles o reservados se muestran como "Licencia con reserva" a quien no tiene datos_sensibles.ver.
 */
import { ForbiddenException } from '@nestjs/common';
import { EstadoSolicitud, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/actor';
import { formatoISO, hoy, parseFecha } from '../../common/fechas';
import { accesoCompleto, CODIGO_TIPO_RESERVADO, ETIQUETA_TIPO_RESERVADO, puedeVerSensibles } from '../../common/sensitive/sensitive-data.policy';
import { diasSuperpuestos } from '../nomenclador/calculo';
import type { DefinicionInforme, Informe, ParametrosInforme } from './informes';

const OTORGADAS: EstadoSolicitud[] = ['AUTORIZADA', 'FINALIZADA', 'INTERRUMPIDA', 'CANCELADA_CESE'];
const REVISTA: Record<string, string> = { TITULAR: 'Titular', INTERINO: 'Interino', TRANSITORIO: 'Transitorio', SUPLENTE: 'Suplente', PROVISIONAL: 'Provisional' };
const nombre = (d: { apellido: string; nombre: string }) => `${d.apellido}, ${d.nombre}`;

/** Mes pedido (o el actual) como período. */
function mesPedido(p: ParametrosInforme) {
  const h = hoy();
  const anio = Number(p.anio) || h.getUTCFullYear();
  const mes = Number(p.mes) || h.getUTCMonth() + 1;
  return { anio, mes, desde: new Date(Date.UTC(anio, mes - 1, 1)), hasta: new Date(Date.UTC(anio, mes, 0)) };
}

/** Rango: desde/hasta explícitos, o el mes pedido. */
function rango(p: ParametrosInforme): { desde: Date; hasta: Date; parametros: Record<string, string> } {
  if (p.desde || p.hasta) {
    const desde = p.desde ? parseFecha(p.desde) : new Date(Date.UTC(hoy().getUTCFullYear(), 0, 1));
    const hasta = p.hasta ? parseFecha(p.hasta) : hoy();
    return { desde, hasta, parametros: { desde: formatoISO(desde), hasta: formatoISO(hasta) } };
  }
  const m = mesPedido(p);
  return { desde: m.desde, hasta: m.hasta, parametros: { mes: `${String(m.mes).padStart(2, '0')}/${m.anio}` } };
}

function planillaIL(planilla: 'IL1' | 'IL2') {
  return async (prisma: PrismaService, a: Actor, p: ParametrosInforme): Promise<Informe> => {
    const { desde, hasta, parametros } = rango(p);
    const sols = await prisma.solicitudLicencia.findMany({
      where: { institucionId: a.institucionId, estado: { in: OTORGADAS }, motivoNomenclador: { planillaIL: planilla }, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
      include: {
        docente: true, tipoLicencia: { select: { sensible: true } }, motivoNomenclador: true,
        designaciones: { include: { variante: true, designacion: { include: { cargo: true, curso: true, espacio: true } } } },
        instrumentos: true,
      },
      orderBy: [{ fechaDesde: 'asc' }],
    });
    const filas = sols.flatMap((s) => {
      const reservado = (s.tipoLicencia.sensible || s.reservada) && !accesoCompleto(a, s.docenteId);
      const instrumento = s.instrumentos.find((i) => i.tipo === 'DISPOSICION') ?? s.instrumentos.find((i) => i.tipo === 'RESOLUCION');
      return s.designaciones.map((d) => ({
        disposicion: instrumento ? `${instrumento.tipo === 'DISPOSICION' ? 'Disp.' : 'Res.'} ${instrumento.numero}` : '',
        docente: nombre(s.docente), dni: s.docente.dni, legajo: s.docente.legajo,
        designacion: [d.designacion.cargo.nombre, d.designacion.espacio?.nombre, d.designacion.curso?.nombre].filter(Boolean).join(' – '),
        revista: REVISTA[d.revista ?? d.designacion.situacionRevista] ?? '',
        codigo: reservado ? CODIGO_TIPO_RESERVADO : d.variante?.codigo ?? '',
        motivo: reservado ? ETIQUETA_TIPO_RESERVADO : s.motivoNomenclador?.nombre ?? '',
        encuadre: reservado ? '' : d.variante?.encuadreLegal ?? '',
        desde: formatoISO(s.fechaDesde), hasta: formatoISO(s.fechaHasta), dias: s.diasComputados,
        haberes: s.pctHaberes === null ? '' : `${s.pctHaberes} %`, estado: s.estado,
      }));
    });
    return {
      titulo: `Planilla ${planilla} — ${planilla === 'IL1' ? 'licencias comunes' : 'licencias extraordinarias'}`, parametros,
      columnas: [
        { clave: 'disposicion', titulo: 'Instrumento', ancho: 12 }, { clave: 'docente', titulo: 'Docente', ancho: 24 }, { clave: 'dni', titulo: 'DNI', ancho: 10 },
        { clave: 'legajo', titulo: 'Legajo', ancho: 8 }, { clave: 'designacion', titulo: 'Designación', ancho: 26 }, { clave: 'revista', titulo: 'Revista', ancho: 10 },
        { clave: 'codigo', titulo: 'Código', ancho: 9 }, { clave: 'motivo', titulo: 'Motivo', ancho: 24 }, { clave: 'encuadre', titulo: 'Encuadre', ancho: 9 },
        { clave: 'desde', titulo: 'Desde', ancho: 10 }, { clave: 'hasta', titulo: 'Hasta', ancho: 10 }, { clave: 'dias', titulo: 'Días', ancho: 6 }, { clave: 'haberes', titulo: 'Haberes', ancho: 8 },
      ],
      filas,
    };
  };
}

/** Licencias del período por docente, recortadas al rango (días corridos dentro del rango). */
async function licenciasPorDocente(prisma: PrismaService, a: Actor, desde: Date, hasta: Date, docenteId?: string) {
  const sols = await prisma.solicitudLicencia.findMany({
    where: { institucionId: a.institucionId, estado: { in: OTORGADAS }, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde }, docenteId },
    include: { motivoNomenclador: { select: { agrupacion: true } } },
  });
  const acc = new Map<string, { licencias: number; dias: number; porAgrupacion: Record<number, number> }>();
  for (const s of sols) {
    const total = diasSuperpuestos(s.fechaDesde, s.fechaHasta, s.fechaDesde, s.fechaHasta);
    const dentro = diasSuperpuestos(s.fechaDesde, s.fechaHasta, desde, hasta);
    const dias = total ? Math.round((s.diasComputados * dentro) / total) : 0;
    const r = acc.get(s.docenteId) ?? { licencias: 0, dias: 0, porAgrupacion: {} };
    r.licencias++; r.dias += dias;
    const agr = s.motivoNomenclador?.agrupacion ?? 0;
    r.porAgrupacion[agr] = (r.porAgrupacion[agr] ?? 0) + dias;
    acc.set(s.docenteId, r);
  }
  return acc;
}

async function asistenciaPorDocente(prisma: PrismaService, a: Actor, desde: Date, hasta: Date, docenteId?: string) {
  const regs = await prisma.asistencia.findMany({ where: { institucionId: a.institucionId, fecha: { gte: desde, lte: hasta }, docenteId } });
  const acc = new Map<string, { justificadas: number; injustificadas: number; tardanzas: number; conAviso: number; sinAviso: number }>();
  for (const r of regs) {
    const x = acc.get(r.docenteId) ?? { justificadas: 0, injustificadas: 0, tardanzas: 0, conAviso: 0, sinAviso: 0 };
    if (r.estado === 'AUSENTE') { if (r.justificada) x.justificadas++; else x.injustificadas++; }
    if (r.estado === 'TARDANZA') x.tardanzas++;
    if (r.aviso === 'CON_AVISO') x.conAviso++;
    if (r.aviso === 'SIN_AVISO') x.sinAviso++;
    acc.set(r.docenteId, x);
  }
  return acc;
}

export const INFORMES_647: Record<string, DefinicionInforme> = {
  'planilla-il1': {
    titulo: 'Planilla IL1 (licencias comunes)',
    descripcion: 'Licencias del nomenclador asignadas a la planilla IL1 en el mes o período, una fila por designación.',
    generar: planillaIL('IL1'),
  },
  'planilla-il2': {
    titulo: 'Planilla IL2 (licencias extraordinarias)',
    descripcion: 'Largo tratamiento, accidente de trabajo, prórrogas del art. 347, tareas pasivas y demás extraordinarias.',
    generar: planillaIL('IL2'),
  },
  'estadistica-mensual': {
    titulo: 'Estadística mensual',
    descripcion: 'Por docente: días de licencia por agrupación, inasistencias y tardanzas del mes (se carga del 1 al 10).',
    generar: async (prisma, a, p) => {
      const m = mesPedido(p);
      const [lic, asis, docentes] = await Promise.all([
        licenciasPorDocente(prisma, a, m.desde, m.hasta),
        asistenciaPorDocente(prisma, a, m.desde, m.hasta),
        prisma.docente.findMany({ where: { institucionId: a.institucionId, estadoLaboral: 'ACTIVO' }, orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }] }),
      ]);
      return {
        titulo: `Estadística mensual ${String(m.mes).padStart(2, '0')}/${m.anio}`, parametros: { mes: `${String(m.mes).padStart(2, '0')}/${m.anio}` },
        columnas: [
          { clave: 'legajo', titulo: 'Legajo', ancho: 8 }, { clave: 'docente', titulo: 'Docente', ancho: 28 }, { clave: 'dni', titulo: 'DNI', ancho: 10 },
          { clave: 'salud', titulo: 'Salud', ancho: 8 }, { clave: 'otras', titulo: 'Otras lic.', ancho: 9 }, { clave: 'permisos', titulo: 'Permisos', ancho: 9 },
          { clave: 'injustificadas', titulo: 'Inasist. injust.', ancho: 10 }, { clave: 'tardanzas', titulo: 'Tardanzas', ancho: 9 }, { clave: 'total', titulo: 'Total días', ancho: 9 },
        ],
        filas: docentes.map((d) => {
          const l = lic.get(d.id), x = asis.get(d.id);
          const salud = l?.porAgrupacion[1] ?? 0, otras = (l?.porAgrupacion[2] ?? 0) + (l?.porAgrupacion[0] ?? 0), permisos = l?.porAgrupacion[3] ?? 0;
          return { legajo: d.legajo, docente: nombre(d), dni: d.dni, salud, otras, permisos, injustificadas: x?.injustificadas ?? 0, tardanzas: x?.tardanzas ?? 0, total: salud + otras + permisos + (x?.injustificadas ?? 0) };
        }),
      };
    },
  },
  'concepto-anual': {
    titulo: 'Inasistencias para el concepto anual',
    descripcion: 'Por docente y año: licencias, inasistencias justificadas e injustificadas, con y sin aviso, y tardanzas (art. 348).',
    generar: async (prisma, a, p) => {
      const anio = Number(p.anio) || hoy().getUTCFullYear();
      const desde = new Date(Date.UTC(anio, 0, 1)), hasta = new Date(Date.UTC(anio, 11, 31));
      const [lic, asis, docentes] = await Promise.all([
        licenciasPorDocente(prisma, a, desde, hasta, p.docenteId),
        asistenciaPorDocente(prisma, a, desde, hasta, p.docenteId),
        prisma.docente.findMany({ where: { institucionId: a.institucionId, id: p.docenteId }, orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }] }),
      ]);
      return {
        titulo: `Inasistencias para el concepto anual ${anio}`, parametros: { anio: String(anio) },
        columnas: [
          { clave: 'legajo', titulo: 'Legajo', ancho: 8 }, { clave: 'docente', titulo: 'Docente', ancho: 28 }, { clave: 'licencias', titulo: 'Licencias', ancho: 9 },
          { clave: 'dias', titulo: 'Días de licencia', ancho: 10 }, { clave: 'justificadas', titulo: 'Inasist. justif.', ancho: 10 }, { clave: 'injustificadas', titulo: 'Inasist. injust.', ancho: 10 },
          { clave: 'conAviso', titulo: 'Con aviso', ancho: 8 }, { clave: 'sinAviso', titulo: 'Sin aviso', ancho: 8 }, { clave: 'tardanzas', titulo: 'Tardanzas', ancho: 9 },
        ],
        filas: docentes.map((d) => ({ legajo: d.legajo, docente: nombre(d), licencias: lic.get(d.id)?.licencias ?? 0, dias: lic.get(d.id)?.dias ?? 0, ...(asis.get(d.id) ?? { justificadas: 0, injustificadas: 0, conAviso: 0, sinAviso: 0, tardanzas: 0 }) })),
      };
    },
  },
  'registro-art-347': {
    titulo: 'Registro de prórrogas por salud (art. 347)',
    descripcion: 'Prórrogas otorgadas por el Ministerio con su resolución, porcentaje de haberes y acumulado por docente.',
    generar: async (prisma, a, p) => {
      // Es un registro de licencias de salud: solo para quien accede a datos sensibles.
      if (!puedeVerSensibles(a)) throw new ForbiddenException('El registro del art. 347 contiene datos de salud');
      const { desde, hasta, parametros }: { desde: Date; hasta: Date; parametros: Record<string, string> } = p.desde || p.hasta ? rango(p) : { desde: parseFecha('1900-01-01'), hasta: parseFecha('2999-12-31'), parametros: { periodo: 'histórico' } };
      const sols = await prisma.solicitudLicencia.findMany({
        where: { institucionId: a.institucionId, estado: { in: [...OTORGADAS, 'ELEVADA'] as EstadoSolicitud[] }, motivoNomenclador: { codigo: '1.6' }, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
        include: { docente: true, instrumentos: { where: { tipo: 'RESOLUCION' } } },
        orderBy: [{ docenteId: 'asc' }, { fechaDesde: 'asc' }],
      } satisfies Prisma.SolicitudLicenciaFindManyArgs);
      const acumulado = new Map<string, number>();
      return {
        titulo: 'Registro de prórrogas por salud (art. 347)', parametros,
        columnas: [
          { clave: 'docente', titulo: 'Docente', ancho: 26 }, { clave: 'legajo', titulo: 'Legajo', ancho: 8 }, { clave: 'resolucion', titulo: 'Resolución', ancho: 14 },
          { clave: 'desde', titulo: 'Desde', ancho: 10 }, { clave: 'hasta', titulo: 'Hasta', ancho: 10 }, { clave: 'dias', titulo: 'Días', ancho: 6 },
          { clave: 'haberes', titulo: 'Haberes', ancho: 8 }, { clave: 'acumulado', titulo: 'Acumulado', ancho: 9 }, { clave: 'estado', titulo: 'Estado', ancho: 12 },
        ],
        filas: sols.map((s) => {
          const ac = (acumulado.get(s.docenteId) ?? 0) + s.diasComputados;
          acumulado.set(s.docenteId, ac);
          return {
            docente: nombre(s.docente), legajo: s.docente.legajo, resolucion: s.instrumentos.map((i) => i.numero).join(', ') || 'pendiente',
            desde: formatoISO(s.fechaDesde), hasta: formatoISO(s.fechaHasta), dias: s.diasComputados, haberes: s.pctHaberes === null ? '' : `${s.pctHaberes} %`, acumulado: ac, estado: s.estado,
          };
        }),
      };
    },
  },
};
