import { parseFecha as f } from '../../common/fechas';
import { computarDias, detectarSuperposiciones, documentosFaltantes, evaluarReglas, puedeTransicionar, validarPeriodo } from './reglas-negocio';

describe('Reglas de negocio de licencias', () => {
  describe('validarPeriodo', () => {
    it('rechaza fecha final anterior a la inicial', () => {
      expect(validarPeriodo(f('2026-03-10'), f('2026-03-09'))).toHaveLength(1);
    });
    it('acepta licencia de un solo día', () => {
      expect(validarPeriodo(f('2026-03-10'), f('2026-03-10'))).toEqual([]);
    });
  });

  describe('computarDias', () => {
    it('cuenta días corridos incluyendo ambos extremos', () => {
      expect(computarDias('DIAS_CORRIDOS', f('2026-03-01'), f('2026-03-10'))).toBe(10);
    });
    it('cuenta días hábiles excluyendo fines de semana y feriados', () => {
      // lunes 2 a domingo 8 de marzo de 2026 → 5 hábiles; con un feriado el miércoles → 4
      expect(computarDias('DIAS_HABILES', f('2026-03-02'), f('2026-03-08'))).toBe(5);
      expect(computarDias('DIAS_HABILES', f('2026-03-02'), f('2026-03-08'), [f('2026-03-04')])).toBe(4);
    });
  });

  describe('detectarSuperposiciones', () => {
    const existente = { numero: 'LIC-2026-000001', fechaDesde: f('2026-04-01'), fechaHasta: f('2026-04-10'), designacionIds: ['A'] };
    it('detecta cruce de fechas en un cargo compartido', () => {
      expect(detectarSuperposiciones(f('2026-04-10'), f('2026-04-15'), ['A', 'B'], [existente])).toHaveLength(1);
    });
    it('permite licencias simultáneas en cargos distintos', () => {
      expect(detectarSuperposiciones(f('2026-04-05'), f('2026-04-15'), ['B'], [existente])).toEqual([]);
    });
    it('permite períodos contiguos', () => {
      expect(detectarSuperposiciones(f('2026-04-11'), f('2026-04-15'), ['A'], [existente])).toEqual([]);
    });
  });

  it('documentosFaltantes compara sin distinguir mayúsculas', () => {
    expect(documentosFaltantes(['Certificado médico', 'Partida'], ['certificado MÉDICO'.toLowerCase()])).toEqual(['Partida']);
  });

  describe('evaluarReglas', () => {
    const base = { dias: 5, diasUsadosEnAnio: 0, solicitudesEnAnio: 0, antiguedadMeses: 24, anticipacionDias: 10 };
    it('controla máximo por solicitud', () => {
      expect(evaluarReglas([{ tipo: 'MAX_DIAS_POR_SOLICITUD', valor: 3 }], base)).toHaveLength(1);
    });
    it('controla cupo anual acumulado', () => {
      expect(evaluarReglas([{ tipo: 'MAX_DIAS_POR_ANIO', valor: 10 }], { ...base, diasUsadosEnAnio: 6 })).toHaveLength(1);
      expect(evaluarReglas([{ tipo: 'MAX_DIAS_POR_ANIO', valor: 10 }], { ...base, diasUsadosEnAnio: 5 })).toEqual([]);
    });
    it('controla antigüedad y anticipación', () => {
      const r = evaluarReglas(
        [{ tipo: 'MIN_ANTIGUEDAD_MESES', valor: 36 }, { tipo: 'ANTICIPACION_MIN_DIAS', valor: 15 }],
        base,
      );
      expect(r).toHaveLength(2);
    });
  });

  describe('máquina de estados', () => {
    it('permite el circuito normal', () => {
      expect(puedeTransicionar('BORRADOR', 'PENDIENTE')).toBe(true);
      expect(puedeTransicionar('PENDIENTE', 'EN_REVISION')).toBe(true);
      expect(puedeTransicionar('EN_REVISION', 'AUTORIZADA')).toBe(true);
      expect(puedeTransicionar('AUTORIZADA', 'FINALIZADA')).toBe(true);
    });
    it('impide saltear la revisión o reabrir estados finales', () => {
      expect(puedeTransicionar('PENDIENTE', 'AUTORIZADA')).toBe(false);
      expect(puedeTransicionar('RECHAZADA', 'PENDIENTE')).toBe(false);
      expect(puedeTransicionar('FINALIZADA', 'ANULADA')).toBe(false);
    });
  });
});
