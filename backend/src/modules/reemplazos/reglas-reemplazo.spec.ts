import { parseFecha as f } from '../../common/fechas';
import { validarCoberturas } from './reglas-reemplazo';

describe('validarCoberturas', () => {
  const H = ['lun', 'mie'];
  const periodo = [f('2026-05-01'), f('2026-05-31')] as const;

  it('admite cobertura parcial por dos suplentes en franjas distintas', () => {
    const r = validarCoberturas('T', ...periodo, [
      { suplenteId: 'S1', desde: f('2026-05-01'), hasta: f('2026-05-31'), horarioIds: ['lun'] },
      { suplenteId: 'S2', desde: f('2026-05-01'), hasta: f('2026-05-31'), horarioIds: ['mie'] },
    ], H);
    expect(r).toEqual([]);
  });

  it('admite suplentes sucesivos sobre la misma franja', () => {
    const r = validarCoberturas('T', ...periodo, [
      { suplenteId: 'S1', desde: f('2026-05-01'), hasta: f('2026-05-15'), horarioIds: [] },
      { suplenteId: 'S2', desde: f('2026-05-16'), hasta: f('2026-05-31'), horarioIds: [] },
    ], H);
    expect(r).toEqual([]);
  });

  it('rechaza doble cobertura de la misma franja', () => {
    const r = validarCoberturas('T', ...periodo, [
      { suplenteId: 'S1', desde: f('2026-05-01'), hasta: f('2026-05-20'), horarioIds: ['lun'] },
      { suplenteId: 'S2', desde: f('2026-05-10'), hasta: f('2026-05-31'), horarioIds: [] },
    ], H);
    expect(r).toHaveLength(1);
  });

  it('rechaza tramos fuera del período y al titular como suplente', () => {
    const r = validarCoberturas('T', ...periodo, [{ suplenteId: 'T', desde: f('2026-04-30'), hasta: f('2026-05-10'), horarioIds: [] }], H);
    expect(r).toHaveLength(2);
  });
});
