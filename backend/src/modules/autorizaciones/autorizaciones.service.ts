import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { exigirVersion, MENSAJE_CONFLICTO, SolicitudesService } from '../licencias/solicitudes.service';
import { CircuitoService } from '../licencias/circuito.service';
import { impedimentoParaDecidir } from '../licencias/reglas-negocio';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { formatoISO } from '../../common/fechas';
import { CircuitoDto, DecisionDto } from './autorizaciones.dto';

@Injectable()
export class AutorizacionesService {
  constructor(
    private prisma: PrismaService,
    private auditoria: AuditoriaService,
    private notificaciones: NotificacionesService,
    private solicitudes: SolicitudesService,
    private circuito: CircuitoService,
  ) {}

  // ───────────── Circuitos ─────────────

  listarCircuitos(a: Actor) {
    return this.prisma.circuitoAutorizacion.findMany({
      where: { institucionId: a.institucionId },
      include: { pasos: { orderBy: { orden: 'asc' }, include: { rol: { select: { id: true, codigo: true, nombre: true } } } }, _count: { select: { tipos: true } } },
      orderBy: [{ predeterminado: 'desc' }, { nombre: 'asc' }],
    });
  }

  async guardarCircuito(a: Actor, dto: CircuitoDto, id?: string) {
    const ordenes = dto.pasos.map((p) => p.orden).sort((x, y) => x - y);
    if (ordenes.some((o, i) => o !== i + 1)) throw new BadRequestException('Los pasos deben numerarse correlativamente desde 1');
    const roles = await this.prisma.rol.count({ where: { id: { in: dto.pasos.map((p) => p.rolId) }, institucionId: a.institucionId } });
    if (roles !== new Set(dto.pasos.map((p) => p.rolId)).size) throw new BadRequestException('Algún rol responsable no existe');
    let antes = null;
    // Solicitudes en trámite dentro del circuito interno: cambiarles el circuito alteraría su secuencia de pasos.
    const enTramite = (circuito: Prisma.SolicitudLicenciaWhereInput['tipoLicencia']) =>
      this.prisma.solicitudLicencia.count({ where: { institucionId: a.institucionId, estado: { in: ['PENDIENTE', 'EN_REVISION', 'OBSERVADA'] }, tipoLicencia: circuito } });
    // Los tipos sin circuito propio usan el predeterminado de la institución.
    const sinCircuitoPropio = { circuitoId: null, regimen: { institucionId: a.institucionId } };
    if (id) {
      antes = await this.prisma.circuitoAutorizacion.findFirst({ where: { id, institucionId: a.institucionId }, include: { pasos: true } });
      if (!antes) throw new NotFoundException('Circuito no encontrado');
      const usaEste = antes.predeterminado && antes.activo ? { OR: [{ circuitoId: id }, sinCircuitoPropio] } : { circuitoId: id };
      const enCurso = await enTramite(usaEste);
      const cambianPasos = JSON.stringify(antes.pasos.map((p) => [p.orden, p.rolId]).sort()) !== JSON.stringify(dto.pasos.map((p) => [p.orden, p.rolId]).sort());
      const dejaDeSerPredeterminado = antes.predeterminado && antes.activo && (dto.predeterminado === false || dto.activo === false);
      if (enCurso && cambianPasos)
        throw new ConflictException(`Hay ${enCurso} solicitudes en trámite con este circuito; no se pueden modificar sus pasos`);
      if (dejaDeSerPredeterminado && (await enTramite(sinCircuitoPropio)))
        throw new ConflictException('Hay solicitudes en trámite que usan el circuito predeterminado; no puede dejar de serlo hasta que terminen');
    }
    // Un nuevo predeterminado reemplaza al actual para los tipos sin circuito propio que estén en trámite.
    if (dto.predeterminado && dto.activo !== false && !(antes?.predeterminado && antes.activo)) {
      const enCurso = await enTramite(sinCircuitoPropio);
      if (enCurso) throw new ConflictException(`Hay ${enCurso} solicitudes en trámite con el circuito predeterminado actual; no se puede reemplazar hasta que terminen`);
    }
    const { pasos, ...datos } = dto;
    const c = await this.prisma.$transaction(async (tx) => {
      if (dto.predeterminado) await tx.circuitoAutorizacion.updateMany({ where: { institucionId: a.institucionId }, data: { predeterminado: false } });
      const c = id
        ? await tx.circuitoAutorizacion.update({ where: { id }, data: datos })
        : await tx.circuitoAutorizacion.create({ data: { ...datos, institucionId: a.institucionId } });
      await tx.pasoCircuito.deleteMany({ where: { circuitoId: c.id } });
      await tx.pasoCircuito.createMany({ data: pasos.map((p) => ({ ...p, circuitoId: c.id })) });
      await this.auditoria.registrar(a, id ? 'ACTUALIZAR' : 'CREAR', 'circuito', c.id, antes, { ...c, pasos }, tx);
      return c;
    });
    return c;
  }

  // ───────────── Bandeja ─────────────

  /** Solicitudes que esperan una acción del usuario: recepción (pendientes) o su paso del circuito. */
  async bandeja(a: Actor) {
    const include = {
      docente: { select: { id: true, apellido: true, nombre: true, legajo: true } },
      tipoLicencia: { select: { id: true, codigo: true, nombre: true, categoria: true, sensible: true, circuitoId: true } },
    };
    const pendientes = tienePermiso(a, P.LICENCIAS_REVISAR)
      ? await this.prisma.solicitudLicencia.findMany({ where: { institucionId: a.institucionId, estado: 'PENDIENTE' }, include, orderBy: { fechaSolicitud: 'asc' } })
      : [];
    let enRevision: typeof pendientes = [];
    if (tienePermiso(a, P.AUTORIZACIONES_DECIDIR)) {
      const todas = await this.prisma.solicitudLicencia.findMany({ where: { institucionId: a.institucionId, estado: 'EN_REVISION' }, include, orderBy: { fechaSolicitud: 'asc' } });
      const circuitos = await this.listarCircuitos(a);
      const pred = circuitos.find((c) => c.predeterminado && c.activo);
      const misRoles = new Set(a.roles.map((r) => r.id));
      const recepciones = await this.prisma.historialEstado.findMany({
        where: { solicitudId: { in: todas.map((s) => s.id) }, estadoAnterior: 'PENDIENTE', estadoNuevo: 'EN_REVISION' },
        orderBy: { fecha: 'asc' },
        select: { solicitudId: true, usuarioId: true },
      });
      const receptor = new Map(recepciones.map((h) => [h.solicitudId, h.usuarioId]));
      enRevision = todas
        .map((s) => {
          const c = circuitos.find((x) => x.id === s.tipoLicencia.circuitoId) ?? pred;
          return { ...s, paso: c?.pasos.find((p) => p.orden === s.pasoActual) ?? null };
        })
        .filter((s) => s.paso && misRoles.has(s.paso.rolId) && !impedimentoParaDecidir(a, { ...s, receptorId: receptor.get(s.id) }));
    }
    // Esperan un dictamen de Reconocimientos Médicos o la resolución de una autoridad externa.
    const esperandoInstrumento = tienePermiso(a, P.LICENCIAS_REVISAR)
      ? await this.prisma.solicitudLicencia.findMany({ where: { institucionId: a.institucionId, estado: { in: ['PENDIENTE_DICTAMEN', 'ELEVADA'] } }, include, orderBy: { fechaSolicitud: 'asc' } })
      : [];
    return { pendientes, enRevision, esperandoInstrumento };
  }

  // ───────────── Acciones ─────────────

  async tomarEnRevision(a: Actor, id: string, version?: number) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudLicencia.findFirst({ where: { id, institucionId: a.institucionId } });
      if (!s) throw new NotFoundException('Solicitud no encontrada');
      if (s.estado !== 'PENDIENTE') throw new ConflictException('Solo pueden recibirse solicitudes pendientes');
      if ((a.docenteId && s.docenteId === a.docenteId) || s.solicitanteId === a.usuarioId)
        throw new ForbiddenException('No puede recibir para revisión una solicitud propia o cargada por usted');
      exigirVersion(s, version);
      const tipo = await tx.tipoLicencia.findUniqueOrThrow({ where: { id: s.tipoLicenciaId } });
      const circuito = await this.solicitudes.circuitoDe(tx, s.institucionId, tipo.circuitoId);
      if (!circuito?.pasos.length) throw new ConflictException('No hay un circuito de autorización configurado para este tipo de licencia');
      const r = await this.solicitudes.cambiarEstado(tx, a, s, 'EN_REVISION', 'Solicitud recibida para revisión');
      const paso = circuito.pasos.find((p) => p.orden === s.pasoActual) ?? circuito.pasos[0];
      await this.avisarPaso(tx, a.institucionId, s.id, s.numero, paso.rolId, paso.nombre);
      return r;
    });
  }

  async decidir(a: Actor, id: string, dto: DecisionDto) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudLicencia.findFirst({ where: { id, institucionId: a.institucionId }, include: { docente: true, designaciones: true } });
      if (!s) throw new NotFoundException('Solicitud no encontrada');
      if (s.estado !== 'EN_REVISION') throw new ConflictException('La solicitud no está en revisión');
      // Hallazgo 13: separación de funciones para autorizar, observar y rechazar.
      const impedimento = impedimentoParaDecidir(a, { ...s, receptorId: await this.solicitudes.receptorDe(tx, s.id) });
      if (impedimento) throw new ForbiddenException(impedimento);
      exigirVersion(s, dto.version);
      const tipo = await tx.tipoLicencia.findUniqueOrThrow({ where: { id: s.tipoLicenciaId } });
      const circuito = await this.solicitudes.circuitoDe(tx, s.institucionId, tipo.circuitoId);
      const paso = circuito?.pasos.find((p) => p.orden === s.pasoActual);
      if (!circuito || !paso) throw new ConflictException('El circuito de autorización no es válido para esta solicitud');
      // Jerarquía de autorización: solo el rol responsable del paso actual puede decidir.
      if (!a.roles.some((r) => r.id === paso.rolId)) throw new ForbiddenException(`Este paso corresponde a: ${paso.rol.nombre}`);

      await tx.autorizacion.create({
        data: { solicitudId: s.id, paso: paso.orden, pasoNombre: paso.nombre, usuarioId: a.usuarioId, decision: dto.decision, observacion: dto.observacion },
      });
      const usuarioDocente = await this.notificaciones.usuarioDeDocente(s.docenteId, tx);
      const destinatarios = [usuarioDocente, s.solicitanteId];
      const ref = { entidad: 'solicitud', entidadId: s.id };

      if (dto.decision === 'OBSERVADA') {
        const r = await this.solicitudes.cambiarEstado(tx, a, s, 'OBSERVADA', `${paso.nombre}: ${dto.observacion}`);
        await this.notificaciones.notificar(destinatarios, { tipo: 'SOLICITUD_OBSERVADA', titulo: `Solicitud ${s.numero} observada`, mensaje: dto.observacion!, ...ref }, tx);
        return r;
      }
      if (dto.decision === 'RECHAZADA') {
        const r = await this.solicitudes.cambiarEstado(tx, a, s, 'RECHAZADA', `${paso.nombre}: ${dto.observacion}`);
        await this.notificaciones.notificar(destinatarios, { tipo: 'SOLICITUD_RECHAZADA', titulo: `Solicitud ${s.numero} rechazada`, mensaje: dto.observacion!, ...ref }, tx);
        return r;
      }

      const siguiente = circuito.pasos.find((p) => p.orden === paso.orden + 1);
      if (siguiente) {
        // Avance de paso dentro de EN_REVISION: no es cambio de estado, pero sí queda registrado.
        const upd = await tx.solicitudLicencia.updateMany({
          where: { id: s.id, estado: 'EN_REVISION', pasoActual: paso.orden, version: s.version },
          data: { pasoActual: siguiente.orden, version: { increment: 1 } },
        });
        if (!upd.count) throw new ConflictException(MENSAJE_CONFLICTO);
        await tx.historialEstado.create({
          data: { solicitudId: s.id, estadoAnterior: 'EN_REVISION', estadoNuevo: 'EN_REVISION', usuarioId: a.usuarioId, comentario: `${paso.nombre}: aprobado. Pasa a ${siguiente.nombre}.${dto.observacion ? ` ${dto.observacion}` : ''}` },
        });
        await this.auditoria.registrar(a, 'APROBAR_PASO', 'solicitud', s.id, { pasoActual: paso.orden }, { pasoActual: siguiente.orden }, tx);
        await this.avisarPaso(tx, a.institucionId, s.id, s.numero, siguiente.rolId, siguiente.nombre);
        return tx.solicitudLicencia.findUniqueOrThrow({ where: { id: s.id } });
      }

      // Fin del circuito interno: con el nomenclador puede quedar esperando el dictamen de Reconocimientos Médicos
      // o elevarse a la autoridad externa; si otorga el Director, se autoriza y se numera la disposición.
      const comentario = `${paso.nombre}: aprobada.${dto.observacion ? ` ${dto.observacion}` : ''}`;
      if (s.motivoId) return this.circuito.finalizarCircuito(tx, a, s, comentario);
      const r = await this.solicitudes.cambiarEstado(tx, a, s, 'AUTORIZADA', `${paso.nombre}: autorizada.${dto.observacion ? ` ${dto.observacion}` : ''}`);
      await this.notificaciones.notificar(destinatarios, {
        tipo: 'SOLICITUD_AUTORIZADA',
        titulo: `Solicitud ${s.numero} autorizada`,
        mensaje: `Licencia autorizada del ${formatoISO(s.fechaDesde)} al ${formatoISO(s.fechaHasta)}.`,
        ...ref,
      }, tx);
      return r;
    });
  }

  private async avisarPaso(tx: Parameters<SolicitudesService['cambiarEstado']>[0], institucionId: string, solicitudId: string, numero: string, rolId: string, pasoNombre: string) {
    await this.notificaciones.notificar(await this.notificaciones.usuariosConRol(institucionId, rolId, tx), {
      tipo: 'PASO_PENDIENTE',
      titulo: `Solicitud ${numero} requiere su intervención`,
      mensaje: `Paso: ${pasoNombre}`,
      entidad: 'solicitud',
      entidadId: solicitudId,
    }, tx);
  }
}
