import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { accesoCompleto, CODIGO_TIPO_RESERVADO, ETIQUETA_TIPO_RESERVADO } from '../../common/sensitive/sensitive-data.policy';
import { parseFecha, seSuperponen } from '../../common/fechas';
import { diasConHorario, iniciosAntiguedad, noLaborables } from './calendario.service';
import { diasEnUnidad, diasSuperpuestos, duracionEnDias, topeAplicable, ventanaPeriodo } from './calculo';
import { evaluarRegla, LicenciaPrevia } from './evaluador';
import { parsearRegla, ReglaDefinicion, Revista } from './regla.schema';
import { ESTADOS_COMPUTABLES } from '../licencias/reglas-negocio';

type Cliente = PrismaService | Prisma.TransactionClient;

/** Estados que ocupan el período y consumen topes. */
export const ESTADOS_QUE_CONSUMEN = ESTADOS_COMPUTABLES;

export interface PedidoEvaluacion {
  /** Misma variante para todas las designaciones (simulación). */
  varianteId?: string;
  /** Una variante por designación (la revista puede ser distinta en cada cargo). */
  variantes?: { designacionId: string; varianteId: string }[];
  docenteId: string;
  designacionIds: string[];
  desde: string;
  hasta: string;
  fechaEvento?: string;
  ampliaciones?: string[];
  /** Solicitud que se está editando: no cuenta contra sí misma. */
  excluirSolicitudId?: string;
}

export type ResultadoSolicitud = Awaited<ReturnType<ReglasLicenciaService['evaluar']>>;

/** Regla vigente de la variante en una fecha (la versión más alta cuya vigencia la incluye). */
export async function reglaVigente(db: Cliente, varianteId: string, fecha: Date) {
  const r = await db.reglaVariante.findFirst({
    where: { varianteId, vigenciaDesde: { lte: fecha }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fecha } }] },
    orderBy: { version: 'desc' },
  });
  return r ? { ...r, regla: parsearRegla(r.definicion) } : null;
}

interface UsoPrevio extends LicenciaPrevia { solicitudId: string; dias: number; motivoId: string }

/** Licencias del docente con variante del nomenclador (otorgadas o en trámite), con el motivo de cada una. */
async function usosDelDocente(db: Cliente, docenteId: string, excluirSolicitudId?: string): Promise<UsoPrevio[]> {
  const filas = await db.solicitudDesignacion.findMany({
    where: { varianteId: { not: null }, solicitud: { docenteId, estado: { in: ESTADOS_QUE_CONSUMEN }, ...(excluirSolicitudId && { id: { not: excluirSolicitudId } }) } },
    include: { solicitud: true, variante: { include: { motivo: true, reglas: { orderBy: { version: 'desc' }, take: 1 } } } },
  });
  // Una solicitud abarca varias designaciones: se cuenta una sola vez por solicitud y motivo.
  const porSolicitud = new Map<string, UsoPrevio>();
  for (const f of filas) {
    const clave = `${f.solicitudId}|${f.variante!.motivoId}`;
    if (porSolicitud.has(clave)) continue;
    let excluyeCon: string[] = [];
    try { excluyeCon = f.variante!.reglas[0] ? parsearRegla(f.variante!.reglas[0].definicion).excluyeCon : []; } catch { /* regla inválida: no excluye */ }
    porSolicitud.set(clave, {
      solicitudId: f.solicitudId, motivoId: f.variante!.motivoId, motivoCodigo: f.variante!.motivo.codigo,
      desde: f.solicitud.fechaDesde, hasta: f.solicitud.fechaHasta, dias: f.solicitud.diasComputados, excluyeCon,
    });
  }
  return [...porSolicitud.values()];
}

/** Días de un uso previo que caen en la ventana: proporcional a los días corridos superpuestos. */
function diasEnVentana(u: UsoPrevio, desde: Date, hasta: Date) {
  const total = diasSuperpuestos(u.desde, u.hasta, u.desde, u.hasta);
  const dentro = diasSuperpuestos(u.desde, u.hasta, desde, hasta);
  return total ? Math.round((u.dias * dentro) / total) : 0;
}

@Injectable()
export class ReglasLicenciaService {
  constructor(private prisma: PrismaService) {}

  /**
   * Evalúa la(s) variante(s) para un docente, sus designaciones y un período (spec, "Validaciones al presentar").
   * La usan la simulación y la solicitud al crear, editar, presentar y autorizar.
   */
  async evaluar(a: Actor, p: PedidoEvaluacion, db: Cliente = this.prisma, opciones: { verificarPermiso?: boolean } = {}) {
    if (opciones.verificarPermiso !== false && a.docenteId !== p.docenteId && ![P.LICENCIAS_CARGAR, P.LICENCIAS_REVISAR, P.NOMENCLADOR_GESTIONAR].some((x) => tienePermiso(a, x)))
      throw new ForbiddenException();
    const desde = parseFecha(p.desde), hasta = parseFecha(p.hasta);
    const fechaEvento = p.fechaEvento ? parseFecha(p.fechaEvento) : null;

    const varianteDe = new Map<string, string>(p.designacionIds.map((id) => [id, p.variantes?.find((v) => v.designacionId === id)?.varianteId ?? p.varianteId ?? '']));
    if ([...varianteDe.values()].some((v) => !v)) throw new UnprocessableEntityException('Indique la variante del nomenclador de cada designación');
    const variantes = await db.varianteLicencia.findMany({
      where: { id: { in: [...new Set(varianteDe.values())] }, motivo: { regimen: { institucionId: a.institucionId } } },
      include: { motivo: true },
    });
    if (variantes.length !== new Set(varianteDe.values()).size) throw new NotFoundException('Variante del nomenclador inexistente');
    if (new Set(variantes.map((v) => v.motivoId)).size > 1) throw new UnprocessableEntityException('Todas las designaciones deben pedir el mismo motivo');
    const motivo = variantes[0].motivo;
    const reglas = new Map<string, NonNullable<Awaited<ReturnType<typeof reglaVigente>>>>();
    for (const v of variantes) {
      const vig = await reglaVigente(db, v.id, desde);
      if (!vig) throw new UnprocessableEntityException(`La variante ${v.codigo} no tiene una regla vigente al ${p.desde}`);
      reglas.set(v.id, vig);
    }

    const docente = await db.docente.findFirst({
      where: { id: p.docenteId, institucionId: a.institucionId },
      include: { designaciones: { include: { horarios: true } } },
    });
    if (!docente) throw new NotFoundException('Docente no encontrado');
    const elegidas = docente.designaciones.filter((d) => p.designacionIds.includes(d.id));
    if (elegidas.length !== new Set(p.designacionIds).size) throw new UnprocessableEntityException('Alguna designación no pertenece al docente');
    const vigentesEnPeriodo = docente.designaciones.filter((d) => d.activa && d.fechaDesde <= hasta && (!d.fechaHasta || d.fechaHasta >= desde));
    const feriados = await noLaborables(db, a.institucionId, desde, hasta);

    const usos = await usosDelDocente(db, docente.id, p.excluirSolicitudId);
    const delMotivo = usos.filter((u) => u.motivoId === motivo.id);
    const inicioTitular = iniciosAntiguedad(docente, { fechaDesde: desde }, docente.designaciones).TITULAR;
    const acumulado = delMotivo.reduce((s, u) => s + u.dias, 0);
    const mes = { desde: new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1)), hasta: new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 0)) };

    const porDesignacion = elegidas.map((d) => {
      const variante = variantes.find((v) => v.id === varianteDe.get(d.id))!;
      const { regla } = reglas.get(variante.id)!;
      // Días laborables: los de la semana con horario en ESTA designación.
      const diasPedidos = diasEnUnidad(regla.unidad, desde, hasta, { noLaborables: feriados, diasConHorario: diasConHorario([d]) });
      const ventana = ventanaPeriodo(regla.periodoTope, desde, { inicioTitular });
      const usadosEnPeriodo = delMotivo.reduce((s, u) => s + diasEnVentana(u, ventana.desde, ventana.hasta), 0);
      const r = evaluarRegla(regla, {
        motivoCodigo: motivo.codigo,
        revista: d.situacionRevista as Revista,
        desde, hasta, diasPedidos,
        fechaEvento: regla.fechaEvento?.origen === 'FECHA_NACIMIENTO' ? docente.fechaNacimiento : fechaEvento,
        ampliaciones: p.ampliaciones,
        antiguedad: iniciosAntiguedad(docente, d, docente.designaciones),
        sinTermino: d.sinTermino,
        usadosEnPeriodo, acumulado,
        previas: usos.filter((u) => seSuperponen(u.desde, u.hasta, desde, hasta) || u.motivoId === motivo.id),
        inasistencias: { enMes: delMotivo.reduce((s, u) => s + diasEnVentana(u, mes.desde, mes.hasta), 0), enPeriodo: usadosEnPeriodo },
        designacionesNoIncluidas: regla.alcanceCargos === 'TODOS' ? vigentesEnPeriodo.filter((x) => !p.designacionIds.includes(x.id)).length : 0,
      });
      return {
        designacionId: d.id, revista: d.situacionRevista, varianteId: variante.id, varianteCodigo: variante.codigo,
        encuadreLegal: variante.encuadreLegal, pctHaberes: variante.pctHaberes, reglaVersion: reglas.get(variante.id)!.version,
        diasPedidos, ventanaTope: ventana.clave, ...r,
      };
    });

    const primera = reglas.get(variantes[0].id)!;
    return {
      motivo: { id: motivo.id, codigo: motivo.codigo, nombre: motivo.nombre },
      regla: {
        unidad: primera.regla.unidad, periodoTope: primera.regla.periodoTope, alcanceCargos: primera.regla.alcanceCargos, autoridad: primera.regla.autoridad,
        dictamenRM: primera.regla.dictamenRM, sensible: primera.regla.sensible, reservada: primera.regla.reservada, origen: primera.regla.origen,
        subsisteAlCese: primera.regla.subsisteAlCese, alExcederTope: primera.regla.alExcederTope,
      },
      periodo: { desde: p.desde, hasta: p.hasta },
      /** Días de la solicitud: el mayor entre las designaciones (los laborables dependen del horario de cada una). */
      diasPedidos: Math.max(0, ...porDesignacion.map((x) => x.diasPedidos)),
      admisible: porDesignacion.every((x) => x.admisible),
      requiereExcepcion: porDesignacion.some((x) => x.requiereExcepcion),
      bloqueantes: [...new Set(porDesignacion.flatMap((x) => x.hallazgos.filter((h) => h.nivel === 'BLOQUEANTE').map((h) => h.mensaje)))],
      excepcionables: [...new Set(porDesignacion.flatMap((x) => x.hallazgos.filter((h) => h.nivel === 'EXCEPCIONABLE').map((h) => h.mensaje)))],
      advertencias: [...new Set(porDesignacion.flatMap((x) => x.hallazgos.filter((h) => h.nivel === 'ADVERTENCIA').map((h) => h.mensaje)))],
      porDesignacion,
    };
  }

  /**
   * Recalcula y guarda los saldos del docente para cada motivo con uso (días usados en el período vigente, tope y
   * tramo de haberes). Se llamará al autorizar, anular o interrumpir una licencia (fase 3).
   */
  async recalcularSaldos(a: Actor, docenteId: string, fecha = new Date(), db: Cliente = this.prisma, verificarPermiso = true) {
    if (verificarPermiso && a.docenteId !== docenteId && ![P.DOCENTES_VER, P.LICENCIAS_VER_TODAS].some((x) => tienePermiso(a, x))) throw new ForbiddenException();
    const docente = await db.docente.findFirst({ where: { id: docenteId, institucionId: a.institucionId }, include: { designaciones: true } });
    if (!docente) throw new NotFoundException('Docente no encontrado');
    const hoy = parseFecha(fecha);
    const usos = await usosDelDocente(db, docenteId);
    const motivos = [...new Set(usos.map((u) => u.motivoId))];
    const saldos = [];
    for (const motivoId of motivos) {
      const delMotivo = usos.filter((u) => u.motivoId === motivoId);
      const variante = await db.varianteLicencia.findFirst({ where: { motivoId, activa: true }, include: { motivo: true }, orderBy: { codigo: 'asc' } });
      const vig = variante ? await reglaVigente(db, variante.id, hoy) : null;
      if (!vig) continue;
      const regla: ReglaDefinicion = vig.regla;
      const inicioTitular = iniciosAntiguedad(docente, { fechaDesde: hoy }, docente.designaciones).TITULAR;
      const v = ventanaPeriodo(regla.periodoTope, hoy, { inicioTitular });
      const usados = regla.tramosHaberes ? delMotivo.reduce((s, u) => s + u.dias, 0) : delMotivo.reduce((s, u) => s + diasEnVentana(u, v.desde, v.hasta), 0);
      // Con escalones por antigüedad se toma la designación más antigua vigente del docente.
      const base = docente.designaciones.filter((d) => d.activa).sort((x, y) => x.fechaDesde.getTime() - y.fechaDesde.getTime())[0];
      const tope = regla.tramosHaberes ? duracionEnDias(regla.tramosHaberes[regla.tramosHaberes.length - 1].hasta)
        : topeAplicable(regla, base ? iniciosAntiguedad(docente, base, docente.designaciones) : {}, hoy);
      const tramo = regla.tramosHaberes?.find((t) => usados < duracionEnDias(t.hasta))?.pct ?? null;
      const s = await db.saldoLicencia.upsert({
        where: { docenteId_motivoId_periodo: { docenteId, motivoId, periodo: v.clave } },
        create: { docenteId, motivoId, periodo: v.clave, usados, tope, tramoHaberes: tramo },
        update: { usados, tope, tramoHaberes: tramo },
      });
      // Motivos sensibles o reservados: solo el titular y quien tiene datos_sensibles.ver ven cuál es.
      const reservado = (regla.sensible || regla.reservada) && !accesoCompleto(a, docenteId);
      saldos.push(reservado
        ? { ...s, motivoId: null, motivo: CODIGO_TIPO_RESERVADO, nombre: ETIQUETA_TIPO_RESERVADO, reservado: true }
        : { ...s, motivo: variante!.motivo.codigo, nombre: variante!.motivo.nombre, reservado: false });
    }
    return saldos;
  }
}
