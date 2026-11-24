import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoReemplazo, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Actor } from '../../common/actor';
import { formatoISO, parseFecha, seSuperponen } from '../../common/fechas';
import { paginar, resultadoPaginado } from '../../common/paginacion.dto';
import { validarCoberturas } from './reglas-reemplazo';
import { CambioEstadoReemplazoDto, CrearReemplazoDto, FiltroReemplazosDto } from './reemplazos.dto';

const INCLUDE = {
  titular: { select: { id: true, apellido: true, nombre: true, legajo: true } },
  designacion: { include: { cargo: true, curso: true, espacio: true, horarios: true } },
  solicitud: { select: { id: true, numero: true, estado: true, fechaDesde: true, fechaHasta: true } },
  suplentes: {
    include: {
      suplente: { select: { id: true, apellido: true, nombre: true, legajo: true } },
      coberturas: { include: { horario: true } },
    },
  },
} satisfies Prisma.ReemplazoInclude;

const TRANSICIONES: Record<EstadoReemplazo, EstadoReemplazo[]> = {
  PROPUESTO: ['ACTIVO', 'ANULADO'],
  ACTIVO: ['FINALIZADO', 'ANULADO'],
  FINALIZADO: [],
  ANULADO: [],
};

@Injectable()
export class ReemplazosService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService, private notificaciones: NotificacionesService) {}

  async listar(a: Actor, f: FiltroReemplazosDto) {
    const where: Prisma.ReemplazoWhereInput = {
      institucionId: a.institucionId,
      estado: f.estado,
      ...(f.docenteId && { OR: [{ titularId: f.docenteId }, { suplentes: { some: { suplenteId: f.docenteId } } }] }),
      ...(f.buscar && { titular: { apellido: { contains: f.buscar, mode: 'insensitive' } } }),
    };
    const [items, total] = await Promise.all([
      this.prisma.reemplazo.findMany({ where, include: INCLUDE, orderBy: { fechaDesde: 'desc' }, ...paginar(f) }),
      this.prisma.reemplazo.count({ where }),
    ]);
    return resultadoPaginado(items, total, f);
  }

  async obtener(a: Actor, id: string) {
    const r = await this.prisma.reemplazo.findFirst({ where: { id, institucionId: a.institucionId }, include: INCLUDE });
    if (!r) throw new NotFoundException('Reemplazo no encontrado');
    return r;
  }

  async crear(a: Actor, dto: CrearReemplazoDto) {
    const designacion = await this.prisma.designacion.findFirst({
      where: { id: dto.designacionId, docente: { institucionId: a.institucionId } },
      include: { horarios: true },
    });
    if (!designacion) throw new BadRequestException('Designación inexistente');
    const desde = parseFecha(dto.fechaDesde), hasta = parseFecha(dto.fechaHasta);

    // Controlar el período contra la licencia que origina el reemplazo.
    if (dto.solicitudId) {
      const s = await this.prisma.solicitudLicencia.findFirst({
        where: { id: dto.solicitudId, institucionId: a.institucionId },
        include: { designaciones: true },
      });
      if (!s) throw new BadRequestException('Solicitud inexistente');
      if (!['EN_REVISION', 'AUTORIZADA'].includes(s.estado)) throw new ConflictException('Solo se asignan reemplazos a licencias en revisión o autorizadas');
      if (!s.designaciones.some((d) => d.designacionId === dto.designacionId)) throw new BadRequestException('La designación no está afectada por la licencia');
      if (desde < s.fechaDesde || hasta > s.fechaHasta)
        throw new BadRequestException(`El reemplazo debe estar comprendido en la licencia (${formatoISO(s.fechaDesde)} al ${formatoISO(s.fechaHasta)})`);
    }

    const tramos = dto.suplentes.map((t) => ({ suplenteId: t.suplenteId, desde: parseFecha(t.fechaDesde), hasta: parseFecha(t.fechaHasta), horarioIds: t.horarioIds ?? [] }));
    const errores = validarCoberturas(designacion.docenteId, desde, hasta, tramos, designacion.horarios.map((h) => h.id));

    const suplentes = await this.prisma.docente.findMany({ where: { id: { in: tramos.map((t) => t.suplenteId) }, institucionId: a.institucionId, estadoLaboral: 'ACTIVO' } });
    if (suplentes.length !== new Set(tramos.map((t) => t.suplenteId)).size) errores.push('Algún suplente no existe o no está activo');

    // No duplicar coberturas con otros reemplazos vigentes de la misma designación.
    const otros = await this.prisma.reemplazo.findMany({
      where: { designacionId: dto.designacionId, estado: { in: ['PROPUESTO', 'ACTIVO'] }, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
      include: { suplentes: { include: { coberturas: true } } },
    });
    const todos = designacion.horarios.map((h) => h.id);
    for (const o of otros)
      for (const os of o.suplentes) {
        const franjasO = os.coberturas.length ? os.coberturas.map((c) => c.horarioId) : todos;
        for (const t of tramos) {
          const franjasT = t.horarioIds.length ? t.horarioIds : todos;
          if (seSuperponen(t.desde, t.hasta, os.fechaDesde, os.fechaHasta) && (franjasT.some((h) => franjasO.includes(h)) || !todos.length))
            errores.push(`Ya existe un reemplazo vigente que cubre esa franja (${formatoISO(os.fechaDesde)} al ${formatoISO(os.fechaHasta)})`);
        }
      }
    if (errores.length) throw new BadRequestException([...new Set(errores)]);

    const r = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reemplazo.create({
        data: {
          institucionId: a.institucionId,
          solicitudId: dto.solicitudId,
          titularId: designacion.docenteId,
          designacionId: dto.designacionId,
          fechaDesde: desde,
          fechaHasta: hasta,
          instrumentoLegal: dto.instrumentoLegal,
          observaciones: dto.observaciones,
          suplentes: {
            create: tramos.map((t) => ({
              suplenteId: t.suplenteId,
              fechaDesde: t.desde,
              fechaHasta: t.hasta,
              coberturas: t.horarioIds.length ? { create: t.horarioIds.map((horarioId) => ({ horarioId })) } : undefined,
            })),
          },
        },
        include: INCLUDE,
      });
      await this.auditoria.registrar(a, 'CREAR', 'reemplazo', r.id, null, r, tx);
      return r;
    });
    return r;
  }

  /**
   * Hallazgo 15: lectura y escritura dentro de la misma transacción, con escritura condicionada
   * a {id, estado, version}. Si otra petición cambió el reemplazo en el medio → 409.
   */
  async cambiarEstado(a: Actor, id: string, dto: CambioEstadoReemplazoDto) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.reemplazo.findFirst({ where: { id, institucionId: a.institucionId }, include: INCLUDE });
      if (!r) throw new NotFoundException('Reemplazo no encontrado');
      if (!TRANSICIONES[r.estado].includes(dto.estado)) throw new ConflictException(`No se puede pasar de ${r.estado} a ${dto.estado}`);
      if (dto.version !== undefined && dto.version !== r.version) throw new ConflictException('El reemplazo cambió; recargue');
      const upd = await tx.reemplazo.updateMany({
        where: { id, estado: r.estado, version: r.version },
        data: {
          estado: dto.estado,
          observaciones: dto.observaciones ?? r.observaciones,
          version: { increment: 1 },
          ...(dto.estado === 'ACTIVO' && { autorizadoPorId: a.usuarioId }),
        },
      });
      if (upd.count === 0) throw new ConflictException('El reemplazo cambió; recargue');
      await this.auditoria.registrar(a, `REEMPLAZO_${dto.estado}`, 'reemplazo', id, { estado: r.estado }, { estado: dto.estado, observaciones: dto.observaciones }, tx);
      if (dto.estado === 'ACTIVO') {
        for (const s of r.suplentes) {
          await this.notificaciones.notificar([await this.notificaciones.usuarioDeDocente(s.suplenteId, tx)], {
            tipo: 'REEMPLAZO_ASIGNADO',
            titulo: 'Reemplazo asignado',
            mensaje: `Cubre a ${r.titular.apellido}, ${r.titular.nombre} en ${r.designacion.cargo.nombre}${r.designacion.curso ? ` – ${r.designacion.curso.nombre}` : ''} del ${formatoISO(s.fechaDesde)} al ${formatoISO(s.fechaHasta)}.`,
            entidad: 'reemplazo',
            entidadId: id,
          }, tx);
        }
      }
      return tx.reemplazo.findUniqueOrThrow({ where: { id } });
    });
  }
}
