import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ArchivosService, ArchivoSubido } from '../archivos/archivos.service';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { hoy, parseFecha } from '../../common/fechas';
import { normalizarCuil } from '../../common/validadores';
import { paginar, resultadoPaginado } from '../../common/paginacion.dto';
import { redact } from '../../common/sensitive/sensitive-data.policy';
import { ActualizarDocenteDto, CrearDocenteDto, DocumentoPersonalDto, FiltroDocentesDto } from './docentes.dto';

const ESTADOS_EN_CURSO = ['AUTORIZADA'] as const;

@Injectable()
export class DocentesService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService, private archivos: ArchivosService) {}

  async listar(actor: Actor, f: FiltroDocentesDto) {
    const where: Prisma.DocenteWhereInput = {
      institucionId: actor.institucionId,
      estadoLaboral: f.estadoLaboral,
      ...(f.buscar && {
        OR: [
          { apellido: { contains: f.buscar, mode: 'insensitive' } },
          { nombre: { contains: f.buscar, mode: 'insensitive' } },
          { dni: { contains: f.buscar } },
          { legajo: { contains: f.buscar, mode: 'insensitive' } },
        ],
      }),
    };
    const h = hoy();
    const [items, total] = await Promise.all([
      this.prisma.docente.findMany({
        where,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        ...paginar(f),
        include: {
          _count: { select: { designaciones: { where: { activa: true } } } },
          solicitudes: { where: { estado: { in: [...ESTADOS_EN_CURSO] }, fechaDesde: { lte: h }, fechaHasta: { gte: h } }, select: { id: true, fechaHasta: true } },
        },
      }),
      this.prisma.docente.count({ where }),
    ]);
    return resultadoPaginado(
      items.map(({ _count, solicitudes, ...d }) => ({ ...d, designacionesActivas: _count.designaciones, enLicencia: solicitudes.length > 0 })),
      total,
      f,
    );
  }

  async obtener(actor: Actor, id: string) {
    if (!tienePermiso(actor, P.DOCENTES_VER) && actor.docenteId !== id) throw new ForbiddenException('Solo puede consultar su propio legajo');
    const d = await this.prisma.docente.findFirst({
      where: { id, institucionId: actor.institucionId },
      include: {
        domicilios: { where: { vigente: true } },
        contactos: true,
        documentos: { include: { archivo: { select: { id: true, nombreOriginal: true, mimeType: true, tamanio: true, confidencial: true, createdAt: true } } } },
        designaciones: {
          orderBy: [{ activa: 'desc' }, { fechaDesde: 'desc' }],
          include: { cargo: true, curso: true, espacio: true, horarios: { orderBy: [{ diaSemana: 'asc' }, { horaDesde: 'asc' }] } },
        },
        usuario: { select: { id: true, email: true, activo: true } },
      },
    });
    if (!d) throw new NotFoundException('Docente no encontrado');
    const puedeSensibles = tienePermiso(actor, P.DATOS_SENSIBLES_VER) || actor.docenteId === id;
    return {
      ...d,
      documentos: d.documentos.filter((doc) => !doc.archivo.confidencial || puedeSensibles),
      domicilio: d.domicilios[0] ?? null,
    };
  }

  private datos(dto: CrearDocenteDto | ActualizarDocenteDto) {
    const { domicilio, contactos, fechaNacimiento, fechaIngreso, cuil, ...resto } = dto;
    return {
      ...resto,
      ...(cuil && { cuil: normalizarCuil(cuil) }),
      ...(fechaNacimiento && { fechaNacimiento: parseFecha(fechaNacimiento) }),
      ...(fechaIngreso && { fechaIngreso: parseFecha(fechaIngreso) }),
    };
  }

  async crear(actor: Actor, dto: CrearDocenteDto) {
    const d = await this.prisma.$transaction(async (tx) => {
      const docente = await tx.docente.create({
        data: {
          ...(this.datos(dto) as Prisma.DocenteUncheckedCreateInput),
          institucionId: actor.institucionId,
          domicilios: dto.domicilio ? { create: dto.domicilio } : undefined,
          contactos: dto.contactos?.length ? { create: dto.contactos } : undefined,
        },
      });
      await this.auditoria.registrar(actor, 'CREAR', 'docente', docente.id, null, docente, tx);
      return docente;
    });
    return d;
  }

  async actualizar(actor: Actor, id: string, dto: ActualizarDocenteDto) {
    const antes = await this.prisma.docente.findFirst({ where: { id, institucionId: actor.institucionId }, include: { domicilios: { where: { vigente: true } }, contactos: true } });
    if (!antes) throw new NotFoundException('Docente no encontrado');
    return this.prisma.$transaction(async (tx) => {
      if (dto.domicilio) {
        // Se conserva el historial de domicilios: el anterior queda no vigente.
        await tx.domicilio.updateMany({ where: { docenteId: id, vigente: true }, data: { vigente: false } });
        await tx.domicilio.create({ data: { ...dto.domicilio, docenteId: id } });
      }
      if (dto.contactos) {
        await tx.contacto.deleteMany({ where: { docenteId: id } });
        await tx.contacto.createMany({ data: dto.contactos.map((c) => ({ ...c, docenteId: id })) });
      }
      const despues = await tx.docente.update({ where: { id }, data: this.datos(dto) });
      await this.auditoria.registrar(actor, 'ACTUALIZAR', 'docente', id, antes, { ...despues, domicilio: dto.domicilio, contactos: dto.contactos }, tx);
      return despues;
    });
  }

  async agregarDocumento(actor: Actor, docenteId: string, dto: DocumentoPersonalDto, file?: ArchivoSubido) {
    if (!tienePermiso(actor, P.DOCENTES_GESTIONAR) && actor.docenteId !== docenteId) throw new ForbiddenException();
    await this.prisma.docente.findFirstOrThrow({ where: { id: docenteId, institucionId: actor.institucionId } });
    const preparado = await this.archivos.preparar(actor, file);
    // Hallazgo 12: la confidencialidad la decide el servidor. Los documentos personales nacen confidenciales;
    // solo alguien con `datos_sensibles.ver` puede bajarla después (PATCH …/confidencial), y queda auditado.
    const doc = await this.prisma.$transaction(async (tx) => {
      const archivo = await this.archivos.registrar(actor, preparado, true, tx);
      const doc = await tx.documentoPersonal.create({ data: { docenteId, archivoId: archivo.id, tipo: dto.tipo, descripcion: dto.descripcion }, include: { archivo: true } });
      await this.auditoria.registrar(actor, 'ADJUNTAR_DOCUMENTO', 'docente', docenteId, null, { documento: doc.id, tipo: dto.tipo, archivo: archivo.nombreOriginal }, tx);
      return doc;
    });
    // El archivo se escribe en disco recién cuando la base confirmó; si falla, se revierte el registro.
    await this.archivos.persistir(preparado, async () => {
      await this.prisma.$transaction([this.prisma.documentoPersonal.delete({ where: { id: doc.id } }), this.prisma.archivo.delete({ where: { id: doc.archivoId } })]);
    });
    return doc;
  }

  /** Cambia la confidencialidad de un documento personal. Requiere `datos_sensibles.ver` y queda auditado. */
  async cambiarConfidencialidad(actor: Actor, docenteId: string, documentoId: string, confidencial: boolean) {
    if (!tienePermiso(actor, P.DATOS_SENSIBLES_VER)) throw new ForbiddenException('Solo quien accede a datos sensibles puede cambiar la confidencialidad');
    const doc = await this.prisma.documentoPersonal.findFirst({ where: { id: documentoId, docenteId, docente: { institucionId: actor.institucionId } }, include: { archivo: true } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return this.prisma.$transaction(async (tx) => {
      const archivo = await tx.archivo.update({ where: { id: doc.archivoId }, data: { confidencial } });
      await this.auditoria.registrar(actor, 'CAMBIAR_CONFIDENCIALIDAD', 'docente', docenteId, { documento: doc.id, confidencial: doc.archivo.confidencial }, { documento: doc.id, confidencial }, tx);
      return { ...doc, archivo };
    });
  }

  async eliminarDocumento(actor: Actor, docenteId: string, documentoId: string) {
    const doc = await this.prisma.documentoPersonal.findFirst({ where: { id: documentoId, docenteId, docente: { institucionId: actor.institucionId } }, include: { archivo: true } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.prisma.$transaction(async (tx) => {
      await tx.documentoPersonal.delete({ where: { id: doc.id } });
      await tx.archivo.delete({ where: { id: doc.archivoId } });
      await this.auditoria.registrar(actor, 'ELIMINAR_DOCUMENTO', 'docente', docenteId, { documento: doc.id, archivo: doc.archivo.nombreOriginal }, null, tx);
    });
    await this.archivos.eliminarFisico(doc.archivo.ruta);
  }

  async historialLicencias(actor: Actor, docenteId: string) {
    if (!tienePermiso(actor, P.DOCENTES_VER) && !tienePermiso(actor, P.LICENCIAS_VER_TODAS) && actor.docenteId !== docenteId) throw new ForbiddenException();
    // Hallazgo 1: select explícito; nunca la fila completa. El motivo no se lee y el tipo pasa por la política.
    const filas = await this.prisma.solicitudLicencia.findMany({
      where: { docenteId, institucionId: actor.institucionId },
      orderBy: { fechaDesde: 'desc' },
      select: {
        id: true, numero: true, docenteId: true, estado: true, fechaDesde: true, fechaHasta: true, diasComputados: true, fechaSolicitud: true,
        tipoLicencia: { select: { codigo: true, nombre: true, categoria: true, sensible: true } },
      },
    });
    return redact('solicitud', filas, actor);
  }
}
