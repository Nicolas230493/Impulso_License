import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFecha as f } from '../../common/fechas';
import { diasEnUnidad, fechaFinPorDias, repartirTramos, sumarDuracion, ventanaPeriodo } from './calculo';
import { ContextoEvaluacion, evaluarRegla } from './evaluador';
import { diferencias, Nomenclador, normalizarAutoridad, normalizarPago, normalizarRevistas, parsearNomenclador, VarianteImportada } from './importador';
import { parsearRegla, ReglaDefinicion, Revista } from './regla.schema';
import { reglaBase } from './reglas-base';

let nom: Nomenclador;
const variante = (codigo: string) => nom.variantes.find((v) => v.codigo === codigo)!;
const regla = (codigo: string): ReglaDefinicion => {
  const v = variante(codigo);
  return parsearRegla(reglaBase({ codigo, revistas: v.revistas as Revista[], pctHaberes: v.pctHaberes }));
};
const ctx = (c: Partial<ContextoEvaluacion> & Pick<ContextoEvaluacion, 'motivoCodigo' | 'revista' | 'desde' | 'hasta' | 'diasPedidos'>): ContextoEvaluacion => ({
  antiguedad: { CARGO_ESTABLECIMIENTO: f('2020-03-01'), SISTEMA: f('2015-03-01'), TITULAR: f('2015-03-01') },
  usadosEnPeriodo: 0, acumulado: 0, previas: [], ...c,
});
const codigos = (r: ReturnType<typeof evaluarRegla>) => r.hallazgos.map((h) => `${h.codigo}:${h.nivel}`);

beforeAll(async () => {
  nom = await parsearNomenclador(readFileSync(join(__dirname, '../../../prisma/datos/nomenclador-647e-2026.xlsx')));
}, 60_000);

describe('importación del nomenclador oficial 2026', () => {
  it('carga las 5 agrupaciones completas y sin errores', () => {
    expect(nom.errores).toEqual([]);
    expect(nom.motivos).toHaveLength(54);
    expect(nom.variantes).toHaveLength(176);
    const porAgrupacion = nom.variantes.reduce<Record<number, number>>((acc, v) => ({ ...acc, [v.agrupacion]: (acc[v.agrupacion] ?? 0) + 1 }), {});
    expect(porAgrupacion).toEqual({ 1: 41, 2: 71, 3: 43, 4: 12, 5: 9 });
  });

  it('normaliza revista, forma de pago y autoridad', () => {
    expect(normalizarRevistas('Interina').revistas).toEqual(['INTERINO', 'TRANSITORIO']);
    expect(normalizarRevistas('Titular / Interino/').revistas).toEqual(['TITULAR', 'INTERINO', 'TRANSITORIO']);
    expect([normalizarPago('Con goce de haberes'), normalizarPago('Con 50% de haberes'), normalizarPago('Sin goce de haberes')]).toEqual([100, 50, 0]);
    expect(normalizarAutoridad('Ministro/ Subsecretario').autoridad).toBe('MINISTRO');
    expect(normalizarAutoridad('Super. Inmediato').autoridad).toBe('SUPERIOR_INMEDIATO');
    expect(normalizarAutoridad('Sub. De Educ.').autoridad).toBe('SUBSECRETARIO');
    expect(normalizarAutoridad('Dirección de Bienestar Educativo').autoridad).toBe('BIENESTAR');
  });

  it('avisa las inconsistencias del Excel (D4, autoridad faltante, revista mal escrita)', () => {
    const avisos = nom.avisos.map((a) => `${a.codigo}: ${a.mensaje}`);
    expect(avisos.some((a) => a.startsWith('2.2.10') && /331-F/.test(a))).toBe(true);
    expect(avisos.some((a) => a.startsWith('2.17.1') && /no indica quién otorga/.test(a))).toBe(true);
    expect(avisos.some((a) => a.startsWith('3.12.2') && /Interina/.test(a))).toBe(true);
    expect(avisos.some((a) => a.startsWith('1.8.1') && /Sin regla/.test(a))).toBe(true);
  });

  it('vista previa: reimportar lo mismo no cambia nada; un cambio y una baja se detectan', () => {
    const actual = { motivos: nom.motivos.map((m) => ({ ...m, activo: true })), variantes: nom.variantes.map((v) => ({ ...v, activa: true, tieneReglas: true })) };
    const igual = diferencias(nom, actual);
    expect([igual.variantesNuevas, igual.variantesModificadas, igual.variantesADesactivar]).toEqual([[], [], []]);
    expect(igual.sinCambios).toBe(176);
    const modificado = { ...actual, variantes: [...actual.variantes.map((v) => (v.codigo === '1.1.3' ? { ...v, encuadreLegal: '331-X' } : v)), { ...actual.variantes[0], codigo: '9.9.9' }] };
    const d = diferencias(nom, modificado);
    expect(d.variantesModificadas).toEqual([{ codigo: '1.1.3', cambios: [{ campo: 'encuadreLegal', antes: '331-X', despues: '331-A' }] }]);
    expect(d.variantesADesactivar).toEqual(['9.9.9']);
  });
});

describe('una regla válida por variante (tabla)', () => {
  it.each(Array.from({ length: 176 }, (_, i) => i))('variante #%i', (i) => {
    const v: VarianteImportada = nom.variantes[i];
    const base = reglaBase({ codigo: v.codigo, revistas: v.revistas as Revista[], pctHaberes: v.pctHaberes });
    if (v.codigo === '1.8.1') return expect(base).toBeNull(); // incompleta en el Excel
    const r = parsearRegla(base);
    expect({ codigo: v.codigo, revista: [...r.revista].sort() }).toEqual({ codigo: v.codigo, revista: [...v.revistas].sort() });
    if (v.agrupacion <= 3 && v.autoridad) expect({ codigo: v.codigo, autoridad: r.autoridad }).toEqual({ codigo: v.codigo, autoridad: v.autoridad });
    if (v.agrupacion >= 4) expect({ codigo: v.codigo, origen: r.origen, tope: r.tope }).toEqual({ codigo: v.codigo, origen: 'NOVEDAD_RRHH', tope: null });
    // Salud simultánea en todos los cargos, salvo familiar enfermo (arts. 331 y 340).
    if (['1.1', '1.2', '1.3', '1.4'].includes(v.codigoMotivo)) expect({ codigo: v.codigo, alcance: r.alcanceCargos }).toEqual({ codigo: v.codigo, alcance: 'TODOS' });
    if (v.codigoMotivo === '1.5') expect(r.alcanceCargos).toBe('SELECCION');
  });
});

describe('criterios de aceptación del spec (fases 1 y 2)', () => {
  it('interino con 3 meses en el cargo: tope 10 días de enfermedad común; con 5 meses, 30 (art. 331 a)', () => {
    const r = regla('1.1.3');
    const desde = f('2026-05-04');
    const con = (meses: number, dias: number) =>
      evaluarRegla(r, ctx({ motivoCodigo: '1.1', revista: 'INTERINO', desde, hasta: f('2026-06-30'), diasPedidos: dias, antiguedad: { CARGO_ESTABLECIMIENTO: sumarDuracion(desde, `-${meses}m` as never) } }));
    expect(con(3, 10)).toMatchObject({ tope: 10, admisible: true });
    expect(con(3, 11)).toMatchObject({ tope: 10, admisible: false, requiereExcepcion: true, excedente: 1 });
    expect(con(5, 30)).toMatchObject({ tope: 30, admisible: true });
    expect(con(5, 31).excedente).toBe(1);
  });

  it('el tope descuenta lo ya usado en el año y propone partir el resto como prórroga del art. 347', () => {
    const r = evaluarRegla(regla('1.1.1'), ctx({ motivoCodigo: '1.1', revista: 'TITULAR', desde: f('2026-09-01'), hasta: f('2026-09-10'), diasPedidos: 10, usadosEnPeriodo: 40 }));
    expect(r).toMatchObject({ disponibles: 5, excedente: 5, propuestaParticion: { dentroDelTope: 5, excedente: 5, como: 'PRORROGA_347' } });
  });

  it('la licencia de salud exige todas las designaciones; la de familiar enfermo permite elegir', () => {
    const base = { revista: 'TITULAR' as const, desde: f('2026-06-01'), hasta: f('2026-06-03'), diasPedidos: 3, designacionesNoIncluidas: 1 };
    expect(codigos(evaluarRegla(regla('1.1.1'), ctx({ ...base, motivoCodigo: '1.1' })))).toContain('ALCANCE:BLOQUEANTE');
    expect(codigos(evaluarRegla(regla('1.5.1'), ctx({ ...base, motivoCodigo: '1.5' })))).not.toContain('ALCANCE:BLOQUEANTE');
  });

  it('duelo de primer grado para quien trabaja martes y jueves: 8 días laborables según su horario, no 8 corridos', () => {
    const r = regla('3.4.1');
    expect(r).toMatchObject({ unidad: 'LABORABLES', tope: 8 });
    const cal = { noLaborables: new Set<string>(), diasConHorario: new Set([2, 4]) };
    const desde = f('2026-06-02'); // martes
    const fin = fechaFinPorDias('LABORABLES', desde, 8, cal);
    expect(fin.toISOString().slice(0, 10)).toBe('2026-06-25'); // cuarto jueves
    expect(diasEnUnidad('LABORABLES', desde, fin, cal)).toBe(8);
    expect(diasEnUnidad('CORRIDOS', desde, fin, cal)).toBe(24);
    const ok = evaluarRegla(r, ctx({ motivoCodigo: '3.4', revista: 'TITULAR', desde, hasta: fin, diasPedidos: 8, fechaEvento: f('2026-06-01') }));
    expect(ok.admisible).toBe(true);
  });

  it('duelo de suplente: días hábiles, como fija la ley (D10)', () => {
    expect(regla('3.4.7')).toMatchObject({ unidad: 'HABILES', tope: 8 });
  });

  it('matrimonio con la fecha del casamiento fuera del período pedido: se rechaza', () => {
    const r = regla('2.8.1');
    const pedir = (evento: string) => evaluarRegla(r, ctx({ motivoCodigo: '2.8', revista: 'TITULAR', desde: f('2026-10-05'), hasta: f('2026-10-16'), diasPedidos: 10, fechaEvento: f(evento) }));
    expect(codigos(pedir('2026-10-20'))).toContain('EVENTO:BLOQUEANTE');
    expect(pedir('2026-10-10').admisible).toBe(true);
  });

  it('asuntos particulares: requiere 1 año como titular y 2 años desde el uso anterior (art. 318 a)', () => {
    const r = regla('2.3.1');
    const desde = f('2026-08-01'), hasta = f('2026-12-31');
    const pedir = (c: Partial<ContextoEvaluacion>) => evaluarRegla(r, ctx({ motivoCodigo: '2.3', revista: 'TITULAR', desde, hasta, diasPedidos: 153, ...c }));
    expect(codigos(pedir({ previas: [{ motivoCodigo: '2.3', desde: f('2024-09-01'), hasta: f('2025-02-28') }] }))).toContain('SEPARACION:EXCEPCIONABLE');
    expect(codigos(pedir({ previas: [{ motivoCodigo: '2.3', desde: f('2023-01-01'), hasta: f('2023-06-30') }] }))).not.toContain('SEPARACION:EXCEPCIONABLE');
    expect(codigos(pedir({ antiguedad: { TITULAR: f('2026-01-01') } }))).toContain('ANTIGUEDAD:EXCEPCIONABLE');
  });

  it('nadie pide otra licencia durante asuntos particulares (y al revés)', () => {
    const enCurso = [{ motivoCodigo: '2.3', desde: f('2026-03-01'), hasta: f('2026-12-31'), excluyeCon: ['*'] }];
    const r = evaluarRegla(regla('1.1.1'), ctx({ motivoCodigo: '1.1', revista: 'TITULAR', desde: f('2026-05-01'), hasta: f('2026-05-03'), diasPedidos: 3, previas: enCurso }));
    expect(codigos(r)).toContain('INCOMPATIBLE:BLOQUEANTE');
    expect(r.hallazgos.find((h) => h.codigo === 'INCOMPATIBLE')!.mensaje).not.toMatch(/2\.3|1\.1/); // no revela el motivo de la otra licencia
  });

  it('largo tratamiento: pasa del tramo del 100 % al del 50 % al cumplir 2 años acumulados', () => {
    const r = evaluarRegla(regla('1.2.1'), ctx({ motivoCodigo: '1.2', revista: 'TITULAR', desde: f('2026-04-01'), hasta: f('2026-05-30'), diasPedidos: 60, acumulado: 700 }));
    expect(r.tramos).toEqual([{ dias: 30, pct: 100 }, { dias: 30, pct: 50 }]);
    expect(repartirTramos([{ hasta: '2a', pct: 100 }, { hasta: '3a', pct: 50 }], 1090, 10)).toEqual({ aplicados: [{ dias: 5, pct: 50 }], excedente: 5 });
  });

  it('largo tratamiento de suplente: 1 año en el sistema o suplencia sin término (D1, art. 340 b)', () => {
    const r = regla('1.2.7');
    const base = { motivoCodigo: '1.2', revista: 'SUPLENTE' as const, desde: f('2026-04-01'), hasta: f('2026-04-30'), diasPedidos: 30, antiguedad: { SISTEMA: f('2025-08-01') } };
    expect(codigos(evaluarRegla(r, ctx(base)))).toContain('ANTIGUEDAD:EXCEPCIONABLE');
    expect(evaluarRegla(r, ctx({ ...base, sinTermino: true })).admisible).toBe(true);
  });

  it('interino con 3 inasistencias particulares en el mes: alerta de baja para el director (art. 336)', () => {
    const r = evaluarRegla(regla('2.13.3'), ctx({ motivoCodigo: '2.13', revista: 'INTERINO', desde: f('2026-06-18'), hasta: f('2026-06-18'), diasPedidos: 1, inasistencias: { enMes: 2, enPeriodo: 2 } }));
    expect(codigos(r)).toEqual(expect.arrayContaining(['MAX_MES:EXCEPCIONABLE', 'UMBRAL_BAJA:ADVERTENCIA']));
  });

  it('violencia de género y violencia laboral son reservadas; maternidad y adopción subsisten al cese (art. 350)', () => {
    expect(regla('2.20.1')).toMatchObject({ reservada: true, sensible: true });
    expect(regla('2.24.2')).toMatchObject({ reservada: true });
    expect(regla('1.4.5').subsisteAlCese).toBe(true);
    expect(regla('2.2.9').subsisteAlCese).toBe(true);
    expect(regla('1.1.3').subsisteAlCese).toBe(false);
  });

  it('diferencias resueltas con la opción más restrictiva', () => {
    expect(regla('1.3.7').tramosHaberes).toEqual([{ hasta: '6m', pct: 100 }, { hasta: '9m', pct: 50 }]); // D2
    expect([regla('2.2.1').tope, regla('2.2.2').tope, regla('2.2.3').tope]).toEqual([100, 90, 180]); // D3
    expect(regla('1.5.6').tope).toBe(5); // D9: ley 5 días, Excel 10
    expect(regla('1.4.2').tope).toBe(30); // D5
  });

  it('una regla mal formada no se acepta', () => {
    expect(() => parsearRegla({ revista: ['TITULAR'], unidad: 'CORRIDOS', periodoTope: 'ANIO_CALENDARIO', tope: { escalones: [{ dias: 5 }, { antigMin: '4m', dias: 10 }] }, alcanceCargos: 'TODOS', autoridad: 'DIRECTOR' })).toThrow(/último/);
    expect(() => parsearRegla({ revista: ['TITULAR'], unidad: 'DIAS', periodoTope: 'ANIO_CALENDARIO', tope: 5, alcanceCargos: 'TODOS', autoridad: 'DIRECTOR' })).toThrow(/Regla inválida/);
  });
});

describe('calendario y períodos', () => {
  it('días hábiles descuentan fines de semana, feriados y recesos', () => {
    const cal = { noLaborables: new Set(['2026-07-09']) };
    expect(diasEnUnidad('HABILES', f('2026-07-06'), f('2026-07-12'), cal)).toBe(4);
  });
  it('ventanas: año escolar, decenio desde la titularidad y año calendario', () => {
    expect(ventanaPeriodo('ANIO_ESCOLAR', f('2026-02-10')).clave).toBe('ESC-2025');
    expect(ventanaPeriodo('ANIO_ESCOLAR', f('2026-03-10')).desde.toISOString().slice(0, 10)).toBe('2026-03-01');
    const dec = ventanaPeriodo('DECENIO', f('2026-08-01'), { inicioTitular: f('2010-04-01') });
    expect([dec.desde.toISOString().slice(0, 10), dec.hasta.toISOString().slice(0, 10)]).toEqual(['2020-04-01', '2030-03-31']);
    expect(ventanaPeriodo('ANIO_CALENDARIO', f('2026-08-01')).clave).toBe('2026');
  });
  it('sumar meses respeta el fin de mes', () => {
    expect(sumarDuracion(f('2026-01-31'), '1m').toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});
