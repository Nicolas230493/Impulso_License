import { diasCorridos, mesesEntre, parseFecha as f } from './fechas';
import { cuilValido } from './validadores';

describe('fechas', () => {
  it('diasCorridos atraviesa cambios de mes y año', () => {
    expect(diasCorridos(f('2026-12-30'), f('2027-01-02'))).toBe(4);
  });
  it('mesesEntre respeta el día del mes', () => {
    expect(mesesEntre(f('2024-03-15'), f('2026-03-14'))).toBe(23);
    expect(mesesEntre(f('2024-03-15'), f('2026-03-15'))).toBe(24);
  });
});

describe('cuilValido', () => {
  it('acepta CUIL válidos con o sin guiones', () => {
    expect(cuilValido('20-12345678-6')).toBe(true);
    expect(cuilValido('20123456786')).toBe(true);
  });
  it('rechaza dígito verificador incorrecto', () => {
    expect(cuilValido('20-12345678-5')).toBe(false);
  });
});
