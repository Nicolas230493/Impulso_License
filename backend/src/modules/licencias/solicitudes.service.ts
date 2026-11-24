import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EstadoSolicitud, Prisma, SituacionRevista, SolicitudLicencia } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ArchivosService, ArchivoSubido } from '../archivos/archivos.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { diasCorridos, formatoISO, hoy, mesesEntre, parseFecha, sumarDias } from '../../common/fechas';
import { paginar, resultadoPaginado } from '../../common/paginacion.dto';
import {
  computarDias, detectarSuperposiciones, documentosFaltantes, ESTADOS_COMPUTABLES, ESTADOS_DOCUMENTACION, ESTADOS_EDITABLES,
  ESTADOS_VERIFICACION, ESTADOS_VIGENTES, evaluarReglas, formatoNumero, impedimentoParaDecidir, puedeTransicionar, validarPeriodo,
} from './reglas-negocio';
import { ActualizarSolicitudDto, CrearSolicitudDto, ExcepcionDto, FiltroSolicitudesDto, ReincorporacionDto, VarianteDesignacionDto } from './solicitudes.dto';
import { ReglasLicenciaService, reglaVigente, ResultadoSolicitud } from '../nomenclador/reglas-licencia.service';
import { diasConHorario, noLaborables } from '../nomenclador/calendario.service';
import { fechaFinPorDias } from '../nomenclador/calculo';
import { accesoCompleto } from '../../common/sensitive/sensitive-data.policy';
import { resolverVariantes } from './variantes';

type Tx = Prisma.TransactionClient;

export const MENSAJE_CONFLICTO = 'La solicitud cambió; recargue';
/** Estados en trámite: la solicitud todavía puede cambiar de resultado. */
export const ESTADOS_EN_TRAMITE: EstadoSolicitud[] = ['BORRADOR', 'PENDIENTE', 'EN_REVISION', 'OBSERVADA', 'PENDIENTE_DICTAMEN', 'ELEVADA'];

const INCLUDE_DETALLE = {
  docente: { select: { id: true, legajo: true, apellido: true, nombre: true, dni: true, fechaIngreso: true } },
  tipoLicencia: { include: { regimen: { select: { id: true, codigo: true, nombre: true } }, reglas: true } },
  designaciones: {
    include: {
      designacion: { include: { cargo: true, curso: true, espacio: true } },
      variante: { select: { id: true, codigo: true, encuadreLegal: true, denominacion: true, pctHaberes: true, autoridad: true } },
    },
  },
  motivoNomenclador: { select: { id: true, codigo: true, nombre: true, agrupacion: true, planillaIL: true } },
  instrumentos: { orderBy: { createdAt: 'asc' as const }, select: { id: true, tipo: true, numero: true, fecha: true, emisor: true, favorable: true, archivoId: true, observaciones: true } },
  padre: { select: { id: true, numero: true, estado: true } },
  derivadas: { select: { id: true, numero: true, estado: true, fechaDesde: true, fechaHasta: true } },
  documentos: { include: { archivo: { select: { id: true, nombreOriginal: true, mimeType: true, tamanio: true, confidencial: true } } }, orderBy: { createdAt: 'asc' as const } },
  autorizaciones: { orderBy: { fecha: 'asc' as const } },
  historial: { orderBy: { fecha: 'asc' as const } },
  reincorporacion: true,
  reemplazos: { include: { suplentes: { include: { suplente: { select: { id: true, apellido: true, nombre: true } } } } } },
} satisfies Prisma.SolicitudLicenciaInclude;

/** Tramos de haberes como JSON (o NULL en la base). */
const jsonTramos = (t: { dias: number; pct: number }[] | null) => (t ? (t.map((x) => ({ ...x })) as Prisma.InputJsonValue) : Prisma.DbNull);

/** Quien recibió la solicitud para revisión: la última transición PENDIENTE → EN_REVISION. */
export function receptorDeHistorial(historial: { estadoAnterior: EstadoSolicitud | null; estadoNuevo: EstadoSolicitud; usuarioId: string }[]) {
  return [...historial].reverse().find((h) => h.estadoAnterior === 'PENDIENTE' && h.estadoNuevo === 'EN_REVISION')?.usuarioId ?? null;
}

/**
 * Escritura condicionada (patrón obligatorio de la Fase 4): solo modifica la solicitud si sigue en uno de los
 * estados permitidos y con la misma versión que se leyó. Si no, 409.
 */
export async function escribirCondicionado(
  tx: Tx,
  s: { id: string; version: number },
  estadosPermitidos: EstadoSolicitud[],
  cambios: Prisma.SolicitudLicenciaUncheckedUpdateManyInput = {},
) {
  const r = await tx.solicitudLicencia.updateMany({
    where: { id: s.id, estado: { in: estadosPermitidos }, version: s.version },
    data: { ...cambios, version: { increment: 1 } },
  });
  if (r.count === 0) throw new ConflictException(MENSAJE_CONFLICTO);
}

/** Si el cliente envió la versión que leyó, debe coincidir con la actual. */
export function exigirVersion(s: { version: number }, version?: number) {
  if (version !== undefined && version !== s.version) throw new ConflictException(MENSAJE_CONFLICTO);
}

@Injectable()
export class SolicitudesService {
  constructor(
    private prisma: PrismaService,
    private auditoria: AuditoriaService,
    private archivos: ArchivosService,
    private notificaciones: NotificacionesService,
    private reglas: ReglasLicenciaService,
  ) {}

  // ───────────── Consultas ─────────────
  // Las respuestas pasan por SensitiveDataPolicy (el controlador está marcado con @ExponeEntidad('solicitud')).

  filtroVisibilidad(a: Actor): Prisma.SolicitudLicenciaWhereInput {
    if (tienePermiso(a, P.LICENCIAS_VER_TODAS)) return { institucionId: a.institucionId };
    return {
      institucionId: a.institucionId,
      OR: [{ solicitanteId: a.usuarioId }, ...(a.docenteId ? [{ docenteId: a.docenteId }] : [])],
    };
  }

  async listar(a: Actor, f: FiltroSolicitudesDto) {
    const estados = f.estado ? (Array.isArray(f.estado) ? f.estado : [f.estado]) : undefined;
    const where: Prisma.SolicitudLicenciaWhereInput = {
      AND: [
        this.filtroVisibilidad(a),
        {
          estado: estados ? { in: estados } : undefined,
          docenteId: f.docenteId,
          tipoLicenciaId: f.tipoLicenciaId,
          ...(f.desde && { fechaHasta: { gte: parseFecha(f.desde) } }),
          ...(f.hasta && { fechaDesde: { lte: parseFecha(f.hasta) } }),
          ...(f.buscar && {
            OR: [
              { numero: { contains: f.buscar, mode: 'insensitive' } },
              { docente: { apellido: { contains: f.buscar, mode: 'insensitive' } } },
              { docente: { dni: { contains: f.buscar } } },
            ],
          }),
        },
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.solicitudLicencia.findMany({
        where,
        orderBy: { fechaSolicitud: 'desc' },
        ...paginar(f),
        include: {
          docente: { select: { id: true, legajo: true, apellido: true, nombre: true } },
          tipoLicencia: { select: { id: true, codigo: true, nombre: true, categoria: true, sensible: true } },
        },
      }),
      this.prisma.solicitudLicencia.count({ where }),
    ]);
    return resultadoPaginado(items, total, f);
  }

  async obtener(a: Actor, id: string) {
    const s = await this.prisma.solicitudLicencia.findFirst({ where: { AND: [{ id }, this.filtroVisibilidad(a)] }, include: INCLUDE_DETALLE });
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    const circuito = await this.circuitoDe(this.prisma, s.institucionId, s.tipoLicencia.circuitoId);
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: [...new Set([s.solicitanteId, ...s.historial.map((h) => h.usuarioId), ...s.autorizaciones.map((x) => x.usuarioId)])] }, institucionId: s.institucionId },
      select: { id: true, nombre: true, apellido: true },
    });
    const pasoActual = circuito?.pasos.find((p) => p.orden === s.pasoActual) ?? null;
    // Evaluación en vivo con el nomenclador (topes, saldos, requisitos) mientras la solicitud está en trámite.
    let evaluacion: ResultadoSolicitud | null = null;
    if (s.motivoId && ESTADOS_EN_TRAMITE.includes(s.estado) && (accesoCompleto(a, s.docenteId) || !s.tipoLicencia.sensible)) {
      evaluacion = await this.evaluarExistente(this.prisma, a, s).catch(() => null);
    }
    return {
      ...s,
      designaciones: s.designaciones.map((d) => d.designacion),
      variantes: s.designaciones.filter((d) => d.variante).map((d) => ({ designacionId: d.designacionId, revista: d.revista, ...d.variante! })),
      circuito,
      evaluacion,
      // 'sistema' registra las acciones automáticas (p. ej. el vencimiento del dictamen).
      usuarios: { sistema: 'Sistema (automático)', ...Object.fromEntries(usuarios.map((u) => [u.id, `${u.apellido}, ${u.nombre}`])) },
      acciones: this.accionesDisponibles(a, s, pasoActual?.rolId ?? null, receptorDeHistorial(s.historial), evaluacion),
    };
  }

  /** Acciones que el usuario puede ejecutar ahora: el frontend las usa para mostrar botones. */
  private accionesDisponibles(
    a: Actor, s: SolicitudLicencia & { motivoNomenclador?: { codigo: string } | null; instrumentos?: { tipo: string }[] },
    rolPasoActual: string | null, receptorId: string | null, evaluacion: ResultadoSolicitud | null = null,
  ) {
    const propia = this.esPropia(a, s);
    const motivo = s.motivoNomenclador?.codigo;
    const revisa = tienePermiso(a, P.LICENCIAS_REVISAR) && !propia;
    return {
      cargarDictamen: ['EN_REVISION', 'PENDIENTE_DICTAMEN'].includes(s.estado) && revisa && (s.estado === 'PENDIENTE_DICTAMEN' || !!evaluacion?.regla.dictamenRM),
      cargarResolucion: s.estado === 'ELEVADA' && revisa,
      excepcion: tienePermiso(a, P.LICENCIAS_EXCEPCION) && !propia && ESTADOS_EN_TRAMITE.includes(s.estado) && !s.excepcionMotivo && !!evaluacion?.requiereExcepcion,
      partir: ESTADOS_EDITABLES.includes(s.estado) && (propia || tienePermiso(a, P.LICENCIAS_CARGAR)) && !!evaluacion?.porDesignacion.some((x) => x.propuestaParticion),
      interrumpir: s.estado === 'AUTORIZADA' && motivo === '2.1' && (tienePermiso(a, P.REINCORPORACIONES_REGISTRAR) || revisa),
      reencuadrar: motivo === '1.1' && ['EN_REVISION', 'PENDIENTE_DICTAMEN', 'AUTORIZADA'].includes(s.estado) && revisa,
      disposicion: !!s.instrumentos?.some((i) => i.tipo === 'DISPOSICION'),
      editar: ESTADOS_EDITABLES.includes(s.estado) && (propia || tienePermiso(a, P.LICENCIAS_CARGAR)),
      presentar: ESTADOS_EDITABLES.includes(s.estado) && (propia || tienePermiso(a, P.LICENCIAS_CARGAR)),
      adjuntar: ESTADOS_DOCUMENTACION.includes(s.estado) && (propia || tienePermiso(a, P.LICENCIAS_CARGAR)),
      tomar: s.estado === 'PENDIENTE' && tienePermiso(a, P.LICENCIAS_REVISAR) && !propia,
      decidir:
        s.estado === 'EN_REVISION' && tienePermiso(a, P.AUTORIZACIONES_DECIDIR) && !!rolPasoActual &&
        a.roles.some((r) => r.id === rolPasoActual) && !impedimentoParaDecidir(a, { ...s, receptorId }),
      verificarDocumentos: ESTADOS_VERIFICACION.includes(s.estado) && tienePermiso(a, P.LICENCIAS_REVISAR) && !propia,
      anular: this.puedeAnular(a, s),
      reincorporar: s.estado === 'AUTORIZADA' && tienePermiso(a, P.REINCORPORACIONES_REGISTRAR),
    };
  }

  esPropia(a: Actor, s: { docenteId: string; solicitanteId: string }) {
    return (!!a.docenteId && s.docenteId === a.docenteId) || s.solicitanteId === a.usuarioId;
  }

  private puedeAnular(a: Actor, s: SolicitudLicencia) {
    if (!puedeTransicionar(s.estado, 'ANULADA')) return false;
    if (tienePermiso(a, P.LICENCIAS_REVISAR)) return true;
    return this.esPropia(a, s) && ['BORRADOR', 'PENDIENTE', 'OBSERVADA'].includes(s.estado);
  }

  /** Circuito del tipo (acotado a la institución, hallazgo 21) o el predeterminado de la institución. */
  async circuitoDe(tx: Tx | PrismaService, institucionId: string, circuitoId: string | null) {
    const include = { pasos: { orderBy: { orden: 'asc' as const }, include: { rol: { select: { id: true, codigo: true, nombre: true } } } } };
    if (circuitoId) return tx.circuitoAutorizacion.findFirst({ where: { id: circuitoId, institucionId }, include });
    return tx.circuitoAutorizacion.findFirst({ where: { institucionId, predeterminado: true, activo: true }, include });
  }

  /** Usuario que recibió la solicitud para revisión. */
  async receptorDe(tx: Tx | PrismaService, solicitudId: string) {
    const h = await tx.historialEstado.findFirst({
      where: { solicitudId, estadoAnterior: 'PENDIENTE', estadoNuevo: 'EN_REVISION' },
      orderBy: { fecha: 'desc' },
      select: { usuarioId: true },
    });
    return h?.usuarioId ?? null;
  }

  // ───────────── Alta y edición ─────────────

  private async datosDerivados(tx: Tx, a: Actor, docenteId: string, tipoLicenciaId: string, designacionIds: string[], desde: Date, hasta: Date) {
    const errores = validarPeriodo(desde, hasta);
    if (errores.length) throw new BadRequestException(errores);
    const tipo = await tx.tipoLicencia.findFirst({ where: { id: tipoLicenciaId, regimen: { institucionId: a.institucionId } } });
    if (!tipo) throw new BadRequestException('Tipo de licencia inexistente');
    const designaciones = await tx.designacion.findMany({ where: { id: { in: designacionIds }, docenteId } });
    if (designaciones.length !== designacionIds.length) throw new BadRequestException('Alguna designación no pertenece al docente');
    const feriados = tipo.formaComputo === 'DIAS_HABILES'
      ? (await tx.feriado.findMany({ where: { institucionId: a.institucionId, fecha: { gte: desde, lte: hasta } } })).map((f) => f.fecha)
      : [];
    return { tipo, diasComputados: computarDias(tipo.formaComputo, desde, hasta, feriados) };
  }

  /** Numeración por institución con secuencia propia (hallazgo 22). El upsert es atómico en PostgreSQL. */
  private async siguienteNumero(tx: Tx, institucionId: string, anio: number) {
    const inst = await tx.institucion.findUniqueOrThrow({ where: { id: institucionId }, select: { codigo: true } });
    const [fila] = await tx.$queryRaw<{ ultimo: number }[]>`
      INSERT INTO "secuencias_solicitudes" ("institucion_id", "anio", "ultimo") VALUES (${institucionId}, ${anio}, 1)
      ON CONFLICT ("institucion_id", "anio") DO UPDATE SET "ultimo" = "secuencias_solicitudes"."ultimo" + 1
      RETURNING "ultimo"`;
    return formatoNumero(inst.codigo, anio, Number(fila.ultimo));
  }

  // ───────────── Nomenclador (Ley 647-E) ─────────────

  /**
   * Plan de una solicitud con el nomenclador: motivo y su tipo espejo, designaciones (todas si la licencia es
   * simultánea en todos los cargos), variante por designación según su revista, y evaluación del motor.
   */
  async planNomenclador(
    db: Tx | PrismaService, a: Actor,
    p: { docenteId: string; motivoId: string; designacionIds: string[]; variantes?: VarianteDesignacionDto[]; desde: Date; hasta: Date; fechaEvento?: Date | null; ampliaciones?: string[]; excluirSolicitudId?: string; origen?: 'SOLICITUD' | 'AUTOMATICA' | 'NOVEDAD_RRHH' },
  ) {
    const motivo = await db.motivoLicencia.findFirst({
      where: { id: p.motivoId, activo: true, regimen: { institucionId: a.institucionId } },
      include: { variantes: { where: { activa: true } }, tipoEspejo: true },
    });
    if (!motivo || !motivo.tipoEspejo) throw new BadRequestException('Motivo del nomenclador inexistente');
    const origen = p.origen ?? 'SOLICITUD';
    if (origen === 'SOLICITUD' && motivo.agrupacion >= 4) throw new BadRequestException('Las sanciones y los movimientos provisorios los registra RR.HH. como novedad, con su instrumento legal');
    let reglaRef = null;
    for (const v of motivo.variantes) if ((reglaRef = await reglaVigente(db, v.id, p.desde))) break;
    if (!reglaRef) throw new UnprocessableEntityException(`El motivo ${motivo.codigo} no tiene reglas vigentes al ${formatoISO(p.desde)}`);
    if (origen === 'SOLICITUD' && reglaRef.regla.origen === 'AUTOMATICA') throw new BadRequestException('Esta licencia se genera automáticamente desde la designación');

    const designaciones = await db.designacion.findMany({ where: { docenteId: p.docenteId, docente: { institucionId: a.institucionId } } });
    let ids = [...new Set(p.designacionIds)];
    if (reglaRef.regla.alcanceCargos === 'TODOS') {
      // Salud simultánea (arts. 331 y 340): se incluyen todas las designaciones vigentes en el período.
      const vigentes = designaciones.filter((d) => d.activa && d.fechaDesde <= p.hasta && (!d.fechaHasta || d.fechaHasta >= p.desde)).map((d) => d.id);
      ids = [...new Set([...ids, ...vigentes])];
    }
    const elegidas = designaciones.filter((d) => ids.includes(d.id));
    if (elegidas.length !== ids.length) throw new BadRequestException('Alguna designación no pertenece al docente');
    const res = resolverVariantes(motivo.variantes, elegidas, p.variantes);
    if (res.errores.length) throw new UnprocessableEntityException({ message: 'Falta elegir la variante del nomenclador', errores: res.errores, opciones: res.opciones });
    const evaluacion = await this.reglas.evaluar(a, {
      docenteId: p.docenteId, designacionIds: ids, variantes: res.asignadas, desde: formatoISO(p.desde), hasta: formatoISO(p.hasta),
      fechaEvento: p.fechaEvento ? formatoISO(p.fechaEvento) : undefined, ampliaciones: p.ampliaciones, excluirSolicitudId: p.excluirSolicitudId,
    }, db, { verificarPermiso: false });
    const primera = evaluacion.porDesignacion[0];
    return {
      motivo, tipoEspejoId: motivo.tipoEspejo.id, designacionIds: ids, asignadas: res.asignadas, evaluacion,
      pctHaberes: primera?.tramos.length ? primera.tramos[0].pct : primera?.pctHaberes ?? null,
      tramosHaberes: primera?.tramos.length ? primera.tramos : null,
    };
  }

  /** Evalúa una solicitud ya guardada con sus variantes (sin contarse a sí misma). */
  async evaluarExistente(db: Tx | PrismaService, a: Actor, s: SolicitudLicencia & { designaciones: { designacionId: string; varianteId: string | null }[] }) {
    return this.reglas.evaluar(a, {
      docenteId: s.docenteId, designacionIds: s.designaciones.map((d) => d.designacionId),
      variantes: s.designaciones.filter((d) => d.varianteId).map((d) => ({ designacionId: d.designacionId, varianteId: d.varianteId! })),
      desde: formatoISO(s.fechaDesde), hasta: formatoISO(s.fechaHasta), fechaEvento: s.fechaEvento ? formatoISO(s.fechaEvento) : undefined,
      ampliaciones: s.ampliaciones, excluirSolicitudId: s.id,
    }, db, { verificarPermiso: false });
  }

  private bloquearSiCorresponde(evaluacion: ResultadoSolicitud) {
    if (evaluacion.bloqueantes.length) throw new UnprocessableEntityException({ message: 'La solicitud no cumple los requisitos del nomenclador', errores: evaluacion.bloqueantes, evaluacion });
  }

  /**
   * @param opciones.derivada la crea el sistema como continuación de otra solicitud (interrupción de la anual, reencuadre):
   *   el permiso ya se verificó en esa acción, así que no se exige además licencias.cargar.
   */
  async crear(a: Actor, dto: CrearSolicitudDto, tx?: Tx, opciones: { derivada?: boolean } = {}) {
    const docenteId = dto.docenteId ?? a.docenteId;
    if (!docenteId) throw new BadRequestException('Indique el docente');
    if (!opciones.derivada) {
      if (docenteId !== a.docenteId && !tienePermiso(a, P.LICENCIAS_CARGAR)) throw new ForbiddenException('Solo puede presentar solicitudes propias');
      if (docenteId === a.docenteId && !tienePermiso(a, P.LICENCIAS_SOLICITAR) && !tienePermiso(a, P.LICENCIAS_CARGAR)) throw new ForbiddenException();
    }
    const docente = await (tx ?? this.prisma).docente.findFirst({ where: { id: docenteId, institucionId: a.institucionId } });
    if (!docente) throw new BadRequestException('Docente inexistente');
    if (!dto.motivoId && !dto.tipoLicenciaId) throw new BadRequestException('Indique el motivo del nomenclador');
    // El canal y la hora del aviso los registra quien carga el pedido en nombre del docente.
    const canalIngreso = docenteId === a.docenteId ? 'SISTEMA' : dto.canalIngreso ?? 'SISTEMA';

    const desde = parseFecha(dto.fechaDesde), hasta = parseFecha(dto.fechaHasta);
    const ejecutar = async (tx: Tx) => {
      let datos: Prisma.SolicitudLicenciaUncheckedCreateInput;
      let designaciones: { designacionId: string; varianteId?: string; revista?: SituacionRevista }[];
      let evaluacion: ResultadoSolicitud | null = null;
      if (dto.motivoId) {
        const plan = await this.planNomenclador(tx, a, {
          docenteId, motivoId: dto.motivoId, designacionIds: dto.designacionIds, variantes: dto.variantes, desde, hasta,
          fechaEvento: dto.fechaEvento ? parseFecha(dto.fechaEvento) : null, ampliaciones: dto.ampliaciones,
        });
        this.bloquearSiCorresponde(plan.evaluacion);
        evaluacion = plan.evaluacion;
        datos = {
          institucionId: a.institucionId, numero: '', docenteId, tipoLicenciaId: plan.tipoEspejoId, motivoId: plan.motivo.id,
          fechaDesde: desde, fechaHasta: hasta, diasComputados: plan.evaluacion.diasPedidos, motivo: dto.motivo, solicitanteId: a.usuarioId,
          pctHaberes: plan.pctHaberes, tramosHaberes: jsonTramos(plan.tramosHaberes), reservada: plan.evaluacion.regla.reservada,
          fechaEvento: dto.fechaEvento ? parseFecha(dto.fechaEvento) : null, ampliaciones: dto.ampliaciones ?? [],
          canalIngreso, avisoEn: dto.avisoEn ? new Date(dto.avisoEn) : null,
        };
        designaciones = plan.asignadas.map((x) => ({ designacionId: x.designacionId, varianteId: x.varianteId, revista: x.revista as SituacionRevista }));
      } else {
        const { diasComputados } = await this.datosDerivados(tx, a, docenteId, dto.tipoLicenciaId!, dto.designacionIds, desde, hasta);
        datos = {
          institucionId: a.institucionId, numero: '', docenteId, tipoLicenciaId: dto.tipoLicenciaId!, fechaDesde: desde, fechaHasta: hasta,
          diasComputados, motivo: dto.motivo, solicitanteId: a.usuarioId, canalIngreso, avisoEn: dto.avisoEn ? new Date(dto.avisoEn) : null,
        };
        designaciones = dto.designacionIds.map((designacionId) => ({ designacionId }));
      }
      const s = await tx.solicitudLicencia.create({
        data: {
          ...datos,
          numero: await this.siguienteNumero(tx, a.institucionId, new Date().getFullYear()),
          designaciones: { create: designaciones },
          historial: { create: { estadoNuevo: 'BORRADOR', usuarioId: a.usuarioId, comentario: `Solicitud creada${canalIngreso !== 'SISTEMA' ? ` (ingresó por ${canalIngreso.toLowerCase()})` : ''}` } },
        } as Prisma.SolicitudLicenciaUncheckedCreateInput,
      });
      await this.auditoria.registrar(a, 'CREAR', 'solicitud', s.id, null, { ...s, designaciones }, tx);
      return { ...s, evaluacion };
    };
    return tx ? ejecutar(tx) : this.prisma.$transaction(ejecutar);
  }

  /**
   * Alta directa, sin circuito: licencias automáticas desde la designación (arts. 319, 333 e y 342 e) y novedades
   * de RR.HH. (sanciones y movimientos provisorios). Entran autorizadas y no consumen topes.
   */
  async crearDirecta(
    tx: Tx, a: Actor,
    p: { docenteId: string; motivoId: string; designacionIds: string[]; variantes?: VarianteDesignacionDto[]; desde: Date; hasta: Date; origen: 'AUTOMATICA' | 'NOVEDAD_RRHH'; comentario: string; motivo?: string },
  ) {
    const plan = await this.planNomenclador(tx, a, { ...p, origen: p.origen });
    if (plan.evaluacion.porDesignacion.some((x) => x.hallazgos.some((h) => h.codigo === 'REVISTA'))) this.bloquearSiCorresponde(plan.evaluacion);
    const s = await tx.solicitudLicencia.create({
      data: {
        institucionId: a.institucionId, numero: await this.siguienteNumero(tx, a.institucionId, new Date().getFullYear()),
        docenteId: p.docenteId, tipoLicenciaId: plan.tipoEspejoId, motivoId: plan.motivo.id, fechaDesde: p.desde, fechaHasta: p.hasta,
        diasComputados: plan.evaluacion.diasPedidos, motivo: p.motivo, solicitanteId: a.usuarioId, estado: 'AUTORIZADA', origen: p.origen,
        pctHaberes: plan.pctHaberes, reservada: plan.evaluacion.regla.reservada, canalIngreso: 'SISTEMA',
        designaciones: { create: plan.asignadas.map((x) => ({ designacionId: x.designacionId, varianteId: x.varianteId, revista: x.revista as SituacionRevista })) },
        historial: { create: { estadoNuevo: 'AUTORIZADA', usuarioId: a.usuarioId, comentario: p.comentario } },
      },
    });
    await this.auditoria.registrar(a, p.origen === 'AUTOMATICA' ? 'LICENCIA_AUTOMATICA' : 'NOVEDAD_RRHH', 'solicitud', s.id, null, { ...s, designaciones: plan.asignadas }, tx);
    return s;
  }

  async cargarParaModificar(tx: Tx | PrismaService, a: Actor, id: string) {
    const s = await tx.solicitudLicencia.findFirst({ where: { id, institucionId: a.institucionId }, include: { designaciones: true } });
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    return s;
  }

  async actualizar(a: Actor, id: string, dto: ActualizarSolicitudDto) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (!ESTADOS_EDITABLES.includes(s.estado)) throw new ConflictException('La solicitud solo puede modificarse en borrador u observada');
      if (!this.esPropia(a, s) && !tienePermiso(a, P.LICENCIAS_CARGAR)) throw new ForbiddenException();
      exigirVersion(s, dto.version);
      const designacionIds = dto.designacionIds ?? s.designaciones.map((d) => d.designacionId);
      const desde = dto.fechaDesde ? parseFecha(dto.fechaDesde) : s.fechaDesde;
      const hasta = dto.fechaHasta ? parseFecha(dto.fechaHasta) : s.fechaHasta;
      let cambios: Prisma.SolicitudLicenciaUncheckedUpdateManyInput;
      let designaciones: { solicitudId: string; designacionId: string; varianteId?: string; revista?: SituacionRevista }[] | null = null;
      let evaluacion: ResultadoSolicitud | null = null;
      const motivoId = dto.motivoId ?? s.motivoId;
      if (motivoId) {
        const fechaEvento = dto.fechaEvento ? parseFecha(dto.fechaEvento) : s.fechaEvento;
        const ampliaciones = dto.ampliaciones ?? s.ampliaciones;
        // Si no cambia el motivo, se conservan las variantes elegidas antes (si siguen correspondiendo).
        const variantes = dto.variantes ?? (motivoId === s.motivoId ? s.designaciones.filter((d) => d.varianteId).map((d) => ({ designacionId: d.designacionId, varianteId: d.varianteId! })) : undefined);
        const plan = await this.planNomenclador(tx, a, { docenteId: s.docenteId, motivoId, designacionIds, variantes, desde, hasta, fechaEvento, ampliaciones, excluirSolicitudId: s.id });
        this.bloquearSiCorresponde(plan.evaluacion);
        evaluacion = plan.evaluacion;
        cambios = {
          tipoLicenciaId: plan.tipoEspejoId, motivoId, fechaDesde: desde, fechaHasta: hasta, diasComputados: plan.evaluacion.diasPedidos,
          motivo: dto.motivo ?? s.motivo, pctHaberes: plan.pctHaberes, tramosHaberes: jsonTramos(plan.tramosHaberes),
          reservada: plan.evaluacion.regla.reservada, fechaEvento, ampliaciones,
          // Una excepción concedida deja de valer si cambia lo que se pidió.
          excepcionMotivo: null, excepcionInstrumento: null, excepcionPorId: null, excepcionEn: null,
        };
        designaciones = plan.asignadas.map((x) => ({ solicitudId: id, designacionId: x.designacionId, varianteId: x.varianteId, revista: x.revista as SituacionRevista }));
      } else {
        const tipoLicenciaId = dto.tipoLicenciaId ?? s.tipoLicenciaId;
        const { diasComputados } = await this.datosDerivados(tx, a, s.docenteId, tipoLicenciaId, designacionIds, desde, hasta);
        cambios = { tipoLicenciaId, fechaDesde: desde, fechaHasta: hasta, diasComputados, motivo: dto.motivo ?? s.motivo };
        if (dto.designacionIds) designaciones = designacionIds.map((designacionId) => ({ solicitudId: id, designacionId }));
      }
      // Hallazgo 16: la escritura solo procede si el estado y la versión no cambiaron desde la lectura.
      await escribirCondicionado(tx, s, ESTADOS_EDITABLES, cambios);
      if (designaciones) {
        await tx.solicitudDesignacion.deleteMany({ where: { solicitudId: id } });
        await tx.solicitudDesignacion.createMany({ data: designaciones });
      }
      const despues = await tx.solicitudLicencia.findUniqueOrThrow({ where: { id } });
      await this.auditoria.registrar(a, 'ACTUALIZAR', 'solicitud', id, s, { ...despues, designaciones }, tx);
      return { ...despues, evaluacion };
    });
  }

  // ───────────── Validación integral (al presentar) ─────────────

  async validar(tx: Tx, s: SolicitudLicencia): Promise<string[]> {
    const [tipo, docente, designaciones, documentos] = await Promise.all([
      tx.tipoLicencia.findUniqueOrThrow({ where: { id: s.tipoLicenciaId }, include: { reglas: true, regimen: true } }),
      tx.docente.findUniqueOrThrow({ where: { id: s.docenteId } }),
      tx.solicitudDesignacion.findMany({ where: { solicitudId: s.id }, include: { designacion: true } }),
      tx.documentoLicencia.findMany({ where: { solicitudId: s.id } }),
    ]);
    const errores = validarPeriodo(s.fechaDesde, s.fechaHasta);

    if (docente.estadoLaboral !== 'ACTIVO') errores.push('El docente no se encuentra en actividad');
    const vigente = (desde: Date, hastaV: Date | null) => desde <= s.fechaDesde && (!hastaV || hastaV >= s.fechaDesde);
    if (!tipo.activo || !vigente(tipo.vigenteDesde, tipo.vigenteHasta)) errores.push('El tipo de licencia no está vigente para la fecha de inicio');
    if (!tipo.regimen.activo || !vigente(tipo.regimen.vigenteDesde, tipo.regimen.vigenteHasta)) errores.push('El régimen de licencias no está vigente');

    // Cargos afectados: deben estar activos durante el período solicitado.
    if (!designaciones.length) errores.push('Debe indicar al menos una designación afectada');
    for (const { designacion: d } of designaciones) {
      if (!d.activa || d.fechaDesde > s.fechaHasta || (d.fechaHasta && d.fechaHasta < s.fechaDesde))
        errores.push('Una de las designaciones afectadas no está vigente en el período solicitado');
    }

    // Superposición con otras licencias del docente.
    const otras = await tx.solicitudLicencia.findMany({
      where: { docenteId: s.docenteId, id: { not: s.id }, estado: { in: ESTADOS_VIGENTES }, fechaDesde: { lte: s.fechaHasta }, fechaHasta: { gte: s.fechaDesde } },
      include: { designaciones: true },
    });
    errores.push(
      ...detectarSuperposiciones(s.fechaDesde, s.fechaHasta, designaciones.map((d) => d.designacionId),
        otras.map((o) => ({ numero: o.numero, fechaDesde: o.fechaDesde, fechaHasta: o.fechaHasta, designacionIds: o.designaciones.map((d) => d.designacionId) }))),
    );

    // Documentación obligatoria.
    const faltan = documentosFaltantes(tipo.documentacionRequerida, documentos.map((d) => d.tipoDocumento));
    if (faltan.length) errores.push(`Falta documentación obligatoria: ${faltan.join(', ')}`);

    // Reglas configurables del régimen.
    if (tipo.reglas.length) {
      const anio = s.fechaDesde.getUTCFullYear();
      const delAnio = await tx.solicitudLicencia.aggregate({
        where: {
          docenteId: s.docenteId, tipoLicenciaId: s.tipoLicenciaId, id: { not: s.id }, estado: { in: ESTADOS_COMPUTABLES },
          fechaDesde: { gte: new Date(Date.UTC(anio, 0, 1)), lt: new Date(Date.UTC(anio + 1, 0, 1)) },
        },
        _sum: { diasComputados: true },
        _count: true,
      });
      errores.push(
        ...evaluarReglas(tipo.reglas, {
          dias: s.diasComputados,
          diasUsadosEnAnio: delAnio._sum.diasComputados ?? 0,
          solicitudesEnAnio: delAnio._count,
          antiguedadMeses: mesesEntre(docente.fechaIngreso, s.fechaDesde),
          anticipacionDias: diasCorridos(hoy(), s.fechaDesde) - 1,
        }),
      );
    }
    return [...new Set(errores)];
  }

  // ───────────── Transiciones ─────────────

  /** Único punto de cambio de estado: valida la transición y registra historial y auditoría. */
  async cambiarEstado(tx: Tx, a: Actor, s: SolicitudLicencia, nuevo: EstadoSolicitud, comentario?: string, extra: Prisma.SolicitudLicenciaUpdateManyMutationInput = {}) {
    if (!puedeTransicionar(s.estado, nuevo)) throw new ConflictException(`No se puede pasar de ${s.estado} a ${nuevo}`);
    // Control de concurrencia optimista: ni el estado ni la versión deben haber cambiado desde que se leyó.
    await escribirCondicionado(tx, s, [s.estado], { estado: nuevo, ...extra });
    await tx.historialEstado.create({ data: { solicitudId: s.id, estadoAnterior: s.estado, estadoNuevo: nuevo, usuarioId: a.usuarioId, comentario } });
    await this.auditoria.registrar(a, `ESTADO_${nuevo}`, 'solicitud', s.id, { estado: s.estado }, { estado: nuevo, comentario, ...extra }, tx);
    return tx.solicitudLicencia.findUniqueOrThrow({ where: { id: s.id } });
  }

  async presentar(a: Actor, id: string, version?: number) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (!this.esPropia(a, s) && !tienePermiso(a, P.LICENCIAS_CARGAR)) throw new ForbiddenException();
      exigirVersion(s, version);
      const errores = await this.validar(tx, s);
      if (errores.length) throw new UnprocessableEntityException({ message: 'La solicitud no cumple los requisitos', errores });
      let extra: Prisma.SolicitudLicenciaUpdateManyMutationInput = {};
      let alertaBaja: string | undefined;
      if (s.motivoId) {
        // Se vuelve a resolver la variante con la revista ACTUAL y queda congelada desde ahora.
        const plan = await this.planNomenclador(tx, a, {
          docenteId: s.docenteId, motivoId: s.motivoId, designacionIds: s.designaciones.map((d) => d.designacionId),
          variantes: s.designaciones.filter((d) => d.varianteId).map((d) => ({ designacionId: d.designacionId, varianteId: d.varianteId! })),
          desde: s.fechaDesde, hasta: s.fechaHasta, fechaEvento: s.fechaEvento, ampliaciones: s.ampliaciones, excluirSolicitudId: s.id,
        });
        this.bloquearSiCorresponde(plan.evaluacion);
        if (plan.evaluacion.excepcionables.length && !s.excepcionMotivo)
          throw new UnprocessableEntityException({
            message: 'Supera topes o requisitos del nomenclador: puede partir la solicitud o pedir una excepción a quien tenga licencias.excepcion',
            errores: plan.evaluacion.excepcionables, requiereExcepcion: true, evaluacion: plan.evaluacion,
          });
        await tx.solicitudDesignacion.deleteMany({ where: { solicitudId: s.id } });
        await tx.solicitudDesignacion.createMany({ data: plan.asignadas.map((x) => ({ solicitudId: s.id, designacionId: x.designacionId, varianteId: x.varianteId, revista: x.revista as SituacionRevista })) });
        extra = { diasComputados: plan.evaluacion.diasPedidos, pctHaberes: plan.pctHaberes, tramosHaberes: jsonTramos(plan.tramosHaberes) };
        alertaBaja = plan.evaluacion.advertencias.find((m) => m.includes('umbral de baja'));
      }
      // Corregida tras una observación: el circuito vuelve a empezar, para que todos los pasos revisen lo corregido.
      if (s.estado === 'OBSERVADA') extra = { ...extra, pasoActual: 1 };
      const nueva = await this.cambiarEstado(tx, a, s, 'PENDIENTE', s.estado === 'OBSERVADA' ? 'Solicitud corregida y presentada nuevamente' : 'Solicitud presentada', extra);
      const docente = await tx.docente.findUniqueOrThrow({ where: { id: s.docenteId } });
      await this.notificaciones.notificar(await this.notificaciones.usuariosConPermiso(a.institucionId, P.LICENCIAS_REVISAR, tx), {
        tipo: 'NUEVA_SOLICITUD',
        titulo: `Nueva solicitud ${s.numero}`,
        mensaje: `${docente.apellido}, ${docente.nombre} presentó una solicitud de licencia del ${formatoISO(s.fechaDesde)} al ${formatoISO(s.fechaHasta)}.`,
        entidad: 'solicitud',
        entidadId: s.id,
      }, tx);
      // Arts. 336 y 345: el director recibe la alerta cuando un interino o suplente llega al umbral de baja.
      if (alertaBaja)
        await this.notificaciones.notificar(await this.notificaciones.usuariosConPermiso(a.institucionId, P.AUTORIZACIONES_DECIDIR, tx), {
          tipo: 'ALERTA_BAJA', titulo: `Umbral de baja por inasistencias: ${docente.apellido}, ${docente.nombre}`, mensaje: alertaBaja, entidad: 'solicitud', entidadId: s.id,
        }, tx);
      return nueva;
    });
  }

  /**
   * Excepción a topes y requisitos (spec: "advertencias bloqueantes que solo puede saltar un usuario con
   * licencias.excepcion, dejando registrado el motivo y el instrumento legal").
   */
  async excepcion(a: Actor, id: string, dto: ExcepcionDto) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (!s.motivoId) throw new BadRequestException('Las excepciones aplican a licencias del nomenclador');
      if (this.esPropia(a, s)) throw new ForbiddenException('No puede conceder una excepción en una solicitud propia');
      if (!ESTADOS_EN_TRAMITE.includes(s.estado)) throw new ConflictException('La solicitud ya no está en trámite');
      exigirVersion(s, dto.version);
      const evaluacion = await this.evaluarExistente(tx, a, s);
      if (evaluacion.bloqueantes.length) throw new UnprocessableEntityException({ message: 'Hay requisitos que no admiten excepción', errores: evaluacion.bloqueantes });
      await escribirCondicionado(tx, s, ESTADOS_EN_TRAMITE, { excepcionMotivo: dto.motivo, excepcionInstrumento: dto.instrumentoLegal, excepcionPorId: a.usuarioId, excepcionEn: new Date() });
      await tx.historialEstado.create({ data: { solicitudId: s.id, estadoAnterior: s.estado, estadoNuevo: s.estado, usuarioId: a.usuarioId, comentario: `Excepción a topes o requisitos (${dto.instrumentoLegal})` } });
      await this.auditoria.registrar(a, 'EXCEPCION_REGLAS', 'solicitud', s.id, null, { instrumento: dto.instrumentoLegal, motivoExcepcion: dto.motivo, hallazgos: evaluacion.excepcionables }, tx);
      return tx.solicitudLicencia.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Parte la solicitud cuando supera el tope: lo que entra queda en esta y el resto pasa a una solicitud derivada
   * como prórroga del art. 347 (motivo 1.6), en borrador para completar.
   */
  async partir(a: Actor, id: string, version?: number) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (!ESTADOS_EDITABLES.includes(s.estado)) throw new ConflictException('Solo se parte una solicitud en borrador u observada');
      if (!this.esPropia(a, s) && !tienePermiso(a, P.LICENCIAS_CARGAR)) throw new ForbiddenException();
      if (!s.motivoId) throw new BadRequestException('Solo aplica a licencias del nomenclador');
      exigirVersion(s, version);
      const evaluacion = await this.evaluarExistente(tx, a, s);
      const propuesta = evaluacion.porDesignacion.map((x) => x.propuestaParticion).find(Boolean);
      if (!propuesta || propuesta.dentroDelTope <= 0) throw new ConflictException('No hay días disponibles para dejar en esta solicitud o no corresponde partirla');
      const designaciones = await tx.designacion.findMany({ where: { id: { in: s.designaciones.map((d) => d.designacionId) } }, include: { horarios: true } });
      const cal = { noLaborables: await noLaborables(tx, a.institucionId, s.fechaDesde, s.fechaHasta), diasConHorario: diasConHorario(designaciones) };
      const fin = fechaFinPorDias(evaluacion.regla.unidad, s.fechaDesde, propuesta.dentroDelTope, cal);
      if (fin >= s.fechaHasta) throw new ConflictException('No corresponde partir la solicitud');
      await escribirCondicionado(tx, s, ESTADOS_EDITABLES, { fechaHasta: fin, diasComputados: propuesta.dentroDelTope });

      const motivo347 = await tx.motivoLicencia.findFirst({ where: { codigo: '1.6', activo: true, regimen: { institucionId: a.institucionId, motivos: { some: { id: s.motivoId } } } } });
      if (!motivo347) throw new UnprocessableEntityException('El régimen no tiene el motivo 1.6 (prórroga del art. 347)');
      const resto = await this.crear(a, {
        docenteId: s.docenteId, motivoId: motivo347.id, designacionIds: s.designaciones.map((d) => d.designacionId),
        fechaDesde: formatoISO(sumarDias(fin, 1)), fechaHasta: formatoISO(s.fechaHasta), motivo: s.motivo ?? undefined,
      }, tx);
      await tx.solicitudLicencia.update({ where: { id: resto.id }, data: { solicitudPadreId: s.id } });
      await this.auditoria.registrar(a, 'PARTIR_SOLICITUD', 'solicitud', s.id, { fechaHasta: formatoISO(s.fechaHasta) }, { fechaHasta: formatoISO(fin), derivada: resto.id }, tx);
      return { solicitud: await tx.solicitudLicencia.findUniqueOrThrow({ where: { id } }), derivada: resto };
    });
  }

  async anular(a: Actor, id: string, comentario?: string, version?: number) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (!this.puedeAnular(a, s)) throw new ForbiddenException('No puede anular esta solicitud');
      exigirVersion(s, version);
      const r = await this.cambiarEstado(tx, a, s, 'ANULADA', comentario);
      await tx.reemplazo.updateMany({ where: { solicitudId: id, estado: { in: ['PROPUESTO', 'ACTIVO'] } }, data: { estado: 'ANULADO', version: { increment: 1 } } });
      return r;
    });
  }

  // ───────────── Documentación ─────────────

  async adjuntar(a: Actor, id: string, tipoDocumento: string, file?: ArchivoSubido, version?: number) {
    const s0 = await this.cargarParaModificar(this.prisma, a, id);
    if (!this.esPropia(a, s0) && !tienePermiso(a, P.LICENCIAS_CARGAR)) throw new ForbiddenException();
    const preparado = await this.archivos.preparar(a, file);
    const doc = await this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (!ESTADOS_DOCUMENTACION.includes(s.estado)) throw new ConflictException('Solo se puede adjuntar documentación en borrador u observada');
      exigirVersion(s, version);
      // Hallazgo 16: la solicitud debe seguir editable en el momento de escribir.
      await escribirCondicionado(tx, s, ESTADOS_DOCUMENTACION);
      const tipo = await tx.tipoLicencia.findUniqueOrThrow({ where: { id: s.tipoLicenciaId } });
      // Hallazgo 11: la confidencialidad se deriva de TipoLicencia.sensible, no de la categoría.
      const archivo = await this.archivos.registrar(a, preparado, tipo.sensible, tx);
      const doc = await tx.documentoLicencia.create({ data: { solicitudId: id, archivoId: archivo.id, tipoDocumento }, include: { archivo: true } });
      await this.auditoria.registrar(a, 'ADJUNTAR_DOCUMENTO', 'solicitud', id, null, { documento: doc.id, tipoDocumento }, tx);
      return doc;
    });
    // El archivo se escribe en disco solo después de confirmar la escritura en la base; si falla, se revierte.
    await this.archivos.persistir(preparado, () =>
      this.prisma.$transaction([this.prisma.documentoLicencia.delete({ where: { id: doc.id } }), this.prisma.archivo.delete({ where: { id: doc.archivoId } })]),
    );
    return doc;
  }

  async quitarDocumento(a: Actor, id: string, documentoId: string) {
    const ruta = await this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (!ESTADOS_DOCUMENTACION.includes(s.estado)) throw new ConflictException('Solo se puede quitar documentación en borrador u observada');
      if (!this.esPropia(a, s) && !tienePermiso(a, P.LICENCIAS_CARGAR)) throw new ForbiddenException();
      const doc = await tx.documentoLicencia.findFirst({ where: { id: documentoId, solicitudId: id }, include: { archivo: true } });
      if (!doc) throw new NotFoundException('Documento no encontrado');
      await escribirCondicionado(tx, s, ESTADOS_DOCUMENTACION);
      await tx.documentoLicencia.delete({ where: { id: doc.id } });
      await tx.archivo.delete({ where: { id: doc.archivoId } });
      await this.auditoria.registrar(a, 'QUITAR_DOCUMENTO', 'solicitud', id, { documento: doc.id }, null, tx);
      return doc.archivo.ruta;
    });
    await this.archivos.eliminarFisico(ruta);
  }

  /**
   * Hallazgo 14: solo en PENDIENTE o EN_REVISION, dentro de la institución del actor y nunca sobre una solicitud propia.
   * La escritura queda condicionada al estado y la versión de la solicitud.
   */
  async verificarDocumento(a: Actor, id: string, documentoId: string, verificado: boolean, version?: number) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      const doc = await tx.documentoLicencia.findFirst({ where: { id: documentoId, solicitudId: s.id } });
      if (!doc) throw new NotFoundException('Documento no encontrado');
      if (this.esPropia(a, s)) throw new ForbiddenException('No puede verificar documentación de una solicitud propia');
      if (!ESTADOS_VERIFICACION.includes(s.estado)) throw new ConflictException('La documentación solo se verifica en solicitudes pendientes o en revisión');
      exigirVersion(s, version);
      await escribirCondicionado(tx, s, ESTADOS_VERIFICACION);
      const r = await tx.documentoLicencia.update({
        where: { id: documentoId },
        data: { verificado, verificadoPorId: verificado ? a.usuarioId : null, verificadoEn: verificado ? new Date() : null },
      });
      await this.auditoria.registrar(a, verificado ? 'VERIFICAR_DOCUMENTO' : 'DESVERIFICAR_DOCUMENTO', 'solicitud', id, { verificado: doc.verificado }, { documento: documentoId, verificado }, tx);
      return r;
    });
  }

  // ───────────── Reincorporación ─────────────

  async reincorporar(a: Actor, id: string, dto: ReincorporacionDto) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.cargarParaModificar(tx, a, id);
      if (s.estado !== 'AUTORIZADA') throw new ConflictException('Solo se registran reincorporaciones de licencias autorizadas');
      exigirVersion(s, dto.version);
      const fecha = parseFecha(dto.fechaEfectiva);
      if (fecha <= s.fechaDesde) throw new BadRequestException('La reincorporación debe ser posterior al inicio de la licencia');
      await tx.reincorporacion.create({ data: { solicitudId: id, fechaEfectiva: fecha, registradaPorId: a.usuarioId, observaciones: dto.observaciones } });
      const anticipada = fecha <= s.fechaHasta;
      const r = await this.cambiarEstado(tx, a, s, 'FINALIZADA',
        `Reincorporación registrada el ${formatoISO(fecha)}${anticipada ? ' (anticipada)' : ''}${dto.observaciones ? `. ${dto.observaciones}` : ''}`);
      // Los reemplazos vinculados finalizan el día anterior a la reincorporación.
      const ultimoDia = sumarDias(fecha, -1);
      const reemplazos = await tx.reemplazo.findMany({ where: { solicitudId: id, estado: { in: ['PROPUESTO', 'ACTIVO'] } } });
      for (const rem of reemplazos) {
        if (rem.fechaDesde > ultimoDia) {
          await tx.reemplazo.update({ where: { id: rem.id }, data: { estado: 'ANULADO', observaciones: 'Sin efecto por reincorporación anticipada', version: { increment: 1 } } });
          continue;
        }
        await tx.reemplazo.update({ where: { id: rem.id }, data: { estado: 'FINALIZADO', fechaHasta: rem.fechaHasta > ultimoDia ? ultimoDia : rem.fechaHasta, version: { increment: 1 } } });
        await tx.reemplazoDocente.deleteMany({ where: { reemplazoId: rem.id, fechaDesde: { gt: ultimoDia } } });
        await tx.reemplazoDocente.updateMany({ where: { reemplazoId: rem.id, fechaHasta: { gt: ultimoDia } }, data: { fechaHasta: ultimoDia } });
      }
      await this.auditoria.registrar(a, 'REINCORPORACION', 'solicitud', id, null, { fechaEfectiva: dto.fechaEfectiva, reemplazosFinalizados: reemplazos.length }, tx);
      return r;
    });
  }
}
