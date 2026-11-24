/**
 * Cálculos puros del régimen de licencias (sin base de datos): duraciones, unidades de cómputo,
 * ventanas de los topes, antigüedad y tramos de haberes. Las fechas son de calendario (medianoche UTC).
 */
import { DIA_MS, formatoISO, parseFecha, sumarDias } from '../../common/fechas';
import { Ambito, Duracion, Periodo, ReglaDefinicion, Unidad } from './regla.schema';

// ───────────── Duraciones ─────────────

const partes = (d: Duracion) => ({ n: Number(d.slice(0, -1)), u: d.slice(-1) as 'd' | 'm' | 'a' });

/** Suma una duración a una fecha respetando el calendario (4 meses desde el 15/03 = 15/07). */
export function sumarDuracion(f: Date, d: Duracion): Date {
  const { n, u } = partes(d);
  if (u === 'd') return sumarDias(f, n);
  const meses = u === 'm' ? n : n * 12;
  const r = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + meses, 1));
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), Math.min(f.getUTCDate(), ultimo)));
}

/** Equivalente en días de una duración para topes acumulativos (1 año = 365 días, 1 mes = 30 días). */
export function duracionEnDias(d: Duracion): number {
  const { n, u } = partes(d);
  return u === 'd' ? n : u === 'm' ? n * 30 : n * 365;
}

/** ¿Desde `inicio` hasta `fecha` se cumplió la duración? (inicio null = sin antigüedad). */
export const cumpleDuracion = (inicio: Date | null | undefined, fecha: Date, d: Duracion) => !!inicio && sumarDuracion(inicio, d) <= fecha;

// ───────────── Calendario ─────────────

export interface Calendario {
  /** Días sin actividad (feriados, receso, asuetos) en formato AAAA-MM-DD. */
  noLaborables: Set<string>;
  /** Días de la semana (1 = lunes … 7 = domingo) en que el docente tiene horario. Solo para LABORABLES. */
  diasConHorario?: Set<number>;
}

const diaSemana = (f: Date) => ((f.getUTCDay() + 6) % 7) + 1; // 1 = lunes … 7 = domingo

/** ¿El día cuenta para la unidad indicada? */
export function cuentaDia(unidad: Unidad, f: Date, cal: Calendario): boolean {
  if (unidad === 'CORRIDOS' || unidad === 'SIN_TOPE') return true;
  if (cal.noLaborables.has(formatoISO(f))) return false;
  const d = diaSemana(f);
  if (unidad === 'HABILES') return d <= 5;
  // LABORABLES y MINUTOS_JORNADA: días en que el docente tiene obligaciones según sus horarios.
  return cal.diasConHorario ? cal.diasConHorario.has(d) : d <= 5;
}

/** Días que computa un período en la unidad de la regla (ambos extremos incluidos). */
export function diasEnUnidad(unidad: Unidad, desde: Date, hasta: Date, cal: Calendario): number {
  if (hasta < desde) return 0;
  if (unidad === 'CORRIDOS' || unidad === 'SIN_TOPE') return Math.round((hasta.getTime() - desde.getTime()) / DIA_MS) + 1;
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (cuentaDia(unidad, f, cal)) n++;
  return n;
}

/** Último día de una licencia de `dias` en la unidad indicada que empieza en `desde`. */
export function fechaFinPorDias(unidad: Unidad, desde: Date, dias: number, cal: Calendario): Date {
  if (dias <= 0) return desde;
  if (unidad === 'CORRIDOS' || unidad === 'SIN_TOPE') return sumarDias(desde, dias - 1);
  let n = 0;
  for (let f = desde, guarda = 0; guarda < 3660; f = sumarDias(f, 1), guarda++) {
    if (cuentaDia(unidad, f, cal) && ++n === dias) return f;
  }
  throw new Error('No hay días computables suficientes en el calendario');
}

// ───────────── Ventanas de los topes ─────────────

export interface OpcionesPeriodo {
  /** Inicio del año escolar "MM-DD" (por defecto 03-01). */
  inicioAnioEscolar?: string;
  /** Inicio de la carrera como titular, para los decenios (art. 318 a). */
  inicioTitular?: Date | null;
}

export interface Ventana { desde: Date; hasta: Date; clave: string }

const LEJANO_PASADO = parseFecha('1900-01-01');
const LEJANO_FUTURO = parseFecha('2999-12-31');

/** Período dentro del cual se controla el tope para una licencia que empieza en `fecha`. */
export function ventanaPeriodo(periodo: Periodo, fecha: Date, op: OpcionesPeriodo = {}): Ventana {
  const anio = fecha.getUTCFullYear();
  switch (periodo) {
    case 'ANIO_CALENDARIO':
      return { desde: new Date(Date.UTC(anio, 0, 1)), hasta: new Date(Date.UTC(anio, 11, 31)), clave: String(anio) };
    case 'ANIO_ESCOLAR': {
      const [mm, dd] = (op.inicioAnioEscolar ?? '03-01').split('-').map(Number);
      const inicioEste = new Date(Date.UTC(anio, mm - 1, dd));
      const inicio = fecha >= inicioEste ? inicioEste : new Date(Date.UTC(anio - 1, mm - 1, dd));
      const fin = sumarDias(new Date(Date.UTC(inicio.getUTCFullYear() + 1, mm - 1, dd)), -1);
      return { desde: inicio, hasta: fin, clave: `ESC-${inicio.getUTCFullYear()}` };
    }
    case 'DECENIO': {
      // Decenios de ejercicio contados desde el inicio como titular; sin ese dato, los diez años previos.
      if (op.inicioTitular && op.inicioTitular <= fecha) {
        let inicio = op.inicioTitular;
        while (sumarDuracion(inicio, '10a') <= fecha) inicio = sumarDuracion(inicio, '10a');
        const fin = sumarDias(sumarDuracion(inicio, '10a'), -1);
        return { desde: inicio, hasta: fin, clave: `DEC-${formatoISO(inicio)}` };
      }
      const haceDiez = new Date(Date.UTC(anio - 10, fecha.getUTCMonth(), fecha.getUTCDate()));
      return { desde: sumarDias(haceDiez, 1), hasta: fecha, clave: `DEC-${anio}` };
    }
    case 'CARRERA':
    case 'ACUMULATIVO':
      return { desde: LEJANO_PASADO, hasta: LEJANO_FUTURO, clave: 'CARRERA' };
    case 'POR_EVENTO':
    case 'MANDATO':
      return { desde: fecha, hasta: LEJANO_FUTURO, clave: 'EVENTO' };
  }
}

// ───────────── Antigüedad y tope ─────────────

export type InicioAntiguedad = Partial<Record<Ambito, Date | null>>;

/** Tope aplicable según los escalones de antigüedad (el primero que se cumple). */
export function topeAplicable(regla: Pick<ReglaDefinicion, 'tope'>, antig: InicioAntiguedad, fecha: Date): number | null {
  const t = regla.tope;
  if (t === null) return null;
  if (typeof t === 'number') return t;
  for (const e of t.escalones) {
    if (!e.antigMin) return e.dias;
    if (cumpleDuracion(antig[e.ambito ?? 'CARGO_ESTABLECIMIENTO'], fecha, e.antigMin)) return e.dias;
  }
  return 0;
}

// ───────────── Tramos de haberes ─────────────

export interface TramoAplicado { dias: number; pct: number }

/**
 * Reparte los días pedidos entre los tramos de haberes según lo ya acumulado (art. 309 b 2: 2 años al 100 %,
 * 1 año más al 50 %). Lo que excede el último tramo se devuelve aparte.
 */
export function repartirTramos(tramos: { hasta: Duracion; pct: number }[], acumulado: number, pedidos: number) {
  const aplicados: TramoAplicado[] = [];
  let cursor = acumulado, restantes = pedidos;
  for (const t of tramos) {
    const limite = duracionEnDias(t.hasta);
    if (cursor >= limite || restantes <= 0) continue;
    const toma = Math.min(restantes, limite - cursor);
    aplicados.push({ dias: toma, pct: t.pct });
    cursor += toma;
    restantes -= toma;
  }
  return { aplicados, excedente: restantes };
}

/** Días de un período [d1, h1] que caen dentro de [d2, h2]. */
export function diasSuperpuestos(d1: Date, h1: Date, d2: Date, h2: Date) {
  const desde = d1 > d2 ? d1 : d2, hasta = h1 < h2 ? h1 : h2;
  return hasta < desde ? 0 : Math.round((hasta.getTime() - desde.getTime()) / DIA_MS) + 1;
}
