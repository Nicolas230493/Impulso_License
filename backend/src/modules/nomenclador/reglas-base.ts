/**
 * Reglas iniciales (versión 1) de cada variante del nomenclador 2026, derivadas del Excel oficial, de la Ley 647-E
 * (texto 2024) y del spec de adecuación. Se cargan al importar el nomenclador y después se administran como datos
 * (nuevas versiones con vigencia), sin tocar este archivo.
 *
 * Diferencias entre nomenclador y ley: se aplica la opción MÁS RESTRICTIVA y queda anotada en `diferencia`
 * (D1–D8 del spec; D9 y D10 detectadas al cargar el Excel). Ver docs/nomenclador.md.
 */
import { ReglaDefinicionEntrada, Revista } from './regla.schema';

type Base = Omit<ReglaDefinicionEntrada, 'revista'>;
export interface VarianteParaRegla { codigo: string; revistas: Revista[]; pctHaberes: number | null }

const esTitular = (r: Revista[]) => r.includes('TITULAR');
const esInterino = (r: Revista[]) => r.includes('INTERINO') || r.includes('TRANSITORIO');
const esSuplente = (r: Revista[]) => r.includes('SUPLENTE');

const RM_24H = [
  { nombre: 'Certificado médico', desde: 'PRESENTACION' as const },
  { nombre: 'Dictamen de Reconocimientos Médicos', plazoHoras: 24, desde: 'REINTEGRO' as const },
];
const SIN_TOPE = { tope: null, periodoTope: 'POR_EVENTO' as const, unidad: 'SIN_TOPE' as const, alcanceCargos: 'TODOS' as const };
const LARGO_TRAMOS = [{ hasta: '2a', pct: 100 }, { hasta: '3a', pct: 50 }];

/** Plantilla por motivo. Recibe la variante para ajustar por revista y número. */
const MOTIVOS: Record<string, (v: VarianteParaRegla) => Base | null> = {
  // ───────── Agrupación 1: Salud ─────────
  '1.1': (v) => ({
    unidad: 'CORRIDOS', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL1',
    tope: esTitular(v.revistas) ? 45
      : esInterino(v.revistas) ? { escalones: [{ antigMin: '4m', ambito: 'CARGO_ESTABLECIMIENTO', dias: 30 }, { dias: 10 }] }
      : { escalones: [{ antigMin: '4m', ambito: 'CARGO_ESTABLECIMIENTO', dias: 15 }, { dias: 5 }] },
    dictamenRM: true, documentacion: RM_24H, sensible: true, alExcederTope: 'PRORROGA_347',
    nota: 'Arts. 309 b 1, 331 a y 340 a. Puede reencuadrarse como largo tratamiento sin agotar el tope (art. 316).',
  }),
  '1.2': (v) => ({
    unidad: 'CORRIDOS', periodoTope: 'ACUMULATIVO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL2',
    tope: null, tramosHaberes: LARGO_TRAMOS, acumulaDiscontinuos: true, dictamenRM: true, documentacion: RM_24H, sensible: true,
    alExcederTope: 'PRORROGA_347',
    requisitos: {
      antiguedad: esInterino(v.revistas) ? [{ ambito: 'SISTEMA', min: '6m' }]
        : esSuplente(v.revistas) ? [{ ambito: 'SISTEMA', min: '1a', oSinTermino: true }] : [],
    },
    diferencia: esSuplente(v.revistas) ? 'D1: nomenclador 6 meses en el sistema; ley (art. 340 b) suplencia sin término o 1 año. Se aplica la ley.' : undefined,
    nota: 'Art. 309 b 2: dos años al 100 % y uno al 50 %, acumulativos. Previo informe de Reconocimientos Médicos.',
  }),
  '1.3': (v) => ({
    unidad: 'CORRIDOS', periodoTope: 'ACUMULATIVO', alcanceCargos: 'TODOS', autoridad: 'MINISTRO', planillaIL: 'IL2',
    tope: null, acumulaDiscontinuos: true, dictamenRM: true, sensible: true, alExcederTope: 'PRORROGA_347',
    tramosHaberes: esSuplente(v.revistas) ? [{ hasta: '6m', pct: 100 }, { hasta: '9m', pct: 50 }] : LARGO_TRAMOS,
    documentacion: [...RM_24H, { nombre: 'Denuncia del accidente (acta o actuación policial)', plazoHoras: 48, desde: 'EVENTO' }],
    fechaEvento: { etiqueta: 'el accidente', requerida: true },
    diferencia: esSuplente(v.revistas) ? 'D2: nomenclador 2 años + 1 al 50 %; ley (art. 340 c) 6 meses + 3 al 50 %. Se aplica la ley.' : undefined,
    nota: 'Arts. 309 b 3, 331 c y 340 c.',
  }),
  '1.4': (v) => {
    const prorroga = [2, 6, 8].includes(Number(v.codigo.split('.')[2]));
    return {
      unidad: 'CORRIDOS', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL1',
      tope: prorroga ? 30 : 180, dictamenRM: true, sensible: true, subsisteAlCese: true,
      documentacion: [{ nombre: 'Certificado médico de gravidez', desde: 'PRESENTACION' }, ...(prorroga ? [{ nombre: 'Certificado del parto múltiple o prematuro', desde: 'PRESENTACION' as const }] : [])],
      requisitos: { informativos: prorroga ? [] : ['Puede dividirse en 60 días antes del parto y 120 después (art. 309 c)'] },
      diferencia: prorroga ? 'D5: el nomenclador solo prevé 30 días de prórroga; la ley suma otros supuestos (tratamiento prolongado, discapacidad +90, niño muerto 60, traspaso al padre). Se aplica el nomenclador; los demás se cargan como regla nueva cuando se confirmen.' : undefined,
      nota: 'Art. 309 c: 180 días corridos de uso obligatorio. Continúa aunque cese la designación (arts. 331 d y 340 d).',
    };
  },
  '1.5': (v) => {
    const prorroga = v.codigo === '1.5.2';
    return {
      unidad: 'CORRIDOS', periodoTope: 'ANIO_ESCOLAR', alcanceCargos: 'SELECCION', autoridad: 'DIRECTOR', planillaIL: 'IL1',
      tope: prorroga ? 30 : esTitular(v.revistas) ? 28 : esInterino(v.revistas) ? 10 : 5,
      dictamenRM: true, sensible: true,
      requisitos: {
        antiguedad: esTitular(v.revistas) ? [] : [{ ambito: 'CARGO_ESTABLECIMIENTO', min: '4m' }],
        informativos: [prorroga ? 'Solo si el familiar fue derivado a un servicio especializado fuera de la provincia' : 'El familiar depende exclusivamente del cuidado del docente (declaración jurada)'],
      },
      documentacion: [{ nombre: 'Certificado médico del familiar', desde: 'PRESENTACION' }, ...(esTitular(v.revistas) ? [] : [{ nombre: 'Declaración jurada de único familiar', desde: 'PRESENTACION' as const }])],
      diferencia: esSuplente(v.revistas) ? 'D9: nomenclador 10 días para suplentes; ley (art. 340 e) 5 días. Se aplica la ley.' : undefined,
      nota: 'Arts. 309 d, 331 e y 340 e. No es obligatorio pedirla en todos los cargos.',
    };
  },
  '1.6': () => ({
    unidad: 'CORRIDOS', periodoTope: 'ANIO_ESCOLAR', alcanceCargos: 'TODOS', autoridad: 'MINISTRO', planillaIL: 'IL2',
    tope: null, topeTexto: 'Según prescripción médica, por período escolar', dictamenRM: true, sensible: true,
    documentacion: [{ nombre: 'Resolución ministerial', desde: 'PRESENTACION' }],
    nota: 'Art. 347: 100 % los dos primeros años, 50 % el tercero y 25 % el cuarto; los períodos discontinuos se acumulan. Llevar registro con el número de resolución.',
  }),
  '1.7': () => ({ ...SIN_TOPE, autoridad: 'DIRECTOR_REGIONAL', planillaIL: 'IL2', topeTexto: 'Según prescripción médica', sensible: true, nota: 'Art. 7 d.' }),
  // 1.8 (traslado transitorio por razones de salud) está incompleto en el Excel: queda sin regla hasta confirmarlo.

  // ───────── Agrupación 2: Otras licencias ─────────
  '2.1': () => ({
    unidad: 'CORRIDOS', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL1', tope: 60,
    nota: 'Art. 307: 60 días corridos a partir del 24 de diciembre. Se interrumpe por enfermedad, maternidad o razones de servicio (art. 315). Interinos y suplentes: haber proporcional.',
  }),
  '2.2': (v) => {
    const n = Number(v.codigo.split('.')[2]);
    const dias = [1, 7, 10].includes(n) ? 100 : [2, 8, 11].includes(n) ? 90 : 180;
    return {
      unidad: 'CORRIDOS', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL1', tope: dias, subsisteAlCese: true,
      fechaEvento: { etiqueta: 'la guarda con fines de adopción', requerida: true },
      documentacion: [{ nombre: 'Resolución de guarda con fines de adopción', desde: 'PRESENTACION' }],
      diferencia: `D3: nomenclador ${dias} días según la edad del niño; ley (art. 309 e) 180 días sin importar la edad. Se aplica el nomenclador.` + ([10, 11].includes(n) ? ' D4: el Excel encuadra esta variante de suplente en 331-F; debería ser 340-F.' : ''),
    };
  },
  '2.3': () => ({
    unidad: 'CORRIDOS', periodoTope: 'DECENIO', alcanceCargos: 'TODOS', autoridad: 'SUPERVISOR', planillaIL: 'IL1', tope: 365,
    requisitos: { antiguedad: [{ ambito: 'TITULAR', min: '1a' }], separacionMinima: '2a' },
    excluyeCon: ['*'],
    documentacion: [{ nombre: 'Nota con declaración jurada de licencias anteriores por esta causa', desde: 'PRESENTACION' }],
    nota: 'Art. 318 a: un año por decenio, no acumulable; 2 años entre usos; no puede ausentarse hasta ser notificado. Sin goce.',
  }),
  '2.4': () => ({
    unidad: 'CORRIDOS', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'SUPERVISOR', planillaIL: 'IL1', tope: 90, excluyeCon: ['*'],
    documentacion: [{ nombre: 'Nota que indique la causa', desde: 'PRESENTACION' }],
    nota: 'Art. 318 b. Sin goce.',
  }),
  '2.5': (v) => ({
    unidad: 'CORRIDOS', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'SELECCION', planillaIL: 'IL1',
    autoridad: esTitular(v.revistas) ? 'SUBSECRETARIO' : 'DIRECTOR_REGIONAL',
    autoridadAlternativa: esTitular(v.revistas) ? { autoridad: 'DIRECTOR_REGIONAL', condicion: 'Hasta un (1) año' } : undefined,
    tope: esTitular(v.revistas) ? { escalones: [{ antigMin: '3a', ambito: 'TITULAR', dias: 1095 }, { dias: 20 }] } : esInterino(v.revistas) ? 20 : 10,
    requisitos: { antiguedad: esTitular(v.revistas) ? [] : [{ ambito: 'CARGO_ESTABLECIMIENTO', min: '4m' }] },
    excluyeCon: ['2.3', '2.4'],
    nota: 'Arts. 318 c, 7 k, 333 a y 342 a. Sin antigüedad, hasta 20 días por año.',
  }),
  '2.6': () => ({ ...SIN_TOPE, periodoTope: 'MANDATO', autoridad: 'MINISTRO', planillaIL: 'IL2', topeTexto: 'Mientras dure el mandato y hasta 5 días hábiles posteriores', nota: 'Art. 318 d.' }),
  '2.7': () => ({
    ...SIN_TOPE, periodoTope: 'MANDATO', autoridad: 'MINISTRO', planillaIL: 'IL2', topeTexto: 'Mientras dure el mandato y hasta 5 días posteriores',
    autoridadAlternativa: { autoridad: 'SUBSECRETARIO', condicion: 'Cargo fuera de la jurisdicción' }, nota: 'Arts. 318 e, 333 f y 342 d. Sin goce.',
  }),
  '2.8': (v) => ({
    unidad: 'HABILES', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL1', tope: esSuplente(v.revistas) ? 2 : 10,
    fechaEvento: { etiqueta: 'casamiento', requerida: true, dentroDelPeriodo: true },
    documentacion: [{ nombre: 'Acta de matrimonio', desde: 'PRESENTACION' }],
    nota: 'Arts. 318 f, 333 b y 342 b. El período incluye la fecha del casamiento.',
  }),
  '2.9': (v) => ({
    unidad: 'LABORABLES', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL1', tope: esTitular(v.revistas) ? 30 : 16,
    fechaEvento: { etiqueta: 'examen', requerida: true, dentroDelPeriodo: true },
    documentacion: [{ nombre: 'Constancia del examen', plazoHoras: 120, desde: 'EVENTO' }],
    diferencia: esTitular(v.revistas) ? 'D6: la ley (art. 318 h) suma 15 días hábiles por concurso de ingreso o ascenso; el nomenclador no. Se aplica el nomenclador.' : undefined,
    nota: 'Arts. 318 h y 333 d. Sin la constancia dentro de los 5 días, las faltas son injustificadas.',
  }),
  '2.10': () => ({
    unidad: 'CORRIDOS', periodoTope: 'CARRERA', alcanceCargos: 'SELECCION', autoridad: 'SUPERVISOR', planillaIL: 'IL2', tope: 1095,
    requisitos: { informativos: ['No vale para cargos de igual jerarquía presupuestaria'] }, nota: 'Art. 318 i: tres años en toda la carrera. Sin goce.',
  }),
  '2.11': () => ({ ...SIN_TOPE, alcanceCargos: 'SELECCION', autoridad: 'SUPERIOR_INMEDIATO', planillaIL: 'IL2', origen: 'AUTOMATICA', topeTexto: 'Según designación', nota: 'Arts. 319, 333 e y 342 e: se registra desde la designación. Sin goce.' }),
  '2.13': (v) => {
    const sinGoce = v.pctHaberes === 0;
    return {
      unidad: 'LABORABLES', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', planillaIL: 'IL1',
      tope: esTitular(v.revistas) ? (sinGoce ? 4 : 10) : esInterino(v.revistas) ? 5 : 3,
      requisitos: { maxPorMes: esSuplente(v.revistas) ? undefined : 2, noContinuas: true },
      alertaBaja: esInterino(v.revistas) ? { enMes: 3, enPeriodo: 6, continuas: 3 } : esSuplente(v.revistas) ? { enMes: 3, enPeriodo: 4, continuas: 3 } : undefined,
      diferencia: esTitular(v.revistas) ? undefined
        : 'D7: nomenclador "3ª inasistencia en el mes = baja"; ley: más de 2 continuas o más de 5 (interinos, art. 336) / más de 3 (suplentes, art. 345) en el período lectivo. Se alerta con el primer umbral que se cumpla.',
      nota: 'Arts. 323, 336 y 345. Tardanzas y retiros justificados se descuentan de este cupo.',
    };
  },
  '2.14': () => ({ ...SIN_TOPE, alcanceCargos: 'SELECCION', autoridad: 'DIRECTOR', topeTexto: 'Según prescripción médica', sensible: true, nota: 'Arts. 311-312, 332 y 341.' }),
  '2.15': () => ({ ...SIN_TOPE, autoridad: 'DIRECTOR', topeTexto: 'Según prescripción médica', sensible: true, nota: 'Art. 318 j: sin requisitos de antigüedad ni de revista.' }),
  '2.16': () => ({
    unidad: 'CORRIDOS', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 1, sensible: true,
    documentacion: [{ nombre: 'Certificado médico', plazoHoras: 48, desde: 'INICIO' }], nota: 'Arts. 318 g, 333 c y 342 c.',
  }),
  '2.17': () => ({ ...SIN_TOPE, autoridad: null, topeTexto: 'Según designación (Res. 1280/00)', requisitos: { informativos: ['El nomenclador no indica autoridad: confirmar quién la otorga'] } }),
  '2.18': () => ({ ...SIN_TOPE, autoridad: 'DIRECTOR_REGIONAL', topeTexto: 'Según norma (Ley 3656, Res. 5128/07)' }),
  '2.19': () => ({ ...SIN_TOPE, periodoTope: 'MANDATO', autoridad: 'MINISTRO', topeTexto: 'Mientras dure la función', requisitos: { informativos: ['No debe exceder las 5 afectaciones'] }, nota: 'Art. 318 k.' }),
  '2.20': () => ({
    ...SIN_TOPE, autoridad: 'DIRECTOR', sensible: true, reservada: true, topeTexto: 'Hasta que cese el riesgo (lo evalúa la autoridad de aplicación)',
    requisitos: { informativos: ['Puede formalizarse en forma oral; se tramita en reserva'] }, nota: 'Art. 318 l.',
  }),
  '2.21': () => ({
    ...SIN_TOPE, periodoTope: 'MANDATO', autoridad: 'SUBSECRETARIO', topeTexto: 'Desde 60 días hábiles de iniciado el trámite jubilatorio hasta la baja',
    documentacion: [{ nombre: 'Nota al superior y constancia de inicio del trámite', desde: 'PRESENTACION' }], nota: 'Art. 318 m.',
  }),
  '2.22': () => ({ ...SIN_TOPE, autoridad: 'DIRECTOR', topeTexto: 'Según norma (Ley 7616)' }),
  '2.23': () => ({
    unidad: 'CORRIDOS', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 2,
    fechaEvento: { etiqueta: 'donación', requerida: true }, documentacion: [{ nombre: 'Constancia médica de la donación', desde: 'PRESENTACION' }], nota: 'Art. 318 n.',
  }),
  '2.24': () => ({ ...SIN_TOPE, autoridad: 'BIENESTAR', sensible: true, reservada: true, topeTexto: 'Plazo del dictamen (Ley 2023-A)', nota: 'Ley 3718-E, art. 318 ñ.' }),

  // ───────── Agrupación 3: Permisos ─────────
  '3.1': () => ({
    unidad: 'HABILES', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 15,
    ampliaciones: [{ clave: 'prematuro_multiple', condicion: 'Niño prematuro, nacimiento múltiple o con trastornos congénitos', dias: 15 }],
    fechaEvento: { etiqueta: 'nacimiento', requerida: true }, documentacion: [{ nombre: 'Partida de nacimiento', desde: 'PRESENTACION' }], nota: 'Arts. 320 a, 334 a y 343 a.',
  }),
  '3.2': (v) => ({
    unidad: 'CORRIDOS', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 30,
    ampliaciones: esTitular(v.revistas) ? [{ clave: 'discapacidad', condicion: 'Hijo con discapacidad o enfermedad de tratamiento prolongado', dias: 30 }] : [],
    fechaEvento: { etiqueta: 'la guarda', requerida: true }, nota: 'Arts. 320 b, 334 g y 343 f.',
  }),
  '3.3': (v) => ({
    unidad: esTitular(v.revistas) ? 'CORRIDOS' : 'HABILES', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 5,
    fechaEvento: { etiqueta: 'casamiento del hijo', requerida: true, dentroDelPeriodo: true }, nota: 'Arts. 320 e, 334 d y 343 d.',
  }),
  '3.4': (v) => {
    const n = Number(v.codigo.split('.')[2]);
    const grado = (n - 1) % 3; // 0 = 1er grado, 1 = 2do, 2 = 3er y 4to
    return {
      unidad: esSuplente(v.revistas) ? 'HABILES' : 'LABORABLES', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR',
      tope: [8, 2, 1][grado],
      ampliaciones: [{ clave: 'traslado', condicion: 'Debe trasladarse fuera de la localidad', dias: 2 }],
      fechaEvento: { etiqueta: 'fallecimiento', requerida: true },
      documentacion: [{ nombre: 'Declaración jurada del fallecimiento y el vínculo', desde: 'PRESENTACION' }],
      diferencia: esSuplente(v.revistas) ? 'D10: el Excel cuenta días laborables; la ley (art. 343 e) días hábiles para suplentes. Se aplica la ley.' : undefined,
      nota: 'Arts. 320 f, 334 e y 343 e.',
    };
  },
  '3.5': () => ({ ...SIN_TOPE, autoridad: 'DIRECTOR', topeTexto: 'Desde 24 h de oficializada la lista hasta 5 días después de la elección', nota: 'Arts. 321, 334 f y 343 i.' }),
  '3.6': () => ({ ...SIN_TOPE, autoridad: 'DIRECTOR', computaInasistencia: false, nota: 'Arts. 324, 337 y 346: no se computa la inasistencia.' }),
  '3.7': () => ({ ...SIN_TOPE, autoridad: 'DIRECTOR', computaInasistencia: false, nota: 'Arts. 325, 337 y 346: no se computa la inasistencia.' }),
  '3.8': () => ({ unidad: 'CORRIDOS', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 1, fechaEvento: { etiqueta: 'donación', requerida: true }, nota: 'Arts. 320 c, 334 b y 343 b.' }),
  '3.9': () => ({
    unidad: 'MINUTOS_JORNADA', periodoTope: 'POR_EVENTO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: null, duracionMaxima: '3m',
    topeTexto: '60 minutos diarios', ampliaciones: [{ clave: 'prorroga', condicion: 'Prórroga por prescripción médica', dias: 90 }],
    sensible: true, nota: 'Arts. 320 d, 334 c y 343 c.',
  }),
  '3.10': () => ({ unidad: 'CORRIDOS', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 1, sensible: true, documentacion: [{ nombre: 'Certificado médico', desde: 'PRESENTACION' }], nota: 'Arts. 320 g, 334 h y 343 g.' }),
  '3.11': () => ({
    unidad: 'LABORABLES', periodoTope: 'ANIO_CALENDARIO', alcanceCargos: 'TODOS', autoridad: 'DIRECTOR', tope: 1,
    fechaEvento: { etiqueta: 'natalicio', origen: 'FECHA_NACIMIENTO', dentroDelPeriodo: true }, nota: 'Arts. 320 h, 334 i y 343 h.',
  }),
  '3.12': () => ({
    ...SIN_TOPE, autoridad: 'DIRECTOR', topeTexto: 'Según la citación', documentacion: [{ nombre: 'Citación judicial', desde: 'PRESENTACION' }],
    diferencia: 'D8: el permiso figura en los arts. 320 i, 334 j y 343 j, pero no en las enumeraciones de los arts. 306, 329 y 338. Se mantiene.',
  }),
};

/** Sanciones y movimientos provisorios: novedades de RR.HH. con instrumento legal; no consumen topes. */
const novedad = (): Base => ({ ...SIN_TOPE, alcanceCargos: 'SELECCION', autoridad: null, origen: 'NOVEDAD_RRHH', planillaIL: 'NINGUNA', documentacion: [{ nombre: 'Instrumento legal', desde: 'PRESENTACION' }] });

/** Regla inicial de una variante, o null si el nomenclador no da datos suficientes (queda para cargar a mano). */
export function reglaBase(v: VarianteParaRegla): ReglaDefinicionEntrada | null {
  const [agr, mot] = v.codigo.split('.');
  const motivo = `${agr}.${mot}`;
  const base = agr === '4' || agr === '5' ? novedad() : MOTIVOS[motivo]?.(v) ?? null;
  if (!base) return null;
  return { ...base, revista: v.revistas };
}

/** Planilla IL de un motivo (IL2 = extraordinarias). Provisorio hasta tener los modelos reales de IL1 e IL2. */
export function planillaDeMotivo(codigo: string): 'IL1' | 'IL2' | 'NINGUNA' {
  const [agr] = codigo.split('.');
  if (agr === '4' || agr === '5') return 'NINGUNA';
  const r = MOTIVOS[codigo]?.({ codigo: `${codigo}.1`, revistas: ['TITULAR'], pctHaberes: 100 });
  return (r?.planillaIL as 'IL1' | 'IL2' | undefined) ?? 'IL1';
}
