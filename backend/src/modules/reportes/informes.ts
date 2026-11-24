import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/actor';
import { diasCorridos, formatoISO, hoy, parseFecha } from '../../common/fechas';
import { codigoYNombreTipo, nombreTipo } from '../../common/sensitive/sensitive-data.policy';
import { INFORMES_647 } from './informes-647';

export interface Columna { clave: string; titulo: string; ancho?: number }
export interface Informe { titulo: string; columnas: Columna[]; filas: Record<string, string | number | null>[]; parametros: Record<string, string> }
export interface ParametrosInforme { desde?: string; hasta?: string; anio?: string; mes?: string; docenteId?: string }

const OTORGADAS = { in: ['AUTORIZADA', 'FINALIZADA'] } as Prisma.EnumEstadoSolicitudFilter;
const nombre = (d: { apellido: string; nombre: string }) => `${d.apellido}, ${d.nombre}`;

function periodo(p: ParametrosInforme) {
  const anio = new Date().getFullYear();
  const desde = p.desde ? parseFecha(p.desde) : new Date(Date.UTC(anio, 0, 1));
  const hasta = p.hasta ? parseFecha(p.hasta) : new Date(Date.UTC(anio, 11, 31));
  return { desde, hasta, parametros: { desde: formatoISO(desde), hasta: formatoISO(hasta) } };
}

type Generador = (prisma: PrismaService, a: Actor, p: ParametrosInforme) => Promise<Informe>;

export interface DefinicionInforme { titulo: string; descripcion: string; generar: Generador }

/**
 * Catálogo de informes. Es un Map (hallazgo 25): una clave como "__proto__" o "constructor" no resuelve
 * a propiedades heredadas de Object. Los nombres de tipos sensibles pasan por la política única (hallazgo 3).
 */
export const INFORMES = new Map<string, DefinicionInforme>(Object.entries({
  'licencias-por-docente': {
    titulo: 'Licencias por docente',
    descripcion: 'Cantidad de licencias otorgadas y días computados por docente en el período.',
    generar: async (prisma, a, p) => {
      const { desde, hasta, parametros } = periodo(p);
      const sols = await prisma.solicitudLicencia.findMany({
        where: { institucionId: a.institucionId, estado: OTORGADAS, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
        include: { docente: true },
      });
      const acc = new Map<string, { legajo: string; docente: string; cantidad: number; dias: number }>();
      for (const s of sols) {
        const r = acc.get(s.docenteId) ?? { legajo: s.docente.legajo, docente: nombre(s.docente), cantidad: 0, dias: 0 };
        r.cantidad++; r.dias += s.diasComputados;
        acc.set(s.docenteId, r);
      }
      return {
        titulo: 'Licencias por docente', parametros,
        columnas: [{ clave: 'legajo', titulo: 'Legajo', ancho: 12 }, { clave: 'docente', titulo: 'Docente', ancho: 36 }, { clave: 'cantidad', titulo: 'Licencias', ancho: 12 }, { clave: 'dias', titulo: 'Días', ancho: 10 }],
        filas: [...acc.values()].sort((x, y) => y.dias - x.dias),
      };
    },
  },

  'licencias-por-periodo': {
    titulo: 'Licencias por período',
    descripcion: 'Detalle de todas las solicitudes cuyo período se cruza con el rango indicado.',
    generar: async (prisma, a, p) => {
      const { desde, hasta, parametros } = periodo(p);
      const sols = await prisma.solicitudLicencia.findMany({
        where: { institucionId: a.institucionId, estado: { notIn: ['BORRADOR', 'ANULADA'] }, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
        include: { docente: true, tipoLicencia: true },
        orderBy: { fechaDesde: 'asc' },
      });
      return {
        titulo: 'Licencias por período', parametros,
        columnas: [
          { clave: 'numero', titulo: 'Número', ancho: 18 }, { clave: 'docente', titulo: 'Docente', ancho: 30 }, { clave: 'tipo', titulo: 'Tipo', ancho: 30 },
          { clave: 'desde', titulo: 'Desde', ancho: 12 }, { clave: 'hasta', titulo: 'Hasta', ancho: 12 }, { clave: 'dias', titulo: 'Días', ancho: 8 }, { clave: 'estado', titulo: 'Estado', ancho: 14 },
        ],
        filas: sols.map((s) => ({
          numero: s.numero, docente: nombre(s.docente), tipo: nombreTipo(s.tipoLicencia, a, s.docenteId),
          desde: formatoISO(s.fechaDesde), hasta: formatoISO(s.fechaHasta), dias: s.diasComputados, estado: s.estado,
        })),
      };
    },
  },

  'licencias-por-categoria': {
    titulo: 'Licencias por categoría',
    descripcion: 'Licencias otorgadas agrupadas por categoría.',
    generar: async (prisma, a, p) => {
      const { desde, hasta, parametros } = periodo(p);
      const sols = await prisma.solicitudLicencia.findMany({
        where: { institucionId: a.institucionId, estado: OTORGADAS, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
        include: { tipoLicencia: { select: { categoria: true } } },
      });
      const acc = new Map<string, { categoria: string; cantidad: number; dias: number; docentes: Set<string> }>();
      for (const s of sols) {
        const k = s.tipoLicencia.categoria;
        const r = acc.get(k) ?? { categoria: k, cantidad: 0, dias: 0, docentes: new Set() };
        r.cantidad++; r.dias += s.diasComputados; r.docentes.add(s.docenteId);
        acc.set(k, r);
      }
      return {
        titulo: 'Licencias por categoría', parametros,
        columnas: [{ clave: 'categoria', titulo: 'Categoría', ancho: 20 }, { clave: 'cantidad', titulo: 'Licencias', ancho: 12 }, { clave: 'docentes', titulo: 'Docentes', ancho: 12 }, { clave: 'dias', titulo: 'Días', ancho: 10 }],
        filas: [...acc.values()].map((r) => ({ categoria: r.categoria, cantidad: r.cantidad, docentes: r.docentes.size, dias: r.dias })),
      };
    },
  },

  'ausencias-mensuales': {
    titulo: 'Ausencias mensuales',
    descripcion: 'Resumen de asistencia por docente en un mes.',
    generar: async (prisma, a, p) => {
      const h = hoy();
      const anio = Number(p.anio) || h.getUTCFullYear();
      const mes = Number(p.mes) || h.getUTCMonth() + 1;
      const regs = await prisma.asistencia.findMany({
        where: { institucionId: a.institucionId, fecha: { gte: new Date(Date.UTC(anio, mes - 1, 1)), lt: new Date(Date.UTC(anio, mes, 1)) } },
        include: { docente: true },
      });
      const acc = new Map<string, Record<string, string | number>>();
      for (const r of regs) {
        const f = acc.get(r.docenteId) ?? { legajo: r.docente.legajo, docente: nombre(r.docente), PRESENTE: 0, AUSENTE: 0, TARDANZA: 0, LICENCIA: 0, injustificadas: 0 };
        (f[r.estado] as number)++;
        if (r.estado === 'AUSENTE' && !r.justificada) (f.injustificadas as number)++;
        acc.set(r.docenteId, f);
      }
      return {
        titulo: `Ausencias mensuales ${String(mes).padStart(2, '0')}/${anio}`, parametros: { anio: String(anio), mes: String(mes) },
        columnas: [
          { clave: 'legajo', titulo: 'Legajo', ancho: 12 }, { clave: 'docente', titulo: 'Docente', ancho: 32 }, { clave: 'PRESENTE', titulo: 'Presente', ancho: 10 },
          { clave: 'AUSENTE', titulo: 'Ausente', ancho: 10 }, { clave: 'TARDANZA', titulo: 'Tardanza', ancho: 10 }, { clave: 'LICENCIA', titulo: 'Licencia', ancho: 10 }, { clave: 'injustificadas', titulo: 'Injustificadas', ancho: 14 },
        ],
        filas: [...acc.values()].sort((x, y) => String(x.docente).localeCompare(String(y.docente))),
      };
    },
  },

  'solicitudes-pendientes': {
    titulo: 'Solicitudes pendientes',
    descripcion: 'Trámites sin resolver y días de espera.',
    generar: async (prisma, a) => {
      const sols = await prisma.solicitudLicencia.findMany({
        where: { institucionId: a.institucionId, estado: { in: ['PENDIENTE', 'EN_REVISION', 'OBSERVADA'] } },
        include: { docente: true, tipoLicencia: true },
        orderBy: { fechaSolicitud: 'asc' },
      });
      const h = hoy();
      return {
        titulo: 'Solicitudes pendientes', parametros: { al: formatoISO(h) },
        columnas: [
          { clave: 'numero', titulo: 'Número', ancho: 18 }, { clave: 'docente', titulo: 'Docente', ancho: 30 }, { clave: 'tipo', titulo: 'Tipo', ancho: 28 },
          { clave: 'estado', titulo: 'Estado', ancho: 14 }, { clave: 'presentada', titulo: 'Presentada', ancho: 12 }, { clave: 'espera', titulo: 'Días de espera', ancho: 14 },
        ],
        filas: sols.map((s) => ({
          numero: s.numero, docente: nombre(s.docente), tipo: nombreTipo(s.tipoLicencia, a, s.docenteId), estado: s.estado,
          presentada: formatoISO(s.fechaSolicitud), espera: diasCorridos(parseFecha(s.fechaSolicitud), h) - 1,
        })),
      };
    },
  },

  'reemplazos-realizados': {
    titulo: 'Reemplazos realizados',
    descripcion: 'Reemplazos activos o finalizados en el período, con sus suplentes.',
    generar: async (prisma, a, p) => {
      const { desde, hasta, parametros } = periodo(p);
      const rs = await prisma.reemplazo.findMany({
        where: { institucionId: a.institucionId, estado: { in: ['ACTIVO', 'FINALIZADO'] }, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
        include: { titular: true, designacion: { include: { cargo: true, curso: true, espacio: true } }, suplentes: { include: { suplente: true } } },
        orderBy: { fechaDesde: 'asc' },
      });
      return {
        titulo: 'Reemplazos realizados', parametros,
        columnas: [
          { clave: 'titular', titulo: 'Titular', ancho: 28 }, { clave: 'cargo', titulo: 'Cargo / espacio', ancho: 32 }, { clave: 'suplentes', titulo: 'Suplente(s)', ancho: 34 },
          { clave: 'desde', titulo: 'Desde', ancho: 12 }, { clave: 'hasta', titulo: 'Hasta', ancho: 12 }, { clave: 'estado', titulo: 'Estado', ancho: 12 },
        ],
        filas: rs.map((r) => ({
          titular: nombre(r.titular),
          cargo: [r.designacion.cargo.nombre, r.designacion.espacio?.nombre, r.designacion.curso?.nombre].filter(Boolean).join(' – '),
          suplentes: r.suplentes.map((s) => nombre(s.suplente)).join('; '),
          desde: formatoISO(r.fechaDesde), hasta: formatoISO(r.fechaHasta), estado: r.estado,
        })),
      };
    },
  },

  'dias-por-regimen': {
    titulo: 'Días utilizados por régimen',
    descripcion: 'Días computados de licencias otorgadas por régimen y tipo en el año.',
    generar: async (prisma, a, p) => {
      const anio = Number(p.anio) || new Date().getFullYear();
      const sols = await prisma.solicitudLicencia.findMany({
        where: { institucionId: a.institucionId, estado: OTORGADAS, fechaDesde: { gte: new Date(Date.UTC(anio, 0, 1)), lt: new Date(Date.UTC(anio + 1, 0, 1)) } },
        include: { tipoLicencia: { include: { regimen: true } } },
      });
      const acc = new Map<string, { regimen: string; tipo: string; cantidad: number; dias: number }>();
      for (const s of sols) {
        const tipo = codigoYNombreTipo(s.tipoLicencia, a);
        const clave = `${s.tipoLicencia.regimenId}|${tipo}`;
        const r = acc.get(clave) ?? { regimen: s.tipoLicencia.regimen.nombre, tipo, cantidad: 0, dias: 0 };
        r.cantidad++; r.dias += s.diasComputados;
        acc.set(clave, r);
      }
      return {
        titulo: `Días utilizados por régimen (${anio})`, parametros: { anio: String(anio) },
        columnas: [{ clave: 'regimen', titulo: 'Régimen', ancho: 30 }, { clave: 'tipo', titulo: 'Tipo de licencia', ancho: 40 }, { clave: 'cantidad', titulo: 'Licencias', ancho: 12 }, { clave: 'dias', titulo: 'Días', ancho: 10 }],
        filas: [...acc.values()].sort((x, y) => x.regimen.localeCompare(y.regimen) || y.dias - x.dias),
      };
    },
  },
  ...INFORMES_647,
}));
