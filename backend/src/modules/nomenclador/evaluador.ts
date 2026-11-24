/**
 * Evaluador de reglas del nomenclador (función pura). Recibe la regla vigente de la variante y el contexto ya
 * calculado (días, antigüedad, uso previo) y devuelve los hallazgos y el reparto en tramos de haberes.
 *
 * Niveles (spec, "Validaciones al presentar"):
 * - BLOQUEANTE: la solicitud no puede seguir (revista, alcance, evento, incompatibilidad).
 * - EXCEPCIONABLE: topes y requisitos; solo los salta quien tiene `licencias.excepcion`, con motivo e instrumento legal.
 * - ADVERTENCIA: avisos que no impiden (umbral de baja de interinos y suplentes, controles manuales).
 */
import { formatoISO, seSuperponen, sumarDias } from '../../common/fechas';
import { cumpleDuracion, duracionEnDias, InicioAntiguedad, repartirTramos, sumarDuracion, topeAplicable, TramoAplicado } from './calculo';
import { ReglaDefinicion, Revista } from './regla.schema';

export type Nivel = 'BLOQUEANTE' | 'EXCEPCIONABLE' | 'ADVERTENCIA';
export interface Hallazgo { codigo: string; nivel: Nivel; mensaje: string }

export interface LicenciaPrevia {
  motivoCodigo: string;
  desde: Date;
  hasta: Date;
  /** Motivos que la licencia previa excluye mientras está en curso (p. ej. asuntos particulares: "*"). */
  excluyeCon?: string[];
}

export interface ContextoEvaluacion {
  motivoCodigo: string;
  revista: Revista;
  desde: Date;
  hasta: Date;
  /** Días pedidos en la unidad de la regla (calculados con el calendario y los horarios del docente). */
  diasPedidos: number;
  fechaEvento?: Date | null;
  /** Claves de ampliación acreditadas (p. ej. "multiple", "traslado"). */
  ampliaciones?: string[];
  antiguedad: InicioAntiguedad;
  sinTermino?: boolean;
  /** Días del mismo motivo ya usados dentro de la ventana del tope. */
  usadosEnPeriodo: number;
  /** Días acumulados del motivo en toda la carrera (para tramos de haberes). */
  acumulado: number;
  /** Otras licencias del docente (otorgadas o en trámite), para separación e incompatibilidades. */
  previas: LicenciaPrevia[];
  /** Inasistencias del mismo motivo ya registradas, sin contar la actual (2.13). */
  inasistencias?: { enMes: number; enPeriodo: number };
  /** Designaciones activas del docente que no se incluyeron (para alcance TODOS). */
  designacionesNoIncluidas?: number;
}

export interface ResultadoEvaluacion {
  admisible: boolean;
  requiereExcepcion: boolean;
  hallazgos: Hallazgo[];
  tope: number | null;
  disponibles: number | null;
  excedente: number;
  tramos: TramoAplicado[];
  propuestaParticion: { dentroDelTope: number; excedente: number; como: 'PRORROGA_347' | 'SIN_GOCE' } | null;
  autoridad: ReglaDefinicion['autoridad'];
  requiereDictamenRM: boolean;
  documentacion: ReglaDefinicion['documentacion'];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function evaluarRegla(regla: ReglaDefinicion, c: ContextoEvaluacion): ResultadoEvaluacion {
  const h: Hallazgo[] = [];
  const add = (codigo: string, nivel: Nivel, mensaje: string) => h.push({ codigo, nivel, mensaje });

  // 1. La variante existe para la situación de revista de la designación.
  if (regla.revista.length && !regla.revista.includes(c.revista))
    add('REVISTA', 'BLOQUEANTE', `Esta variante no corresponde a la situación de revista ${c.revista.toLowerCase()}`);

  if (c.hasta < c.desde) add('PERIODO', 'BLOQUEANTE', 'La fecha final no puede ser anterior a la inicial');

  // 4. Salud simultánea en todos los cargos.
  if (regla.alcanceCargos === 'TODOS' && (c.designacionesNoIncluidas ?? 0) > 0)
    add('ALCANCE', 'BLOQUEANTE', 'Esta licencia abarca todas las designaciones del docente (arts. 331 y 340): inclúyalas a todas');

  // 6. Fecha del evento.
  if (regla.fechaEvento && regla.fechaEvento.origen === 'SOLICITUD') {
    const ev = c.fechaEvento;
    if (!ev && regla.fechaEvento.requerida) add('EVENTO', 'BLOQUEANTE', `Indique la fecha de ${regla.fechaEvento.etiqueta}`);
    else if (ev && regla.fechaEvento.dentroDelPeriodo && (ev < c.desde || ev > c.hasta))
      add('EVENTO', 'BLOQUEANTE', `La fecha de ${regla.fechaEvento.etiqueta} (${formatoISO(ev)}) debe estar dentro del período pedido`);
  }
  if (regla.fechaEvento?.origen === 'FECHA_NACIMIENTO') {
    if (!c.fechaEvento) add('EVENTO', 'BLOQUEANTE', 'El legajo no tiene fecha de nacimiento cargada');
    else if (regla.fechaEvento.dentroDelPeriodo) {
      const ev = new Date(Date.UTC(c.desde.getUTCFullYear(), c.fechaEvento.getUTCMonth(), c.fechaEvento.getUTCDate()));
      if (ev < c.desde || ev > c.hasta) add('EVENTO', 'BLOQUEANTE', `El permiso debe tomarse en la fecha de ${regla.fechaEvento.etiqueta} (${formatoISO(ev)})`);
    }
  }

  // 2. Requisitos de antigüedad y otros.
  for (const req of regla.requisitos.antiguedad) {
    const cumple = cumpleDuracion(c.antiguedad[req.ambito], c.desde, req.min) || (req.oSinTermino && c.sinTermino);
    if (!cumple) {
      const ambito = { CARGO_ESTABLECIMIENTO: 'en el cargo y el establecimiento', SISTEMA: 'en el sistema', TITULAR: 'como titular' }[req.ambito];
      add('ANTIGUEDAD', 'EXCEPCIONABLE', `Requiere ${req.min.replace('a', ' año(s)').replace('m', ' mes(es)').replace('d', ' día(s)')} de antigüedad ${ambito}${req.oSinTermino ? ' o suplencia sin término' : ''}`);
    }
  }
  if (regla.requisitos.separacionMinima) {
    const sep = regla.requisitos.separacionMinima;
    const previa = c.previas.find((p) => p.motivoCodigo === c.motivoCodigo && sumarDuracion(p.hasta, sep) > c.desde && p.hasta < c.desde);
    if (previa) add('SEPARACION', 'EXCEPCIONABLE', `Deben pasar ${sep.replace('a', ' año(s)').replace('m', ' mes(es)')} desde la licencia anterior (terminó el ${formatoISO(previa.hasta)})`);
  }
  for (const txt of regla.requisitos.informativos) add('CONTROL_MANUAL', 'ADVERTENCIA', txt);

  // 5. Incompatibilidades en simultáneo (en ambos sentidos).
  for (const p of c.previas) {
    if (!seSuperponen(p.desde, p.hasta, c.desde, c.hasta) || p.motivoCodigo === c.motivoCodigo) continue;
    const excluyeNueva = regla.excluyeCon.includes('*') || regla.excluyeCon.includes(p.motivoCodigo);
    const excluyePrevia = p.excluyeCon?.includes('*') || p.excluyeCon?.includes(c.motivoCodigo);
    if (excluyeNueva || excluyePrevia)
      // Sin el código de la otra licencia: podría ser de salud y quien consulta no siempre puede verlo.
      add('INCOMPATIBLE', 'BLOQUEANTE', `Es incompatible con otra licencia del docente del ${formatoISO(p.desde)} al ${formatoISO(p.hasta)}`);
  }

  // Inasistencias por razones particulares (2.13): no continuas y máximo por mes.
  if (regla.requisitos.noContinuas) {
    const pegada = c.previas.some((p) => p.motivoCodigo === c.motivoCodigo && (formatoISO(sumarDias(p.hasta, 1)) === formatoISO(c.desde) || formatoISO(sumarDias(c.hasta, 1)) === formatoISO(p.desde)));
    if (c.diasPedidos > 1 || pegada) add('CONTINUAS', 'EXCEPCIONABLE', 'Estas inasistencias no pueden ser continuas');
  }
  if (regla.requisitos.maxPorMes && c.inasistencias && c.inasistencias.enMes + c.diasPedidos > regla.requisitos.maxPorMes)
    add('MAX_MES', 'EXCEPCIONABLE', `No pueden exceder ${regla.requisitos.maxPorMes} por mes (ya registradas en ${MESES[c.desde.getUTCMonth()]}: ${c.inasistencias.enMes})`);
  if (regla.alertaBaja && c.inasistencias) {
    const a = regla.alertaBaja;
    const enMes = c.inasistencias.enMes + c.diasPedidos, enPeriodo = c.inasistencias.enPeriodo + c.diasPedidos;
    if ((a.enMes && enMes >= a.enMes) || (a.enPeriodo && enPeriodo >= a.enPeriodo) || (a.continuas && c.diasPedidos >= a.continuas))
      add('UMBRAL_BAJA', 'ADVERTENCIA', `Alcanza el umbral de baja por inasistencias (${enMes} en el mes, ${enPeriodo} en el período): avisar al director (arts. 336 y 345)`);
  }

  // Duración máxima calendario (lactancia).
  if (regla.duracionMaxima) {
    const extra = (c.ampliaciones ?? []).reduce((s, k) => s + (regla.ampliaciones.find((x) => x.clave === k)?.dias ?? 0), 0);
    const limite = sumarDias(sumarDuracion(c.desde, regla.duracionMaxima), extra - 1);
    if (c.hasta > limite) add('DURACION', 'EXCEPCIONABLE', `Supera la duración máxima (${regla.duracionMaxima.replace('m', ' meses')}${extra ? ` + ${extra} días` : ''})`);
  }

  // 3. Tope del período y tramos de haberes.
  const extraTope = (c.ampliaciones ?? []).reduce((s, k) => s + (regla.ampliaciones.find((x) => x.clave === k)?.dias ?? 0), 0);
  let tope = topeAplicable(regla, c.antiguedad, c.desde);
  let tramos: TramoAplicado[] = [];
  let excedente = 0;
  let disponibles: number | null = null;
  if (regla.tramosHaberes?.length) {
    const r = repartirTramos(regla.tramosHaberes, c.acumulado, c.diasPedidos);
    tramos = r.aplicados;
    excedente = r.excedente;
    tope = duracionEnDias(regla.tramosHaberes[regla.tramosHaberes.length - 1].hasta);
    disponibles = Math.max(0, tope - c.acumulado);
  } else if (tope !== null) {
    tope += extraTope;
    const usados = regla.periodoTope === 'POR_EVENTO' ? 0 : c.usadosEnPeriodo;
    disponibles = Math.max(0, tope - usados);
    excedente = Math.max(0, c.diasPedidos - disponibles);
  }
  if (excedente > 0) {
    const unidad = { CORRIDOS: 'días corridos', HABILES: 'días hábiles', LABORABLES: 'días laborables', MINUTOS_JORNADA: 'jornadas', SIN_TOPE: 'días' }[regla.unidad];
    add('TOPE', 'EXCEPCIONABLE', `Supera el tope: quedan ${disponibles} ${unidad} disponibles y se piden ${c.diasPedidos}`);
  }
  const propuestaParticion =
    excedente > 0 && regla.alExcederTope !== 'NINGUNA' ? { dentroDelTope: c.diasPedidos - excedente, excedente, como: regla.alExcederTope } : null;

  return {
    admisible: !h.some((x) => x.nivel !== 'ADVERTENCIA'),
    requiereExcepcion: !h.some((x) => x.nivel === 'BLOQUEANTE') && h.some((x) => x.nivel === 'EXCEPCIONABLE'),
    hallazgos: h,
    tope,
    disponibles,
    excedente,
    tramos,
    propuestaParticion,
    autoridad: regla.autoridad,
    requiereDictamenRM: regla.dictamenRM,
    documentacion: regla.documentacion,
  };
}
