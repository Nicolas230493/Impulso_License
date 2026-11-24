import ExcelJS from 'exceljs';
import { inflateSync } from 'zlib';
import { NotFoundException } from '@nestjs/common';
import { Actor } from '../../common/actor';
import { P } from '../../common/permisos';
import { aExcel, aPdf, nombreHoja } from './exportar';
import { INFORMES } from './informes';
import { ReportesService } from './reportes.service';

const actor = (permisos: string[]): Actor => ({ usuarioId: 'u', institucionId: 'i', docenteId: null, email: 'x', permisos, roles: [] });
const DIRECTIVO = actor([P.REPORTES_VER]);
const RRHH = actor([P.REPORTES_VER, P.DATOS_SENSIBLES_VER]);

const fila = (tipo: object) => ({
  numero: 'LIC-DEMO-2026-000001', docenteId: 'd1', estado: 'PENDIENTE', diasComputados: 3,
  fechaSolicitud: new Date('2026-11-01T10:00:00Z'), fechaDesde: new Date('2026-11-02'), fechaHasta: new Date('2026-11-04'),
  docente: { apellido: 'García', nombre: 'Laura', legajo: 'D-001' },
  tipoLicencia: tipo,
});
const SALUD = { codigo: 'ENF-CORTA', nombre: 'Enfermedad de corto tratamiento', categoria: 'SALUD', sensible: true };
const prisma = { solicitudLicencia: { findMany: jest.fn().mockResolvedValue([fila(SALUD)]) } } as never;

/** Texto visible de un PDF de pdfkit: descomprime los streams y decodifica las cadenas hexadecimales de los operadores Tj. */
function textoPdf(buf: Buffer) {
  const crudo = buf.toString('latin1');
  let texto = '';
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let contenido: string;
    try { contenido = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const h of contenido.matchAll(/<([0-9a-fA-F]+)>/g)) texto += Buffer.from(h[1], 'hex').toString('latin1');
    texto += '\n';
  }
  return texto;
}

describe('informes con tipos sensibles (hallazgo 3)', () => {
  for (const clave of ['licencias-por-periodo', 'solicitudes-pendientes']) {
    it(`${clave}: sin datos_sensibles.ver muestra "Licencia con reserva" en JSON, XLSX y PDF`, async () => {
      const inf = await INFORMES.get(clave)!.generar(prisma, DIRECTIVO, {});
      expect(inf.filas[0].tipo).toBe('Licencia con reserva');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await aExcel(inf, 'Inst')) as never);
      const celdas: string[] = [];
      wb.worksheets[0].eachRow((r) => r.eachCell((c) => celdas.push(String(c.value))));
      expect(celdas).toContain('Licencia con reserva');
      expect(celdas.join('|')).not.toContain('Enfermedad');

      const pdf = textoPdf(await aPdf(inf, 'Inst'));
      expect(pdf).toContain('Licencia con reserva');
      expect(pdf).not.toContain('Enfermedad');
      expect(pdf).toContain('Impulso License');
      expect(pdf).toContain('Impulso Digital Sgo - Todos los Derechos Reservados');
      expect(celdas.join('|')).toContain('Impulso Digital Sgo - Todos los Derechos Reservados');
    });

    it(`${clave}: con datos_sensibles.ver muestra el tipo real`, async () => {
      const inf = await INFORMES.get(clave)!.generar(prisma, RRHH, {});
      expect(inf.filas[0].tipo).toBe(SALUD.nombre);
    });
  }
});

describe('catálogo de informes (hallazgo 25)', () => {
  const svc = new ReportesService({} as never, { registrar: jest.fn() } as never);
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'inexistente'])('clave "%s" → 404', async (clave) => {
    await expect(svc.informe(DIRECTIVO, clave, {}, 'json')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('lista solo informes propios', () => {
    expect(svc.catalogoInformes().map((i) => i.clave)).toContain('licencias-por-periodo');
    expect(svc.catalogoInformes()).toHaveLength(12);
  });
});

describe('nombre de la hoja de Excel', () => {
  it('quita los caracteres que Excel no admite y respeta los 31 caracteres', () => {
    expect(nombreHoja('Estadística mensual 11/2026')).toBe('Estadística mensual 11-2026');
    expect(nombreHoja('a*b?c:d\\e/f[g]h')).toBe('a-b-c-d-e-f-g-h');
    expect(nombreHoja("'Registro'")).toBe('Registro');
    expect(nombreHoja('x'.repeat(40))).toHaveLength(31);
    expect(nombreHoja('///')).toBe('---');
    expect(nombreHoja('  ')).toBe('Informe');
  });

  it('exporta a XLSX un informe cuyo título tiene barras (estadística mensual)', async () => {
    const buf = await aExcel({ titulo: 'Estadística mensual 11/2026', columnas: [{ clave: 'a', titulo: 'A', ancho: 5 }], filas: [{ a: 1 }], parametros: {} } as never, 'Escuela');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    expect(wb.worksheets[0].name).toBe('Estadística mensual 11-2026');
  });
});
