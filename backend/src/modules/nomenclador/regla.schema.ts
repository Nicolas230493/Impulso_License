import { z } from 'zod';

/**
 * Definición declarativa de la regla de una variante del nomenclador (Ley 647-E).
 * Se guarda como JSON en ReglaVariante.definicion, versionada por vigencia, y la evalúa el motor sin tocar código.
 */

export const REVISTAS = ['TITULAR', 'INTERINO', 'TRANSITORIO', 'SUPLENTE', 'PROVISIONAL'] as const;
export const UNIDADES = ['CORRIDOS', 'HABILES', 'LABORABLES', 'MINUTOS_JORNADA', 'SIN_TOPE'] as const;
export const PERIODOS = ['ANIO_CALENDARIO', 'ANIO_ESCOLAR', 'DECENIO', 'CARRERA', 'POR_EVENTO', 'MANDATO', 'ACUMULATIVO'] as const;
export const AMBITOS = ['CARGO_ESTABLECIMIENTO', 'SISTEMA', 'TITULAR'] as const;
export const AUTORIDADES = ['DIRECTOR', 'SUPERVISOR', 'SUPERIOR_INMEDIATO', 'DIRECTOR_REGIONAL', 'SUBSECRETARIO', 'MINISTRO', 'BIENESTAR', 'JUNTA'] as const;

/** Duración: número + d (días), m (meses) o a (años). Ej.: "4m", "2a", "30d". */
export const Duracion = z.string().regex(/^\d+[dma]$/, 'duración inválida (use 30d, 4m o 2a)');
export type Duracion = z.infer<typeof Duracion>;

const Escalon = z.object({
  /** Antigüedad mínima para este escalón. Sin antigMin = escalón por defecto (debe ir último). */
  antigMin: Duracion.optional(),
  ambito: z.enum(AMBITOS).optional(),
  dias: z.number().int().nonnegative(),
});

export const Tope = z.union([z.number().int().nonnegative(), z.object({ escalones: z.array(Escalon).min(1) })]);

const Tramo = z.object({ hasta: Duracion, pct: z.number().int().min(0).max(100) });

const RequisitoAntiguedad = z.object({
  ambito: z.enum(AMBITOS),
  min: Duracion,
  /** Alternativa que también habilita (art. 340 b: suplencia sin término). */
  oSinTermino: z.boolean().optional(),
});

const Documento = z.object({
  nombre: z.string().min(1),
  /** Plazo de presentación en horas, contado desde `desde`. */
  plazoHoras: z.number().int().positive().optional(),
  desde: z.enum(['PRESENTACION', 'INICIO', 'EVENTO', 'REINTEGRO']).default('PRESENTACION'),
  obligatoria: z.boolean().default(true),
});

/** Extensiones del tope que requieren acreditar una condición (p. ej. parto múltiple, +2 días por traslado). */
const Ampliacion = z.object({ clave: z.string().min(1), condicion: z.string().min(1), dias: z.number().int().positive() });

export const ReglaDefinicion = z
  .object({
    revista: z.array(z.enum(REVISTAS)),
    unidad: z.enum(UNIDADES),
    periodoTope: z.enum(PERIODOS),
    /** Tope en la unidad de la regla. null = sin tope numérico (según prescripción, mandato, designación…). */
    tope: Tope.nullable(),
    topeTexto: z.string().optional(),
    /** Duración máxima calendario del período pedido (p. ej. lactancia: 3 meses). */
    duracionMaxima: Duracion.optional(),
    ampliaciones: z.array(Ampliacion).default([]),
    /** Tramos de haberes sobre lo acumulado (largo tratamiento: 2 años al 100 %, 1 año al 50 %). */
    tramosHaberes: z.array(Tramo).optional(),
    acumulaDiscontinuos: z.boolean().default(false),
    /** TODOS: la licencia abarca todas las designaciones (salud simultánea, arts. 331 y 340). */
    alcanceCargos: z.enum(['TODOS', 'SELECCION']),
    requisitos: z
      .object({
        antiguedad: z.array(RequisitoAntiguedad).default([]),
        /** Plazo mínimo entre el fin de un uso y el inicio del siguiente (art. 318 a: 2 años). */
        separacionMinima: Duracion.optional(),
        maxPorMes: z.number().int().positive().optional(),
        noContinuas: z.boolean().optional(),
        /** Requisitos que el sistema no puede verificar y se muestran para control manual. */
        informativos: z.array(z.string()).default([]),
      })
      .default({ antiguedad: [], informativos: [] }),
    documentacion: z.array(Documento).default([]),
    /** Requiere dictamen de Reconocimientos Médicos (arts. 313 y 317). */
    dictamenRM: z.boolean().default(false),
    /** Códigos de motivo incompatibles en simultáneo; "*" = cualquier otra licencia (art. 318 a y b). */
    excluyeCon: z.array(z.string()).default([]),
    autoridad: z.enum(AUTORIDADES).nullable(),
    autoridadAlternativa: z.object({ autoridad: z.enum(AUTORIDADES), condicion: z.string() }).optional(),
    sensible: z.boolean().default(false),
    reservada: z.boolean().default(false),
    origen: z.enum(['SOLICITUD', 'AUTOMATICA', 'NOVEDAD_RRHH']).default('SOLICITUD'),
    fechaEvento: z
      .object({
        etiqueta: z.string(),
        requerida: z.boolean().default(true),
        /** La fecha del evento debe caer dentro del período pedido (matrimonio "con la fecha incluida"). */
        dentroDelPeriodo: z.boolean().default(false),
        /** Se toma del legajo en vez de pedirla (natalicio: fecha de nacimiento). */
        origen: z.enum(['SOLICITUD', 'FECHA_NACIMIENTO']).default('SOLICITUD'),
      })
      .optional(),
    /** Qué ofrece el sistema cuando se supera el tope. */
    alExcederTope: z.enum(['PRORROGA_347', 'SIN_GOCE', 'NINGUNA']).default('NINGUNA'),
    /** Umbral de baja por inasistencias de interinos y suplentes (arts. 336 y 345). */
    alertaBaja: z
      .object({ continuas: z.number().int().positive().optional(), enMes: z.number().int().positive().optional(), enPeriodo: z.number().int().positive().optional() })
      .optional(),
    /** La inasistencia no se computa (excursiones, credo no católico). */
    computaInasistencia: z.boolean().default(true),
    /** Continúa aunque cese la designación (maternidad y adopción, art. 350). */
    subsisteAlCese: z.boolean().default(false),
    planillaIL: z.enum(['IL1', 'IL2', 'NINGUNA']).default('NINGUNA'),
    /** Diferencia nomenclador ↔ ley que resuelve esta regla (D1…D10) y fundamento. */
    diferencia: z.string().optional(),
    nota: z.string().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.tope && typeof r.tope === 'object') {
      const sinAntig = r.tope.escalones.findIndex((e) => !e.antigMin);
      if (sinAntig !== -1 && sinAntig !== r.tope.escalones.length - 1)
        ctx.addIssue({ code: 'custom', path: ['tope'], message: 'el escalón sin antigüedad mínima debe ser el último' });
    }
    if (r.tramosHaberes && !r.acumulaDiscontinuos)
      ctx.addIssue({ code: 'custom', path: ['tramosHaberes'], message: 'los tramos de haberes requieren acumulaDiscontinuos' });
  });

export type ReglaDefinicion = z.output<typeof ReglaDefinicion>;
export type ReglaDefinicionEntrada = z.input<typeof ReglaDefinicion>;
export type Revista = (typeof REVISTAS)[number];
export type Ambito = (typeof AMBITOS)[number];
export type Unidad = (typeof UNIDADES)[number];
export type Periodo = (typeof PERIODOS)[number];

/** Valida una definición (al cargar una versión nueva o al leerla de la base). */
export function parsearRegla(json: unknown): ReglaDefinicion {
  const r = ReglaDefinicion.safeParse(json);
  if (!r.success) throw new Error(`Regla inválida: ${r.error.issues.map((i) => `${i.path.join('.') || 'regla'}: ${i.message}`).join('; ')}`);
  return r.data;
}
