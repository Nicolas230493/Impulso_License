import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, TipoNotificacion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { P } from '../../common/permisos';
import { formatoISO, hoy, sumarDias } from '../../common/fechas';

/**
 * Racha final de días laborables registrados como ausente sin aviso. Los registros de asistencia existen solo para
 * los días con clase, así que registros consecutivos son días laborables consecutivos.
 */
export function rachaSinAviso(registros: { fecha: string; sinAviso: boolean }[]) {
  const ordenados = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porFecha = new Map<string, boolean>();
  for (const r of ordenados) porFecha.set(r.fecha, (porFecha.get(r.fecha) ?? true) && r.sinAviso); // varias designaciones el mismo día
  const dias = [...porFecha.entries()];
  let n = 0;
  for (let i = dias.length - 1; i >= 0 && dias[i][1]; i--) n++;
  return { dias: n, desde: n ? dias[dias.length - n][0] : null };
}

type Cliente = Prisma.TransactionClient | PrismaService;

export interface DatosNotificacion {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidad?: string;
  entidadId?: string;
}

@Injectable()
export class NotificacionesService {
  private log = new Logger('Notificaciones');
  constructor(private prisma: PrismaService) {}

  async notificar(usuarioIds: (string | null | undefined)[], datos: DatosNotificacion, tx: Cliente = this.prisma) {
    const ids = [...new Set(usuarioIds.filter(Boolean) as string[])];
    if (!ids.length) return;
    await tx.notificacion.createMany({ data: ids.map((usuarioId) => ({ usuarioId, ...datos })) });
    // TODO(fase 8): encolar el envío de correo electrónico con BullMQ (Redis ya disponible en docker-compose).
  }

  async usuariosConPermiso(institucionId: string, permiso: string, tx: Cliente = this.prisma) {
    const us = await tx.usuario.findMany({
      where: { institucionId, activo: true, roles: { some: { rol: { permisos: { some: { permiso: { codigo: permiso } } } } } } },
      select: { id: true },
    });
    return us.map((u) => u.id);
  }

  /** Usuarios activos de la institución con el rol indicado (hallazgo 23: nunca de otra institución). */
  async usuariosConRol(institucionId: string, rolId: string, tx: Cliente = this.prisma) {
    const us = await tx.usuario.findMany({ where: { institucionId, activo: true, roles: { some: { rolId, rol: { institucionId } } } }, select: { id: true } });
    return us.map((u) => u.id);
  }

  async usuarioDeDocente(docenteId: string, tx: Cliente = this.prisma) {
    const u = await tx.usuario.findUnique({ where: { docenteId }, select: { id: true, activo: true } });
    return u?.activo ? u.id : null;
  }

  // ── Alertas programadas ──

  /** Todos los días a las 7:00 genera avisos de vencimientos y reincorporaciones pendientes. */
  @Cron('0 7 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async generarAlertas() {
    const h = hoy();
    const porVencer = await this.prisma.solicitudLicencia.findMany({
      where: { estado: 'AUTORIZADA', fechaHasta: { gte: h, lte: sumarDias(h, 3) } },
      include: { docente: true },
    });
    for (const s of porVencer) {
      if (await this.yaNotificado('LICENCIA_POR_FINALIZAR', s.id)) continue;
      const destinatarios = [await this.usuarioDeDocente(s.docenteId), ...(await this.usuariosConPermiso(s.institucionId, P.REINCORPORACIONES_REGISTRAR))];
      await this.notificar(destinatarios, {
        tipo: 'LICENCIA_POR_FINALIZAR',
        titulo: `Licencia ${s.numero} próxima a finalizar`,
        mensaje: `La licencia de ${s.docente.apellido}, ${s.docente.nombre} finaliza el ${formatoISO(s.fechaHasta)}.`,
        entidad: 'solicitud',
        entidadId: s.id,
      });
    }

    const vencidas = await this.prisma.solicitudLicencia.findMany({
      where: { estado: 'AUTORIZADA', fechaHasta: { lt: h }, reincorporacion: null },
      include: { docente: true },
    });
    for (const s of vencidas) {
      if (await this.yaNotificado('REINCORPORACION_PENDIENTE', s.id)) continue;
      await this.notificar(await this.usuariosConPermiso(s.institucionId, P.REINCORPORACIONES_REGISTRAR), {
        tipo: 'REINCORPORACION_PENDIENTE',
        titulo: `Reincorporación pendiente: ${s.docente.apellido}, ${s.docente.nombre}`,
        mensaje: `La licencia ${s.numero} venció el ${formatoISO(s.fechaHasta)} y no tiene reincorporación registrada.`,
        entidad: 'solicitud',
        entidadId: s.id,
      });
    }
    this.log.log(`Alertas generadas: ${porVencer.length} por vencer, ${vencidas.length} reincorporaciones pendientes`);
  }

  /** Día 1 de cada mes: recordatorio de la estadística mensual (se carga del 1 al 10). */
  @Cron('0 7 1 * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async recordarEstadisticaMensual(fecha = hoy()) {
    const anterior = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - 1, 1));
    const periodo = `${String(anterior.getUTCMonth() + 1).padStart(2, '0')}/${anterior.getUTCFullYear()}`;
    const instituciones = await this.prisma.institucion.findMany({ where: { activa: true }, select: { id: true } });
    for (const i of instituciones) {
      await this.notificar(await this.usuariosConPermiso(i.id, P.REPORTES_VER), {
        tipo: 'ESTADISTICA_MENSUAL', titulo: `Estadística mensual ${periodo}`,
        mensaje: 'Ya puede generar la estadística mensual en Informes (se presenta del 1 al 10).', entidad: 'informe', entidadId: 'estadistica-mensual',
      });
    }
  }

  /**
   * Art. 328: cinco días laborables seguidos sin aviso son abandono de servicio (a los 10 corridos, cesantía).
   * Revisa la asistencia todos los días y avisa una vez por racha a quien registra reincorporaciones y a la dirección.
   */
  @Cron('30 7 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async detectarAbandono(fecha = hoy()) {
    const desde = sumarDias(fecha, -21);
    const regs = await this.prisma.asistencia.findMany({
      where: { fecha: { gte: desde, lt: fecha } },
      select: { institucionId: true, docenteId: true, fecha: true, estado: true, aviso: true, docente: { select: { apellido: true, nombre: true } } },
      orderBy: { fecha: 'asc' },
    });
    const porDocente = new Map<string, typeof regs>();
    for (const r of regs) porDocente.set(r.docenteId, [...(porDocente.get(r.docenteId) ?? []), r]);
    let avisos = 0;
    for (const [docenteId, lista] of porDocente) {
      const racha = rachaSinAviso(lista.map((r) => ({ fecha: formatoISO(r.fecha), sinAviso: r.estado === 'AUSENTE' && r.aviso === 'SIN_AVISO' })));
      if (racha.dias < 5) continue;
      const clave = `${docenteId}:${racha.desde}`;
      if (await this.yaNotificado('ABANDONO_SERVICIO', clave)) continue;
      const { institucionId, docente } = lista[0];
      const destinatarios = [...(await this.usuariosConPermiso(institucionId, P.REINCORPORACIONES_REGISTRAR)), ...(await this.usuariosConPermiso(institucionId, P.AUTORIZACIONES_DECIDIR))];
      await this.notificar(destinatarios, {
        tipo: 'ABANDONO_SERVICIO', titulo: `Posible abandono de servicio: ${docente.apellido}, ${docente.nombre}`,
        mensaje: `${racha.dias} días laborables seguidos ausente sin aviso desde el ${racha.desde} (art. 328). A los 10 días corridos queda en situación de cesantía.`,
        entidad: 'docente', entidadId: clave,
      });
      avisos++;
    }
    return avisos;
  }

  private async yaNotificado(tipo: TipoNotificacion, entidadId: string) {
    return (await this.prisma.notificacion.count({ where: { tipo, entidadId } })) > 0;
  }
}
