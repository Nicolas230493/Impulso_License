import { ZipInseguroError } from '../../common/zip-seguro';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../../common/actor';
import { hoy, parseFecha, sumarDias } from '../../common/fechas';
import { ArchivoSubido } from '../archivos/archivos.service';
import { aplicarNomenclador, cargarActual, diferencias, parsearNomenclador } from './importador';
import { parsearRegla } from './regla.schema';

/** Lo que el formulario necesita saber de la regla (qué pedir y qué mostrar), sin exponer la definición completa. */
export function resumenRegla(definicion: unknown) {
  try {
    const r = parsearRegla(definicion);
    return {
      unidad: r.unidad, periodoTope: r.periodoTope, tope: r.tope, topeTexto: r.topeTexto ?? null, alcanceCargos: r.alcanceCargos,
      fechaEvento: r.fechaEvento && r.fechaEvento.origen === 'SOLICITUD' ? { etiqueta: r.fechaEvento.etiqueta, requerida: r.fechaEvento.requerida, dentroDelPeriodo: r.fechaEvento.dentroDelPeriodo } : null,
      ampliaciones: r.ampliaciones, documentacion: r.documentacion.filter((d) => d.obligatoria).map((d) => ({ nombre: d.nombre, plazoHoras: d.plazoHoras ?? null })),
      dictamenRM: r.dictamenRM, autoridad: r.autoridad, sensible: r.sensible, reservada: r.reservada, origen: r.origen,
      informativos: r.requisitos.informativos, nota: r.nota ?? null, diferencia: r.diferencia ?? null,
    };
  } catch {
    return null;
  }
}

export const CODIGO_REGIMEN_647E = 'LEY-647E';
const FIRMA_ZIP = [0x50, 0x4b, 0x03, 0x04]; // los .xlsx son archivos ZIP

@Injectable()
export class NomencladorService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService) {}

  private async leerExcel(file?: ArchivoSubido) {
    if (!file) throw new BadRequestException('Adjunte el Excel del nomenclador');
    if (!FIRMA_ZIP.every((b, i) => file.buffer[i] === b)) throw new BadRequestException('El archivo no es un Excel (.xlsx)');
    try {
      return await parsearNomenclador(file.buffer);
    } catch (e) {
      if (e instanceof ZipInseguroError) throw new BadRequestException(`El Excel fue rechazado por seguridad: ${e.message}`);
      throw new BadRequestException('No se pudo leer el Excel');
    }
  }

  /** Régimen donde se carga el nomenclador: el indicado o el de la Ley 647-E de la institución (se crea si falta). */
  private async regimen(a: Actor, regimenId: string | undefined, crear: boolean, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (regimenId) {
      const r = await tx.regimenLicencia.findFirst({ where: { id: regimenId, institucionId: a.institucionId } });
      if (!r) throw new NotFoundException('Régimen inexistente');
      return r;
    }
    const existente = await tx.regimenLicencia.findUnique({ where: { institucionId_codigo: { institucionId: a.institucionId, codigo: CODIGO_REGIMEN_647E } } });
    if (existente || !crear) return existente;
    return tx.regimenLicencia.create({
      data: {
        institucionId: a.institucionId, codigo: CODIGO_REGIMEN_647E, nombre: 'Estatuto del Docente — Ley 647-E (Chaco)', tipoGestion: 'PUBLICA',
        normativa: 'Ley 647-E, títulos XVI a XIX (arts. 305 a 350). Nomenclador de licencias 2026.', vigenteDesde: parseFecha('2026-01-01'),
      },
    });
  }

  async vistaPrevia(a: Actor, file: ArchivoSubido | undefined, regimenId?: string) {
    const nuevo = await this.leerExcel(file);
    const r = await this.regimen(a, regimenId, false);
    const actual = r ? await cargarActual(this.prisma as unknown as Prisma.TransactionClient, r.id) : { motivos: [], variantes: [] };
    return { regimen: r ? { id: r.id, codigo: r.codigo, nombre: r.nombre } : null, totales: { motivos: nuevo.motivos.length, variantes: nuevo.variantes.length }, ...diferencias(nuevo, actual) };
  }

  async aplicar(a: Actor, file: ArchivoSubido | undefined, regimenId?: string) {
    const nuevo = await this.leerExcel(file);
    if (nuevo.errores.length) throw new BadRequestException({ message: 'El archivo tiene errores; corríjalos antes de aplicar', errores: nuevo.errores.map((e) => `${e.hoja} fila ${e.fila}: ${e.mensaje}`) });
    return this.prisma.$transaction(async (tx) => {
      const r = (await this.regimen(a, regimenId, true, tx))!;
      const antes = diferencias(nuevo, await cargarActual(tx, r.id));
      const res = await aplicarNomenclador(tx, r.id, nuevo, { usuarioId: a.usuarioId, vigenciaDesde: parseFecha('2026-01-01') });
      await this.auditoria.registrar(a, 'IMPORTAR_NOMENCLADOR', 'regimen_licencia', r.id, null, {
        ...res, nuevas: antes.variantesNuevas.length, modificadas: antes.variantesModificadas.length, desactivadas: antes.variantesADesactivar,
      }, tx);
      return { regimenId: r.id, ...res };
    }, { timeout: 60_000 });
  }

  async listar(a: Actor, regimenId?: string) {
    const r = await this.regimen(a, regimenId, false);
    if (!r) return { regimen: null, motivos: [] };
    const h = hoy();
    const motivos = await this.prisma.motivoLicencia.findMany({
      where: { regimenId: r.id },
      orderBy: [{ agrupacion: 'asc' }, { numero: 'asc' }],
      include: {
        variantes: {
          orderBy: { numero: 'asc' },
          include: { reglas: { where: { vigenciaDesde: { lte: h }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: h } }] }, orderBy: { version: 'desc' }, take: 1 } },
        },
      },
    });
    return {
      regimen: { id: r.id, codigo: r.codigo, nombre: r.nombre },
      motivos: motivos.map((m) => ({
        ...m,
        variantes: m.variantes.map(({ reglas, ...v }) => ({ ...v, reglaVigente: reglas[0] ? { id: reglas[0].id, version: reglas[0].version, vigenciaDesde: reglas[0].vigenciaDesde, resumen: resumenRegla(reglas[0].definicion) } : null })),
      })),
    };
  }

  private async variante(a: Actor, id: string) {
    const v = await this.prisma.varianteLicencia.findFirst({ where: { id, motivo: { regimen: { institucionId: a.institucionId } } }, include: { motivo: true } });
    if (!v) throw new NotFoundException('Variante inexistente');
    return v;
  }

  async reglas(a: Actor, varianteId: string) {
    const v = await this.variante(a, varianteId);
    const reglas = await this.prisma.reglaVariante.findMany({ where: { varianteId }, orderBy: { version: 'desc' } });
    return { variante: v, reglas };
  }

  /**
   * Nueva versión de la regla (ABM de reglas): valida la definición, cierra la vigencia de la anterior el día previo
   * y deja todo auditado. Las solicitudes anteriores se siguen evaluando con la versión vigente en su fecha.
   */
  async nuevaVersion(a: Actor, varianteId: string, dto: { vigenciaDesde: string; definicion: unknown; nota?: string }) {
    const v = await this.variante(a, varianteId);
    let definicion;
    try { definicion = parsearRegla(dto.definicion); } catch (e) { throw new BadRequestException((e as Error).message); }
    const desde = parseFecha(dto.vigenciaDesde);
    return this.prisma.$transaction(async (tx) => {
      const ultima = await tx.reglaVariante.findFirst({ where: { varianteId }, orderBy: { version: 'desc' } });
      if (ultima && desde <= ultima.vigenciaDesde) throw new ConflictException('La nueva versión debe empezar después de la vigencia de la anterior');
      if (ultima && (!ultima.vigenciaHasta || ultima.vigenciaHasta >= desde)) await tx.reglaVariante.update({ where: { id: ultima.id }, data: { vigenciaHasta: sumarDias(desde, -1) } });
      const r = await tx.reglaVariante.create({
        data: { varianteId, version: (ultima?.version ?? 0) + 1, vigenciaDesde: desde, definicion: definicion as unknown as Prisma.InputJsonValue, nota: dto.nota, creadaPorId: a.usuarioId },
      });
      await this.auditoria.registrar(a, 'NUEVA_VERSION_REGLA', 'variante_licencia', v.id, ultima ? { version: ultima.version } : null, { version: r.version, vigenciaDesde: dto.vigenciaDesde, nota: dto.nota }, tx);
      return r;
    });
  }
}
