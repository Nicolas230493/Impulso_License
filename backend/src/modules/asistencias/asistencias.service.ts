import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../../common/actor';
import { hoy, parseFecha, sumarDias } from '../../common/fechas';
import { NovedadDto, PlanillaAsistenciaDto } from './asistencias.dto';

@Injectable()
export class AsistenciasService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService) {}

  /** Planilla diaria: designaciones vigentes con su registro y si el docente está de licencia ese día. */
  async planilla(a: Actor, fechaStr?: string) {
    const fecha = fechaStr ? parseFecha(fechaStr) : hoy();
    const designaciones = await this.prisma.designacion.findMany({
      where: {
        activa: true,
        docente: { institucionId: a.institucionId, estadoLaboral: 'ACTIVO' },
        fechaDesde: { lte: fecha },
        OR: [{ fechaHasta: null }, { fechaHasta: { gte: fecha } }],
      },
      include: {
        docente: { select: { id: true, apellido: true, nombre: true, legajo: true } },
        cargo: true, curso: true, espacio: true,
        horarios: { where: { diaSemana: ((fecha.getUTCDay() + 6) % 7) + 1 } },
        asistencias: { where: { fecha } },
        solicitudes: {
          where: { solicitud: { estado: { in: ['AUTORIZADA', 'FINALIZADA'] }, fechaDesde: { lte: fecha }, fechaHasta: { gte: fecha } } },
          select: { solicitud: { select: { id: true, numero: true, reincorporacion: { select: { fechaEfectiva: true } } } } },
        },
      },
      orderBy: [{ docente: { apellido: 'asc' } }],
    });
    return {
      fecha,
      filas: designaciones.map(({ asistencias, solicitudes, ...d }) => {
        const lic = solicitudes.map((s) => s.solicitud).find((s) => !s.reincorporacion || s.reincorporacion.fechaEfectiva > fecha);
        return { ...d, registro: asistencias[0] ?? null, licencia: lic ? { id: lic.id, numero: lic.numero } : null, tieneClase: d.horarios.length > 0 };
      }),
    };
  }

  async registrar(a: Actor, dto: PlanillaAsistenciaDto) {
    const fecha = parseFecha(dto.fecha);
    if (fecha > hoy()) throw new BadRequestException('No se puede registrar asistencia de fechas futuras');
    const ids = dto.registros.map((r) => r.designacionId);
    const designaciones = await this.prisma.designacion.findMany({ where: { id: { in: ids }, docente: { institucionId: a.institucionId } } });
    if (designaciones.length !== new Set(ids).size) throw new BadRequestException('Alguna designación no pertenece a la institución');
    const docenteDe = new Map(designaciones.map((d) => [d.id, d.docenteId]));
    await this.prisma.$transaction(async (tx) => {
      for (const r of dto.registros) {
        const datos = {
          estado: r.estado, justificada: r.estado === 'LICENCIA' ? true : r.justificada ?? false, justificacion: r.justificacion, registradaPorId: a.usuarioId,
          aviso: r.estado === 'AUSENTE' ? r.aviso ?? null : null, avisoEn: r.estado === 'AUSENTE' && r.avisoEn ? new Date(r.avisoEn) : null,
        };
        await tx.asistencia.upsert({
          where: { designacionId_fecha: { designacionId: r.designacionId, fecha } },
          create: { ...datos, institucionId: a.institucionId, docenteId: docenteDe.get(r.designacionId)!, designacionId: r.designacionId, fecha },
          update: datos,
        });
      }
      await this.auditoria.registrar(a, 'REGISTRAR_ASISTENCIA', 'asistencia', null, null, { fecha: dto.fecha, registros: dto.registros.length }, tx);
    });
    return this.planilla(a, dto.fecha);
  }

  listarNovedades(a: Actor, desde?: string, hasta?: string, docenteId?: string) {
    const d = desde ? parseFecha(desde) : sumarDias(hoy(), -30);
    const h = hasta ? parseFecha(hasta) : hoy();
    return this.prisma.novedad.findMany({
      where: { institucionId: a.institucionId, docenteId, fecha: { gte: d, lte: h } },
      include: { docente: { select: { id: true, apellido: true, nombre: true, legajo: true } } },
      orderBy: { fecha: 'desc' },
    });
  }

  async crearNovedad(a: Actor, dto: NovedadDto) {
    await this.prisma.docente.findFirstOrThrow({ where: { id: dto.docenteId, institucionId: a.institucionId } });
    const n = await this.prisma.novedad.create({
      data: { ...dto, fecha: parseFecha(dto.fecha), institucionId: a.institucionId, registradaPorId: a.usuarioId },
    });
    await this.auditoria.registrar(a, 'CREAR', 'novedad', n.id, null, n);
    return n;
  }
}
