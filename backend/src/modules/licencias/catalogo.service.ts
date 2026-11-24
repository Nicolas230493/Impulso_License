import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../../common/actor';
import { hoy, parseFecha } from '../../common/fechas';
import { sensibilidadPorDefecto } from '../../common/sensitive/sensitive-data.policy';
import { RegimenDto, TipoLicenciaDto } from './catalogo.dto';

@Injectable()
export class CatalogoService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService) {}

  listarRegimenes(a: Actor) {
    return this.prisma.regimenLicencia.findMany({
      where: { institucionId: a.institucionId },
      include: { _count: { select: { tipos: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async guardarRegimen(a: Actor, dto: RegimenDto, id?: string) {
    let antes = null;
    if (id) antes = await this.prisma.regimenLicencia.findFirstOrThrow({ where: { id, institucionId: a.institucionId } });
    if (dto.vigenteHasta && dto.vigenteHasta < dto.vigenteDesde) throw new BadRequestException('Vigencia inválida');
    const data = { ...dto, vigenteDesde: parseFecha(dto.vigenteDesde), vigenteHasta: dto.vigenteHasta ? parseFecha(dto.vigenteHasta) : null };
    const r = id
      ? await this.prisma.regimenLicencia.update({ where: { id }, data })
      : await this.prisma.regimenLicencia.create({ data: { ...data, institucionId: a.institucionId } });
    await this.auditoria.registrar(a, id ? 'ACTUALIZAR' : 'CREAR', 'regimen_licencia', r.id, antes, r);
    return r;
  }

  /** Tipos de licencia. Con `vigentes` devuelve solo los utilizables hoy (para el formulario de solicitud). */
  listarTipos(a: Actor, opts: { regimenId?: string; vigentes?: boolean }) {
    const h = hoy();
    const vig = opts.vigentes
      ? { activo: true, vigenteDesde: { lte: h }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: h } }] }
      : {};
    return this.prisma.tipoLicencia.findMany({
      where: {
        regimen: { institucionId: a.institucionId, ...(opts.vigentes && { activo: true }) },
        regimenId: opts.regimenId,
        motivoId: null, // los tipos del nomenclador se eligen desde /nomenclador
        ...vig,
      },
      include: { regimen: { select: { id: true, codigo: true, nombre: true, tipoGestion: true } }, reglas: true, circuito: { select: { id: true, nombre: true } } },
      orderBy: [{ regimen: { nombre: 'asc' } }, { codigo: 'asc' }],
    });
  }

  async obtenerTipo(a: Actor, id: string) {
    const t = await this.prisma.tipoLicencia.findFirst({
      where: { id, regimen: { institucionId: a.institucionId } },
      include: { regimen: true, reglas: true, circuito: { include: { pasos: { include: { rol: true }, orderBy: { orden: 'asc' } } } } },
    });
    if (!t) throw new NotFoundException('Tipo de licencia no encontrado');
    return t;
  }

  async guardarTipo(a: Actor, dto: TipoLicenciaDto, id?: string) {
    await this.prisma.regimenLicencia.findFirstOrThrow({ where: { id: dto.regimenId, institucionId: a.institucionId } });
    if (dto.circuitoId) await this.prisma.circuitoAutorizacion.findFirstOrThrow({ where: { id: dto.circuitoId, institucionId: a.institucionId } });
    const tiposRegla = dto.reglas.map((r) => r.tipo);
    if (new Set(tiposRegla).size !== tiposRegla.length) throw new BadRequestException('Hay reglas repetidas');
    let antes = null;
    if (id) antes = await this.obtenerTipo(a, id);
    if (antes?.motivoId) throw new ConflictException('Este tipo pertenece al nomenclador: se administra desde Nomenclador, con reglas versionadas');
    const { reglas, vigenteDesde, vigenteHasta, sensible, ...resto } = dto;
    const data = {
      ...resto,
      sensible: !!sensible || sensibilidadPorDefecto(dto.categoria, dto.documentacionRequerida),
      vigenteDesde: parseFecha(vigenteDesde),
      vigenteHasta: vigenteHasta ? parseFecha(vigenteHasta) : null,
    };
    const t = await this.prisma.$transaction(async (tx) => {
      const tipo = id ? await tx.tipoLicencia.update({ where: { id }, data }) : await tx.tipoLicencia.create({ data });
      await tx.reglaLicencia.deleteMany({ where: { tipoLicenciaId: tipo.id } });
      await tx.reglaLicencia.createMany({ data: reglas.map((r) => ({ ...r, tipoLicenciaId: tipo.id })) });
      await this.auditoria.registrar(a, id ? 'ACTUALIZAR' : 'CREAR', 'tipo_licencia', tipo.id, antes, { ...tipo, reglas }, tx);
      return tipo;
    });
    return this.obtenerTipo(a, t.id);
  }
}
