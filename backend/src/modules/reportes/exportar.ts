import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Informe } from './informes';

/** Marca de la aplicación en los informes exportados (debe coincidir con frontend/src/components/Marca.tsx). */
export const NOMBRE_APP = 'Impulso License';
export const PIE_INFORMES = '© 2026 - Impulso Digital Sgo - Todos los Derechos Reservados';

/** Nombre de hoja válido para Excel: sin * ? : \ / [ ], sin apóstrofo en los extremos y hasta 31 caracteres. */
export function nombreHoja(titulo: string): string {
  const limpio = titulo.replace(/[*?:\\/[\]]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 31).trim();
  return limpio || 'Informe';
}

export async function aExcel(inf: Informe, institucion: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = NOMBRE_APP;
  wb.company = 'Impulso Digital Sgo';
  const ws = wb.addWorksheet(nombreHoja(inf.titulo));
  ws.addRow([institucion]).font = { bold: true, size: 13 };
  ws.addRow([inf.titulo]).font = { bold: true, size: 12 };
  ws.addRow([`${Object.entries(inf.parametros).map(([k, v]) => `${k}: ${v}`).join('   ')}   ·   Emitido con ${NOMBRE_APP}: ${new Date().toLocaleString('es-AR')}`]);
  ws.addRow([]);
  const cab = ws.addRow(inf.columnas.map((c) => c.titulo));
  cab.font = { bold: true };
  cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
  inf.filas.forEach((f) => ws.addRow(inf.columnas.map((c) => f[c.clave] ?? '')));
  inf.columnas.forEach((c, i) => { ws.getColumn(i + 1).width = c.ancho ?? 16; });
  ws.addRow([]);
  ws.addRow([PIE_INFORMES]).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  ws.headerFooter.oddFooter = `&L${NOMBRE_APP}&R${PIE_INFORMES.replace(/&/g, '&&')}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function aPdf(inf: Informe, institucion: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margin: 36, bufferPages: true,
      info: { Title: inf.titulo, Author: institucion, Creator: NOMBRE_APP, Producer: NOMBRE_APP },
    });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const ancho = doc.page.width - 72;
    const total = inf.columnas.reduce((s, c) => s + (c.ancho ?? 16), 0);
    const anchos = inf.columnas.map((c) => ((c.ancho ?? 16) / total) * ancho);

    doc.fontSize(14).font('Helvetica-Bold').text(institucion);
    doc.fontSize(12).text(inf.titulo);
    doc.fontSize(9).font('Helvetica').fillColor('#555')
      .text(`${Object.entries(inf.parametros).map(([k, v]) => `${k}: ${v}`).join('   ')}   ·   Emitido con ${NOMBRE_APP}: ${new Date().toLocaleString('es-AR')}`);
    doc.fillColor('#000').moveDown();

    const fila = (valores: string[], negrita = false) => {
      const alto = Math.max(...valores.map((v, i) => doc.heightOfString(v, { width: anchos[i] - 4 }))) + 6;
      if (doc.y + alto > doc.page.height - 36) doc.addPage();
      const y = doc.y;
      if (negrita) doc.rect(36, y, ancho, alto).fill('#E5E7EB').fillColor('#000');
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = 36;
      valores.forEach((v, i) => { doc.text(v, x + 2, y + 3, { width: anchos[i] - 4 }); x += anchos[i]; });
      doc.moveTo(36, y + alto).lineTo(36 + ancho, y + alto).strokeColor('#D1D5DB').stroke();
      doc.y = y + alto;
    };
    fila(inf.columnas.map((c) => c.titulo), true);
    inf.filas.forEach((f) => fila(inf.columnas.map((c) => String(f[c.clave] ?? ''))));
    if (!inf.filas.length) doc.moveDown().font('Helvetica-Oblique').text('Sin datos para los parámetros indicados.', 36);

    // Pie en cada página: nombre de la aplicación, copyright y numeración.
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      const margenInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // escribir dentro del margen sin agregar páginas
      const y = doc.page.height - 26;
      doc.font('Helvetica').fontSize(7).fillColor('#6B7280');
      doc.text(`${NOMBRE_APP}   ·   ${PIE_INFORMES}`, 36, y, { width: ancho, align: 'left', lineBreak: false });
      doc.text(`Página ${i - start + 1} de ${count}`, 36, y, { width: ancho, align: 'right', lineBreak: false });
      doc.page.margins.bottom = margenInferior;
    }
    doc.end();
  });
}
