import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { formatoISO, hoy } from '../../common/fechas';
import { accesoCompleto } from '../../common/sensitive/sensitive-data.policy';
import { NOMBRE_APP, PIE_INFORMES } from '../reportes/exportar';

type Tx = Prisma.TransactionClient;

/** Número de disposición: correlativo por institución y año (pregunta abierta del spec: se asumió anual). */
export const formatoDisposicion = (n: number, anio: number) => `${n}/${anio}`;

const fechaLarga = (f: Date) => f.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const REVISTA: Record<string, string> = { TITULAR: 'titular', INTERINO: 'interino/a', TRANSITORIO: 'transitorio/a', SUPLENTE: 'suplente', PROVISIONAL: 'provisional' };

/**
 * Disposiciones de la escuela (fase 4). Se numeran al autorizar las licencias que otorga el Director y el PDF se
 * genera a pedido desde los datos registrados, así siempre coincide con la base.
 */
@Injectable()
export class DisposicionesService {
  constructor(private prisma: PrismaService) {}

  async siguienteNumero(tx: Tx, institucionId: string, anio: number) {
    const [fila] = await tx.$queryRaw<{ ultimo: number }[]>`
      INSERT INTO "secuencias_documentos" ("institucion_id", "tipo", "anio", "ultimo") VALUES (${institucionId}, 'DISPOSICION', ${anio}, 1)
      ON CONFLICT ("institucion_id", "tipo", "anio") DO UPDATE SET "ultimo" = "secuencias_documentos"."ultimo" + 1
      RETURNING "ultimo"`;
    return formatoDisposicion(Number(fila.ultimo), anio);
  }

  /** Emite la disposición de una solicitud autorizada por la escuela. */
  async emitir(tx: Tx, a: Actor, solicitudId: string) {
    const fecha = hoy();
    return tx.instrumentoLegal.create({
      data: {
        institucionId: a.institucionId, solicitudId, tipo: 'DISPOSICION', numero: await this.siguienteNumero(tx, a.institucionId, fecha.getUTCFullYear()),
        fecha, emisor: 'Dirección', favorable: true, registradoPorId: a.usuarioId,
      },
    });
  }

  /** PDF de la disposición. Si el tipo es sensible o reservado, solo lo ven el titular y quien tiene datos_sensibles.ver. */
  async pdf(a: Actor, solicitudId: string): Promise<{ nombre: string; buffer: Buffer }> {
    const s = await this.prisma.solicitudLicencia.findFirst({
      where: { id: solicitudId, institucionId: a.institucionId },
      include: {
        institucion: true,
        docente: true,
        tipoLicencia: { select: { nombre: true, sensible: true } },
        motivoNomenclador: true,
        designaciones: { include: { designacion: { include: { cargo: true, curso: true, espacio: true } }, variante: true } },
        instrumentos: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!s) throw new NotFoundException('Solicitud no encontrada');
    const puedeVer = (a.docenteId && s.docenteId === a.docenteId) || [P.LICENCIAS_VER_TODAS, P.LICENCIAS_REVISAR].some((p) => tienePermiso(a, p));
    if (!puedeVer) throw new ForbiddenException();
    if ((s.tipoLicencia.sensible || s.reservada) && !accesoCompleto(a, s.docenteId)) throw new ForbiddenException('La disposición contiene datos sensibles');
    const disp = s.instrumentos.find((i) => i.tipo === 'DISPOSICION');
    if (!disp) throw new NotFoundException('La solicitud no tiene disposición');

    const tramos = Array.isArray(s.tramosHaberes) ? (s.tramosHaberes as { dias: number; pct: number }[]) : [];
    const pago = tramos.length
      ? tramos.map((t) => `${t.dias} días con el ${t.pct} % de haberes`).join(' y ')
      : s.pctHaberes === null ? 'según corresponda' : s.pctHaberes === 0 ? 'sin goce de haberes' : s.pctHaberes === 100 ? 'con goce íntegro de haberes' : `con el ${s.pctHaberes} % de haberes`;
    const dictamen = s.instrumentos.find((i) => i.tipo === 'DICTAMEN' && i.favorable !== false);

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `Disposición ${disp.numero}`, Creator: NOMBRE_APP, Producer: NOMBRE_APP } });
      const partes: Buffer[] = [];
      doc.on('data', (b: Buffer) => partes.push(b));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);
      doc.font('Helvetica-Bold').fontSize(13).text(s.institucion.nombre, { align: 'center' });
      doc.moveDown(0.5).fontSize(12).text(`DISPOSICIÓN N.º ${disp.numero}`, { align: 'center' });
      doc.font('Helvetica').fontSize(10).text(`${s.institucion.domicilio ?? ''}${s.institucion.domicilio ? ', ' : ''}${fechaLarga(disp.fecha)}`, { align: 'center' });
      doc.moveDown(1.5).fontSize(11);
      doc.font('Helvetica-Bold').text('VISTO: ', { continued: true }).font('Helvetica')
        .text(`la solicitud ${s.numero} presentada por ${s.docente.apellido}, ${s.docente.nombre} (DNI ${s.docente.dni}, legajo ${s.docente.legajo}); y`);
      doc.moveDown(0.5).font('Helvetica-Bold').text('CONSIDERANDO: ', { continued: true }).font('Helvetica')
        .text(`que la licencia encuadra en ${s.designaciones.map((d) => `el art. ${d.variante?.encuadreLegal ?? '—'} de la Ley 647-E`).filter((x, i, l) => l.indexOf(x) === i).join(' y ')}` +
          `${dictamen ? `, con dictamen de Reconocimientos Médicos N.º ${dictamen.numero} del ${fechaLarga(dictamen.fecha)}` : ''}` +
          `${s.excepcionInstrumento ? `, y con la excepción dispuesta por ${s.excepcionInstrumento}` : ''};`);
      doc.moveDown(0.5).text('Por ello,');
      doc.moveDown(0.5).font('Helvetica-Bold').text('LA DIRECCIÓN DISPONE:', { align: 'center' });
      doc.moveDown(0.5).font('Helvetica-Bold').text('Artículo 1.º: ', { continued: true }).font('Helvetica')
        .text(`Conceder a ${s.docente.apellido}, ${s.docente.nombre} licencia por ${s.motivoNomenclador ? `${s.motivoNomenclador.codigo} – ${s.motivoNomenclador.nombre.toLowerCase()}` : s.tipoLicencia.nombre} ` +
          `desde el ${fechaLarga(s.fechaDesde)} hasta el ${fechaLarga(s.fechaHasta)} (${s.diasComputados} días), ${pago}, en las siguientes designaciones:`);
      for (const d of s.designaciones) {
        const g = d.designacion;
        doc.text(`• ${g.cargo.nombre}${g.espacio ? ` – ${g.espacio.nombre}` : ''}${g.curso ? ` – ${g.curso.nombre}` : ''}, ${REVISTA[d.revista ?? g.situacionRevista] ?? ''}` +
          `${d.variante ? ` (código ${d.variante.codigo}, encuadre ${d.variante.encuadreLegal ?? '—'})` : ''}.`, { indent: 18 });
      }
      doc.moveDown(0.5).font('Helvetica-Bold').text('Artículo 2.º: ', { continued: true }).font('Helvetica').text('Notificar al interesado, registrar y archivar.');
      doc.moveDown(4).text('_______________________________', { align: 'right' }).text('Firma y sello de la Dirección', { align: 'right' });
      doc.page.margins.bottom = 0; // el pie va dentro del margen, sin agregar páginas
      doc.fontSize(7).fillColor('#6B7280').text(`${NOMBRE_APP} · ${PIE_INFORMES} · Generado el ${formatoISO(hoy())}`, 56, doc.page.height - 40, { width: doc.page.width - 112, align: 'center', lineBreak: false });
      doc.end();
    });
    return { nombre: `disposicion-${disp.numero.replace('/', '-')}.pdf`, buffer };
  }
}
