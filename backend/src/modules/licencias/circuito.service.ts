import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, SolicitudLicencia } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ArchivosService, ArchivoSubido } from '../archivos/archivos.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { diasCorridos, formatoISO, hoy, parseFecha, sumarDias } from '../../common/fechas';
import { ReglasLicenciaService, reglaVigente, ResultadoSolicitud } from '../nomenclador/reglas-licencia.service';
import { cuentaDia } from '../nomenclador/calculo';
import { diasConHorario, noLaborables } from '../nomenclador/calendario.service';
import { DisposicionesService } from './disposiciones.service';
import { escribirCondicionado, exigirVersion, SolicitudesService } from './solicitudes.service';
import { InstrumentoDto, InterrupcionDto, NovedadRrhhDto, ReencuadreDto } from './solicitudes.dto';

type Tx = Prisma.TransactionClient;
type SolicitudConDesignaciones = SolicitudLicencia & { designaciones: { designacionId: string; varianteId: string | null }[] };

/** Destino de una solicitud al terminar el circuito interno (spec, "Circuito de tramitación y autoridades"). */
export function destinoAlFinalizar(regla: { dictamenRM: boolean; autoridad: string | null }, tieneDictamen: boolean): 'PENDIENTE_DICTAMEN' | 'ELEVADA' | 'AUTORIZADA' {
  if (regla.dictamenRM && !tieneDictamen) return 'PENDIENTE_DICTAMEN';
  return regla.autoridad === 'DIRECTOR' ? 'AUTORIZADA' : 'ELEVADA';
}

/** Art. 350: al cesar un interino o suplente, ¿qué pasa con cada licencia? */
export function efectoDelCese(s: { estado: string; subsisteAlCese: boolean; otrasDesignaciones: number }): 'SUBSISTE' | 'QUITAR_DESIGNACION' | 'ANULAR' | 'CANCELAR' {
  if (s.subsisteAlCese) return 'SUBSISTE';
  if (s.otrasDesignaciones > 0) return 'QUITAR_DESIGNACION';
  return s.estado === 'BORRADOR' ? 'ANULAR' : 'CANCELAR';
}

const AUTORIDAD: Record<string, string> = {
  SUPERVISOR: 'Supervisión', SUPERIOR_INMEDIATO: 'el superior inmediato', DIRECTOR_REGIONAL: 'la Dirección Regional', SUBSECRETARIO: 'la Subsecretaría',
  MINISTRO: 'el Ministerio', BIENESTAR: 'la Dirección de Bienestar Educativo', JUNTA: 'la Junta de Clasificación',
};

@Injectable()
export class CircuitoService {
  private log = new Logger('Circuito');

  constructor(
    private prisma: PrismaService,
    private auditoria: AuditoriaService,
    private archivos: ArchivosService,
    private notificaciones: NotificacionesService,
    private solicitudes: SolicitudesService,
    private reglas: ReglasLicenciaService,
    private disposiciones: DisposicionesService,
  ) {}

  private async cargar(tx: Tx, a: Actor, id: string) {
    return this.solicitudes.cargarParaModificar(tx, a, id);
  }

  /** Revalida con el motor antes de otorgar (spec: "y otra vez al autorizarla"). */
  private async revalidar(tx: Tx, a: Actor, s: SolicitudConDesignaciones): Promise<ResultadoSolicitud> {
    const ev = await this.solicitudes.evaluarExistente(tx, a, s);
    if (ev.bloqueantes.length) throw new UnprocessableEntityException({ message: 'La solicitud ya no cumple los requisitos del nomenclador', errores: ev.bloqueantes });
    if (ev.excepcionables.length && !s.excepcionMotivo)
      throw new UnprocessableEntityException({ message: 'Supera topes o requisitos: requiere una excepción (licencias.excepcion) antes de otorgarla', errores: ev.excepcionables });
    return ev;
  }

  /** Último paso del circuito interno aprobado: autoriza, espera dictamen o eleva a la autoridad externa. */
  async finalizarCircuito(tx: Tx, a: Actor, s: SolicitudConDesignaciones, comentario: string) {
    if (!s.motivoId) return this.solicitudes.cambiarEstado(tx, a, s, 'AUTORIZADA', comentario);
    const ev = await this.revalidar(tx, a, s);
    const dictamen = await tx.instrumentoLegal.findFirst({ where: { solicitudId: s.id, tipo: 'DICTAMEN', favorable: { not: false } } });
    return this.avanzar(tx, a, s, destinoAlFinalizar(ev.regla, !!dictamen), comentario, ev);
  }

  private async avanzar(tx: Tx, a: Actor, s: SolicitudConDesignaciones, destino: 'PENDIENTE_DICTAMEN' | 'ELEVADA' | 'AUTORIZADA', comentario: string, ev: ResultadoSolicitud) {
    const docente = await tx.docente.findUniqueOrThrow({ where: { id: s.docenteId } });
    if (destino === 'PENDIENTE_DICTAMEN') {
      const r = await this.solicitudes.cambiarEstado(tx, a, s, 'PENDIENTE_DICTAMEN', `${comentario} Espera el dictamen de Reconocimientos Médicos.`);
      await this.notificaciones.notificar(await this.notificaciones.usuariosConPermiso(a.institucionId, P.LICENCIAS_REVISAR, tx), {
        tipo: 'PASO_PENDIENTE', titulo: `Solicitud ${s.numero}: falta el dictamen de Reconocimientos Médicos`,
        mensaje: `${docente.apellido}, ${docente.nombre}. Cargue el dictamen para continuar.`, entidad: 'solicitud', entidadId: s.id,
      }, tx);
      return r;
    }
    if (destino === 'ELEVADA') {
      const a2 = ev.regla.autoridad ? AUTORIDAD[ev.regla.autoridad] ?? ev.regla.autoridad : 'la autoridad competente';
      const r = await this.solicitudes.cambiarEstado(tx, a, s, 'ELEVADA', `${comentario} Elevada a ${a2}: queda pendiente su instrumento legal.`);
      await this.notificaciones.notificar([await this.notificaciones.usuarioDeDocente(s.docenteId, tx), s.solicitanteId], {
        tipo: 'SOLICITUD_ELEVADA', titulo: `Solicitud ${s.numero} elevada`, mensaje: `La otorga ${a2}. Se le avisará cuando se registre la resolución.`, entidad: 'solicitud', entidadId: s.id,
      }, tx);
      return r;
    }
    const r = await this.solicitudes.cambiarEstado(tx, a, s, 'AUTORIZADA', comentario);
    const disp = await this.disposiciones.emitir(tx, a, s.id);
    await this.notificaciones.notificar([await this.notificaciones.usuarioDeDocente(s.docenteId, tx), s.solicitanteId], {
      tipo: 'SOLICITUD_AUTORIZADA', titulo: `Solicitud ${s.numero} autorizada`,
      mensaje: `Licencia autorizada del ${formatoISO(s.fechaDesde)} al ${formatoISO(s.fechaHasta)}. Disposición N.º ${disp.numero}.`, entidad: 'solicitud', entidadId: s.id,
    }, tx);
    return r;
  }

  /** Dictamen de Reconocimientos Médicos o resolución de la autoridad externa. */
  async registrarInstrumento(a: Actor, id: string, dto: InstrumentoDto, file?: ArchivoSubido) {
    if (dto.tipo === 'DISPOSICION') throw new BadRequestException('Las disposiciones las numera el sistema al autorizar');
    const preparado = file ? await this.archivos.preparar(a, file) : null;
    const resultado = await this.prisma.$transaction(async (tx) => {
      const s = await this.cargar(tx, a, id);
      if (this.solicitudes.esPropia(a, s)) throw new ForbiddenException('No puede registrar instrumentos de una solicitud propia');
      exigirVersion(s, dto.version);
      if (dto.tipo === 'RESOLUCION' && s.estado !== 'ELEVADA') throw new ConflictException('La resolución se registra cuando la solicitud está elevada');
      if (dto.tipo === 'DICTAMEN' && !['PENDIENTE', 'EN_REVISION', 'PENDIENTE_DICTAMEN', 'ELEVADA', 'AUTORIZADA'].includes(s.estado))
        throw new ConflictException('No se puede registrar el dictamen en el estado actual');
      const favorable = dto.favorable !== false;
      const archivo = preparado ? await this.archivos.registrar(a, preparado, true, tx) : null;
      const inst = await tx.instrumentoLegal.create({
        data: {
          institucionId: a.institucionId, solicitudId: s.id, tipo: dto.tipo, numero: dto.numero, fecha: parseFecha(dto.fecha), emisor: dto.emisor,
          favorable, observaciones: dto.observaciones, archivoId: archivo?.id, registradoPorId: a.usuarioId,
        },
      });
      await this.auditoria.registrar(a, `REGISTRAR_${dto.tipo}`, 'solicitud', s.id, null, { instrumento: inst.id, numero: dto.numero, favorable }, tx);
      const etiqueta = dto.tipo === 'DICTAMEN' ? `Dictamen de Reconocimientos Médicos N.º ${dto.numero}` : `Resolución N.º ${dto.numero} (${dto.emisor})`;
      let nueva: SolicitudLicencia | null = null;
      if (!favorable && ['PENDIENTE_DICTAMEN', 'ELEVADA'].includes(s.estado)) {
        nueva = await this.solicitudes.cambiarEstado(tx, a, s, 'RECHAZADA', `${etiqueta}: desfavorable.`);
      } else if (favorable && s.estado === 'PENDIENTE_DICTAMEN') {
        const ev = await this.revalidar(tx, a, s);
        nueva = await this.avanzar(tx, a, s, destinoAlFinalizar(ev.regla, true), `${etiqueta}: favorable.`, ev);
      } else if (favorable && s.estado === 'ELEVADA') {
        // La autoridad externa otorga: la escuela registra su instrumento (no emite disposición propia).
        await this.revalidar(tx, a, s);
        nueva = await this.solicitudes.cambiarEstado(tx, a, s, 'AUTORIZADA', `${etiqueta}: otorgada.`);
      }
      if (nueva && ['AUTORIZADA', 'RECHAZADA'].includes(nueva.estado))
        await this.notificaciones.notificar([await this.notificaciones.usuarioDeDocente(s.docenteId, tx), s.solicitanteId], {
          tipo: nueva.estado === 'AUTORIZADA' ? 'SOLICITUD_AUTORIZADA' : 'SOLICITUD_RECHAZADA', titulo: `Solicitud ${s.numero} ${nueva.estado === 'AUTORIZADA' ? 'autorizada' : 'rechazada'}`,
          mensaje: etiqueta, entidad: 'solicitud', entidadId: s.id,
        }, tx);
      return { instrumento: inst, solicitud: nueva ?? s, archivoId: archivo?.id ?? null, docenteId: s.docenteId };
    });
    if (preparado && resultado.archivoId) {
      await this.archivos.persistir(preparado, () => this.prisma.$transaction([
        this.prisma.instrumentoLegal.update({ where: { id: resultado.instrumento.id }, data: { archivoId: null } }),
        this.prisma.archivo.delete({ where: { id: resultado.archivoId! } }),
      ]));
    }
    await this.reglas.recalcularSaldos(a, resultado.docenteId, new Date(), this.prisma, false).catch(() => undefined);
    return resultado.instrumento;
  }

  /**
   * Arts. 313 b y c: sin dictamen dentro de las 24 h del reintegro, las faltas pasan a injustificadas y se avisa a
   * Secretaría. Corre todos los días a las 8.
   */
  @Cron('0 8 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async vencimientosDeDictamen(fecha = hoy()) {
    const limite = sumarDias(fecha, -2); // reintegro = día siguiente al fin; + 24 h
    const candidatas = await this.prisma.solicitudLicencia.findMany({
      where: {
        motivoId: { not: null }, dictamenVencido: false, fechaHasta: { lte: limite },
        estado: { in: ['PENDIENTE', 'EN_REVISION', 'OBSERVADA', 'PENDIENTE_DICTAMEN'] },
        instrumentos: { none: { tipo: 'DICTAMEN' } },
      },
      include: { designaciones: { include: { designacion: { include: { horarios: true } } } }, docente: true },
    });
    let vencidas = 0;
    for (const s of candidatas) {
      const varianteId = s.designaciones.find((d) => d.varianteId)?.varianteId;
      const vig = varianteId ? await reglaVigente(this.prisma, varianteId, s.fechaDesde) : null;
      if (!vig?.regla.dictamenRM) continue;
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.solicitudLicencia.updateMany({ where: { id: s.id, version: s.version, dictamenVencido: false }, data: { dictamenVencido: true, version: { increment: 1 } } });
        if (!r.count) return;
        const feriados = await noLaborables(tx, s.institucionId, s.fechaDesde, s.fechaHasta);
        for (const { designacion: d } of s.designaciones) {
          const cal = { noLaborables: feriados, diasConHorario: diasConHorario([d]) };
          for (let f = s.fechaDesde; f <= s.fechaHasta; f = sumarDias(f, 1)) {
            if (!cuentaDia('LABORABLES', f, cal)) continue;
            const datos = { estado: 'AUSENTE' as const, justificada: false, justificacion: `Sin dictamen de Reconocimientos Médicos dentro de las 24 h del reintegro (art. 313). Solicitud ${s.numero}`, registradaPorId: 'sistema' };
            await tx.asistencia.upsert({
              where: { designacionId_fecha: { designacionId: d.id, fecha: f } },
              create: { ...datos, institucionId: s.institucionId, docenteId: s.docenteId, designacionId: d.id, fecha: f },
              update: datos,
            });
          }
        }
        await tx.historialEstado.create({ data: { solicitudId: s.id, estadoAnterior: s.estado, estadoNuevo: s.estado, usuarioId: 'sistema', comentario: 'Venció el plazo para el dictamen de Reconocimientos Médicos: las faltas pasan a injustificadas (art. 313).' } });
        await this.notificaciones.notificar(await this.notificaciones.usuariosConPermiso(s.institucionId, P.LICENCIAS_REVISAR, tx), {
          tipo: 'DICTAMEN_VENCIDO', titulo: `Sin dictamen: ${s.docente.apellido}, ${s.docente.nombre} (${s.numero})`,
          mensaje: `Pasaron 24 h del reintegro sin dictamen de Reconocimientos Médicos. Las faltas del ${formatoISO(s.fechaDesde)} al ${formatoISO(s.fechaHasta)} quedaron injustificadas.`,
          entidad: 'solicitud', entidadId: s.id,
        }, tx);
        await this.auditoria.registrar({ institucionId: s.institucionId }, 'DICTAMEN_VENCIDO', 'solicitud', s.id, null, { faltasInjustificadas: true }, tx);
        vencidas++;
      });
    }
    if (vencidas) this.log.log(`Dictámenes vencidos: ${vencidas}`);
    return vencidas;
  }

  /** Art. 350: al dar de baja la designación de un interino, transitorio o suplente se cancelan sus licencias en curso. */
  async cancelarPorCese(tx: Tx, a: Actor, designacionId: string, fechaCese: Date, motivoCese?: string) {
    const designacion = await tx.designacion.findUniqueOrThrow({ where: { id: designacionId } });
    if (designacion.situacionRevista === 'TITULAR') return [];
    const afectadas = await tx.solicitudLicencia.findMany({
      where: {
        institucionId: a.institucionId, designaciones: { some: { designacionId } }, fechaHasta: { gte: fechaCese },
        estado: { in: ['BORRADOR', 'PENDIENTE', 'EN_REVISION', 'OBSERVADA', 'PENDIENTE_DICTAMEN', 'ELEVADA', 'AUTORIZADA'] },
      },
      include: { designaciones: { include: { designacion: true } } },
    });
    const resultado: { solicitudId: string; efecto: string }[] = [];
    for (const s of afectadas) {
      const varianteId = s.designaciones.find((d) => d.designacionId === designacionId)?.varianteId;
      const vig = varianteId ? await reglaVigente(tx, varianteId, s.fechaDesde) : null;
      const otras = s.designaciones.filter((d) => d.designacionId !== designacionId && d.designacion.activa).length;
      const efecto = efectoDelCese({ estado: s.estado, subsisteAlCese: !!vig?.regla.subsisteAlCese, otrasDesignaciones: otras });
      const nota = `Cese de la designación${motivoCese ? ` (${motivoCese})` : ''} el ${formatoISO(fechaCese)}`;
      if (efecto === 'SUBSISTE') {
        await tx.historialEstado.create({ data: { solicitudId: s.id, estadoAnterior: s.estado, estadoNuevo: s.estado, usuarioId: a.usuarioId, comentario: `${nota}: la licencia continúa hasta su fin (arts. 331 d y f, 340 d y f).` } });
      } else if (efecto === 'QUITAR_DESIGNACION') {
        await escribirCondicionado(tx, s, [s.estado]);
        await tx.solicitudDesignacion.delete({ where: { solicitudId_designacionId: { solicitudId: s.id, designacionId } } });
        await tx.historialEstado.create({ data: { solicitudId: s.id, estadoAnterior: s.estado, estadoNuevo: s.estado, usuarioId: a.usuarioId, comentario: `${nota}: se quita esa designación de la licencia (art. 350).` } });
      } else {
        const fin = fechaCese < s.fechaDesde ? s.fechaDesde : fechaCese;
        const dias = fechaCese < s.fechaDesde ? 0 : Math.min(s.diasComputados, diasCorridos(s.fechaDesde, fin));
        await this.solicitudes.cambiarEstado(tx, a, s, efecto === 'ANULAR' ? 'ANULADA' : 'CANCELADA_CESE', `${nota}: licencia cancelada (art. 350).`, { fechaHasta: fin, diasComputados: dias });
        await this.notificaciones.notificar([await this.notificaciones.usuarioDeDocente(s.docenteId, tx)], {
          tipo: 'LICENCIA_CANCELADA', titulo: `Licencia ${s.numero} cancelada por cese`, mensaje: `${nota}. La licencia se cancela según el art. 350.`, entidad: 'solicitud', entidadId: s.id,
        }, tx);
      }
      resultado.push({ solicitudId: s.id, efecto });
    }
    return resultado;
  }

  /** Art. 315: la anual se interrumpe por enfermedad, maternidad o razones de servicio y se retoma después. */
  async interrumpir(a: Actor, id: string, dto: InterrupcionDto) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudLicencia.findFirst({ where: { id, institucionId: a.institucionId }, include: { designaciones: true, motivoNomenclador: true } });
      if (!s) throw new NotFoundException('Solicitud no encontrada');
      if (s.estado !== 'AUTORIZADA' || s.motivoNomenclador?.codigo !== '2.1') throw new ConflictException('Solo se interrumpe una licencia anual autorizada');
      exigirVersion(s, dto.version);
      const fecha = parseFecha(dto.fecha);
      if (fecha <= s.fechaDesde || fecha > s.fechaHasta) throw new BadRequestException('La fecha de interrupción debe estar dentro de la licencia (después del primer día)');
      const causa = { ENFERMEDAD: 'enfermedad', MATERNIDAD: 'maternidad', RAZONES_DE_SERVICIO: 'razones de servicio' }[dto.causa];
      const finUsado = sumarDias(fecha, -1);
      const r = await this.solicitudes.cambiarEstado(tx, a, s, 'INTERRUMPIDA', `Interrumpida desde el ${formatoISO(fecha)} por ${causa} (art. 315).${dto.observaciones ? ` ${dto.observaciones}` : ''}`,
        { fechaHasta: finUsado, diasComputados: diasCorridos(s.fechaDesde, finUsado) });
      // El resto queda como borrador para retomarlo: hay que ajustar las fechas cuando se reanude.
      const resto = await this.solicitudes.crear(a, {
        docenteId: s.docenteId, motivoId: s.motivoId!, designacionIds: s.designaciones.map((d) => d.designacionId),
        variantes: s.designaciones.filter((d) => d.varianteId).map((d) => ({ designacionId: d.designacionId, varianteId: d.varianteId! })),
        fechaDesde: formatoISO(fecha), fechaHasta: formatoISO(s.fechaHasta), motivo: `Resto de la licencia anual ${s.numero} interrumpida por ${causa}. Ajuste las fechas al retomarla.`,
      }, tx, { derivada: true });
      await tx.solicitudLicencia.update({ where: { id: resto.id }, data: { solicitudPadreId: s.id } });
      await this.auditoria.registrar(a, 'INTERRUMPIR_ANUAL', 'solicitud', s.id, { fechaHasta: formatoISO(s.fechaHasta) }, { fechaHasta: formatoISO(finUsado), causa: dto.causa, resto: resto.id }, tx);
      return { solicitud: r, resto };
    });
  }

  /** Art. 316: una enfermedad común pasa a largo tratamiento sin agotar los 45 días. */
  async reencuadrar(a: Actor, id: string, dto: ReencuadreDto) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudLicencia.findFirst({ where: { id, institucionId: a.institucionId }, include: { designaciones: true, motivoNomenclador: true } });
      if (!s) throw new NotFoundException('Solicitud no encontrada');
      if (s.motivoNomenclador?.codigo !== '1.1' || !['EN_REVISION', 'PENDIENTE_DICTAMEN', 'AUTORIZADA'].includes(s.estado))
        throw new ConflictException('Solo se reencuadra una enfermedad común en revisión, con dictamen pendiente o autorizada');
      if (this.solicitudes.esPropia(a, s)) throw new ForbiddenException('No puede reencuadrar una solicitud propia');
      exigirVersion(s, dto.version);
      const largo = await tx.motivoLicencia.findFirst({ where: { codigo: '1.2', activo: true, regimenId: s.motivoNomenclador.regimenId } });
      if (!largo) throw new UnprocessableEntityException('El régimen no tiene el motivo 1.2 (largo tratamiento)');
      await this.solicitudes.cambiarEstado(tx, a, s, 'REENCUADRADA', `Reencuadrada como largo tratamiento (art. 316).${dto.observaciones ? ` ${dto.observaciones}` : ''}`);
      const nueva = await this.solicitudes.crear(a, {
        docenteId: s.docenteId, motivoId: largo.id, designacionIds: s.designaciones.map((d) => d.designacionId), variantes: dto.variantes,
        fechaDesde: formatoISO(s.fechaDesde), fechaHasta: formatoISO(s.fechaHasta), motivo: s.motivo ?? undefined,
      }, tx, { derivada: true });
      await tx.solicitudLicencia.update({ where: { id: nueva.id }, data: { solicitudPadreId: s.id, solicitanteId: s.solicitanteId } });
      await this.auditoria.registrar(a, 'REENCUADRAR', 'solicitud', s.id, null, { nueva: nueva.id }, tx);
      return { solicitud: await tx.solicitudLicencia.findUniqueOrThrow({ where: { id } }), nueva };
    });
  }

  /** Licencia automática 2.11 (ascenso de jerarquía o incompatibilidad por subrogancia) desde la nueva designación. */
  async licenciaAutomatica(a: Actor, designacionNuevaId: string, designacionAfectadaId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [nueva, afectada] = await Promise.all([
        tx.designacion.findFirst({ where: { id: designacionNuevaId, docente: { institucionId: a.institucionId } } }),
        tx.designacion.findFirst({ where: { id: designacionAfectadaId, docente: { institucionId: a.institucionId } } }),
      ]);
      if (!nueva || !afectada) throw new NotFoundException('Designación no encontrada');
      if (nueva.docenteId !== afectada.docenteId || nueva.id === afectada.id) throw new BadRequestException('Las designaciones deben ser del mismo docente y distintas');
      const motivo = await tx.motivoLicencia.findFirst({ where: { codigo: '2.11', activo: true, regimen: { institucionId: a.institucionId } } });
      if (!motivo) throw new UnprocessableEntityException('El régimen no tiene el motivo 2.11 del nomenclador');
      const hasta = nueva.fechaHasta ?? new Date(Date.UTC(nueva.fechaDesde.getUTCFullYear(), 11, 31));
      return this.solicitudes.crearDirecta(tx, a, {
        docenteId: nueva.docenteId, motivoId: motivo.id, designacionIds: [afectada.id], desde: nueva.fechaDesde, hasta, origen: 'AUTOMATICA',
        comentario: `Generada desde la designación ${nueva.resolucion ? `(${nueva.resolucion}) ` : ''}del ${formatoISO(nueva.fechaDesde)} (arts. 319, 333 e y 342 e).`,
      });
    });
  }

  /** Sanciones y movimientos provisorios: los registra RR.HH. con su instrumento legal; no consumen topes. */
  async registrarNovedad(a: Actor, dto: NovedadRrhhDto) {
    return this.prisma.$transaction(async (tx) => {
      const motivo = await tx.motivoLicencia.findFirst({ where: { id: dto.motivoId, regimen: { institucionId: a.institucionId } } });
      if (!motivo) throw new NotFoundException('Motivo inexistente');
      if (motivo.agrupacion < 4) throw new BadRequestException('Las licencias y permisos se piden como solicitud');
      const s = await this.solicitudes.crearDirecta(tx, a, {
        docenteId: dto.docenteId, motivoId: dto.motivoId, designacionIds: dto.designacionIds, variantes: dto.variantes,
        desde: parseFecha(dto.fechaDesde), hasta: parseFecha(dto.fechaHasta), origen: 'NOVEDAD_RRHH', motivo: dto.observaciones,
        comentario: `Novedad de RR.HH. registrada con ${dto.instrumentoNumero} (${dto.instrumentoEmisor}).`,
      });
      await tx.instrumentoLegal.create({
        data: {
          institucionId: a.institucionId, solicitudId: s.id, tipo: 'RESOLUCION', numero: dto.instrumentoNumero, fecha: parseFecha(dto.instrumentoFecha),
          emisor: dto.instrumentoEmisor, favorable: true, registradoPorId: a.usuarioId,
        },
      });
      return s;
    });
  }

  /** ¿El actor puede registrar instrumentos? (Secretaría o quien interviene en el circuito.) */
  static puedeRegistrar(a: Actor) {
    return tienePermiso(a, P.LICENCIAS_REVISAR) || tienePermiso(a, P.AUTORIZACIONES_DECIDIR);
  }
}
