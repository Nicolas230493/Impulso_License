import { validarEstructura } from './validacion-archivos';

const pdf = (cuerpo = '1 0 obj<<>>endobj', fin = '%%EOF') => Buffer.from(`%PDF-1.4\n${cuerpo}\ntrailer<<>>\n${fin}`, 'latin1');

describe('validación estructural de archivos (hallazgo 24)', () => {
  it('acepta un PDF simple', () => {
    expect(validarEstructura('application/pdf', pdf())).toBeNull();
  });
  it('rechaza un PDF sin marcador de fin', () => {
    expect(validarEstructura('application/pdf', pdf(undefined, ''))).toMatch(/incompleto/);
  });
  it('rechaza solo la firma %PDF sin estructura', () => {
    expect(validarEstructura('application/pdf', Buffer.from('%PDF-<script>alert(1)</script>%%EOF'))).not.toBeNull();
  });
  it.each(['/JavaScript', '/JS (x)', '/Launch', '/OpenAction', '/EmbeddedFile', '/J#61vaScript'])('rechaza contenido activo %s', (marca) => {
    expect(validarEstructura('application/pdf', pdf(`1 0 obj<<${marca}>>endobj`))).toMatch(/contenido activo/);
  });
  it('PNG y JPEG: firma completa y fin de imagen', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.alloc(17), Buffer.from('IEND'), Buffer.alloc(4)]);
    expect(validarEstructura('image/png', png)).toBeNull();
    expect(validarEstructura('image/png', png.subarray(0, 30))).not.toBeNull();
    expect(validarEstructura('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]))).toBeNull();
    expect(validarEstructura('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).not.toBeNull();
  });
});
