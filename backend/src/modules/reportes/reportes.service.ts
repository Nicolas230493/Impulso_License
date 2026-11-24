import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { formatoISO, hoy, parseFecha, sumarDias } from '../../common/fechas';
import { nombreTipo } from '../../common/sensitive/sensitive-data.policy';
import { ESTADOS_VIGENTES } from '../licencias/reglas-negocio';
import { INFORMES, ParametrosInforme } from './informes';
import { aExcel, aPdf } from './exportar';

@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService) {}

  /** Indicadores del panel principal (SPEC §5.1). Usuarios sin alcance institucional ven su propio resumen. */
  async panel(a: Actor) {
    const h = hoy();
    const institucional = [P.DOCENTES_VER, P.REPORTES_VER, P.LICENCIAS_VER_TODAS].some((p) => tienePermiso(a, p));
    const enCurso: Prisma.SolicitudLicenciaWhereInput = {
      estado: 'AUTORIZADA', fechaDesde: { lte: h }, fechaHasta: { gte: h },
      ...(institucional ? { institucionId: a.institucionId } : { docenteId: a.docenteId ?? '-' }),
    };
    const alcance = institucional ? { institucionId: a.institucionId } : { docenteId: a.docenteId ?? '-' };

    const [pendientes, observadas, autorizadas, enLicencia, proximas] = await Promise.all([
      this.prisma.solicitudLicencia.count({ where: { ...alcance, estado: { in: ['PENDIENTE', 'EN_REVISION'] } } }),
      this.prisma.solicitudLicencia.count({ where: { ...alcance, estado: 'OBSERVADA' } }),
      this.prisma.solicitudLicencia.count({ where: { ...alcance, estado: 'AUTORIZADA' } }),
      this.prisma.solicitudLicencia.findMany({ where: enCurso, select: { docenteId: true }, distinct: ['docenteId'] }),
      this.prisma.solicitudLicencia.findMany({
        where: { ...alcance, estado: 'AUTORIZADA', fechaHasta: { gte: sumarDias(h, -30), lte: sumarDias(h, 14) } },
        include: { docente: { select: { id: true, apellido: true, nombre: true } }, tipoLicencia: { select: { nombre: true, sensible: true } } },
        orderBy: { fechaHasta: 'asc' },
        take: 10,
      }),
    ]);
    const base = {
      institucional,
      solicitudesPendientes: pendientes,
      solicitudesObservadas: observadas,
      licenciasAutorizadas: autorizadas,
      proximasReincorporaciones: proximas.map((s) => ({
        solicitudId: s.id, numero: s.numero, docente: s.docente, fechaHasta: s.fechaHasta,
        reincorporacion: formatoISO(sumarDias(s.fechaHasta, 1)), vencida: s.fechaHasta < h,
        tipo: nombreTipo(s.tipoLicencia, a, s.docenteId),
      })),
    };
    if (!institucional) return { ...base, enLicencia: enLicencia.length > 0 };

    const [totalDocentes, activos, reemplazosActivos] = await Promise.all([
      this.prisma.docente.count({ where: { institucionId: a.institucionId } }),
      this.prisma.docente.count({ where: { institucionId: a.institucionId, estadoLaboral: 'ACTIVO' } }),
      this.prisma.reemplazo.count({ where: { institucionId: a.institucionId, estado: 'ACTIVO' } }),
    ]);
    return { ...base, totalDocentes, docentesActivos: activos, docentesConLicencia: enLicencia.length, reemplazosActivos };
  }

  /** Eventos del calendario institucional (SPEC §5.7). */
  async calendario(a: Actor, desdeStr?: string, hastaStr?: string) {
    const h = hoy();
    const desde = desdeStr ? parseFecha(desdeStr) : new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1));
    const hasta = hastaStr ? parseFecha(hastaStr) : new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() + 1, 0));
    const todas = tienePermiso(a, P.LICENCIAS_VER_TODAS) || tienePermiso(a, P.REPORTES_VER);
    const alcance = todas ? { institucionId: a.institucionId } : { institucionId: a.institucionId, docenteId: a.docenteId ?? '-' };

    const [licencias, reemplazos, feriados] = await Promise.all([
      this.prisma.solicitudLicencia.findMany({
        // Todo estado en que el docente está (o estuvo) ausente: también con dictamen pendiente, elevada, interrumpida o cancelada por cese.
        where: { ...alcance, estado: { in: ESTADOS_VIGENTES }, fechaDesde: { lte: hasta }, fechaHasta: { gte: sumarDias(desde, -1) } },
        include: { docente: { select: { id: true, apellido: true, nombre: true } }, tipoLicencia: { select: { nombre: true, sensible: true } }, reincorporacion: true },
      }),
      todas || tienePermiso(a, P.REEMPLAZOS_VER)
        ? this.prisma.reemplazo.findMany({
            where: { institucionId: a.institucionId, estado: { in: ['PROPUESTO', 'ACTIVO'] }, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
            include: { titular: { select: { apellido: true, nombre: true } }, suplentes: { include: { suplente: { select: { apellido: true, nombre: true } } } }, designacion: { include: { cargo: true } } },
          })
        : Promise.resolve([]),
      this.prisma.feriado.findMany({ where: { institucionId: a.institucionId, fecha: { gte: desde, lte: hasta } } }),
    ]);

    const eventos = [
      ...licencias.map((s) => ({
        tipo: 'licencia' as const, id: s.id, desde: formatoISO(s.fechaDesde), estado: s.estado,
        // Con reincorporación anticipada, la ausencia real termina el día anterior.
        hasta: formatoISO(s.reincorporacion && s.reincorporacion.fechaEfectiva <= s.fechaHasta ? sumarDias(s.reincorporacion.fechaEfectiva, -1) : s.fechaHasta),
        titulo: `${s.docente.apellido}, ${s.docente.nombre}`, detalle: nombreTipo(s.tipoLicencia, a, s.docenteId),
      })),
      ...licencias
        .filter((s) => s.estado === 'AUTORIZADA' || s.reincorporacion)
        .map((s) => {
          const f = s.reincorporacion?.fechaEfectiva ?? sumarDias(s.fechaHasta, 1);
          return { tipo: 'reincorporacion' as const, id: s.id, desde: formatoISO(f), hasta: formatoISO(f), estado: s.reincorporacion ? 'REGISTRADA' : 'PREVISTA', titulo: `${s.docente.apellido}, ${s.docente.nombre}`, detalle: 'Reincorporación' };
        })
        .filter((e) => e.desde >= formatoISO(desde) && e.desde <= formatoISO(hasta)),
      ...reemplazos.map((r) => ({
        tipo: 'reemplazo' as const, id: r.id, desde: formatoISO(r.fechaDesde), hasta: formatoISO(r.fechaHasta), estado: r.estado,
        titulo: `${r.titular.apellido} → ${r.suplentes.map((s) => s.suplente.apellido).join(', ')}`, detalle: r.designacion.cargo.nombre,
      })),
      ...feriados.map((f) => ({ tipo: 'feriado' as const, id: f.id, desde: formatoISO(f.fecha), hasta: formatoISO(f.fecha), estado: '', titulo: f.descripcion, detalle: 'Feriado' })),
    ];
    return { desde: formatoISO(desde), hasta: formatoISO(hasta), eventos };
  }

  catalogoInformes() {
    return [...INFORMES.entries()].map(([clave, i]) => ({ clave, titulo: i.titulo, descripcion: i.descripcion }));
  }

  async informe(a: Actor, clave: string, p: ParametrosInforme, formato: 'json' | 'xlsx' | 'pdf') {
    const def = INFORMES.get(clave);
    if (!def) throw new NotFoundException('Informe inexistente');
    const inf = await def.generar(this.prisma, a, p);
    if (formato === 'json') return { formato, inf };
    const inst = await this.prisma.institucion.findUniqueOrThrow({ where: { id: a.institucionId } });
    await this.auditoria.registrar(a, 'EXPORTAR_INFORME', 'informe', clave, null, { formato, parametros: inf.parametros });
    const buffer = formato === 'xlsx' ? await aExcel(inf, inst.nombre) : await aPdf(inf, inst.nombre);
    return { formato, inf, buffer };
  }
}
