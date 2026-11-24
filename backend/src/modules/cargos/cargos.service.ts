import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CircuitoService } from '../licencias/circuito.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../../common/actor';
import { parseFecha } from '../../common/fechas';
import { CargoDto, CursoDto, DesignacionDto, EspacioDto, HorarioDto } from './cargos.dto';

@Injectable()
export class CargosService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService, private circuito: CircuitoService) {}

  // ── Catálogos simples ──
  listarCargos(a: Actor) {
    return this.prisma.cargo.findMany({ where: { institucionId: a.institucionId }, orderBy: { nombre: 'asc' } });
  }
  async guardarCargo(a: Actor, dto: CargoDto, id?: string) {
    if (id) await this.prisma.cargo.findFirstOrThrow({ where: { id, institucionId: a.institucionId } });
    const r = id
      ? await this.prisma.cargo.update({ where: { id }, data: dto })
      : await this.prisma.cargo.create({ data: { ...dto, institucionId: a.institucionId } });
    await this.auditoria.registrar(a, id ? 'ACTUALIZAR' : 'CREAR', 'cargo', r.id, null, r);
    return r;
  }

  listarCursos(a: Actor, ciclo?: number) {
    return this.prisma.curso.findMany({
      where: { institucionId: a.institucionId, cicloLectivo: ciclo },
      orderBy: [{ cicloLectivo: 'desc' }, { anio: 'asc' }, { division: 'asc' }],
    });
  }
  async guardarCurso(a: Actor, dto: CursoDto, id?: string) {
    if (id) await this.prisma.curso.findFirstOrThrow({ where: { id, institucionId: a.institucionId } });
    const data = { ...dto, nombre: `${dto.anio}° ${dto.division.toUpperCase()}`, division: dto.division.toUpperCase() };
    const r = id ? await this.prisma.curso.update({ where: { id }, data }) : await this.prisma.curso.create({ data: { ...data, institucionId: a.institucionId } });
    await this.auditoria.registrar(a, id ? 'ACTUALIZAR' : 'CREAR', 'curso', r.id, null, r);
    return r;
  }

  listarEspacios(a: Actor) {
    return this.prisma.espacioCurricular.findMany({ where: { institucionId: a.institucionId }, orderBy: { nombre: 'asc' } });
  }
  async guardarEspacio(a: Actor, dto: EspacioDto, id?: string) {
    if (id) await this.prisma.espacioCurricular.findFirstOrThrow({ where: { id, institucionId: a.institucionId } });
    const r = id
      ? await this.prisma.espacioCurricular.update({ where: { id }, data: dto })
      : await this.prisma.espacioCurricular.create({ data: { ...dto, institucionId: a.institucionId } });
    await this.auditoria.registrar(a, id ? 'ACTUALIZAR' : 'CREAR', 'espacio_curricular', r.id, null, r);
    return r;
  }

  // ── Designaciones ──
  private validarHorarios(horarios: HorarioDto[] = []) {
    for (const h of horarios) if (h.horaHasta <= h.horaDesde) throw new BadRequestException(`Horario inválido: ${h.horaDesde}–${h.horaHasta}`);
    for (let i = 0; i < horarios.length; i++)
      for (let j = i + 1; j < horarios.length; j++) {
        const x = horarios[i], y = horarios[j];
        if (x.diaSemana === y.diaSemana && x.horaDesde < y.horaHasta && y.horaDesde < x.horaHasta)
          throw new BadRequestException('Hay franjas horarias superpuestas en la designación');
      }
  }

  private async validarReferencias(a: Actor, dto: DesignacionDto) {
    const [docente, cargo, curso, espacio] = await Promise.all([
      this.prisma.docente.findFirst({ where: { id: dto.docenteId, institucionId: a.institucionId } }),
      this.prisma.cargo.findFirst({ where: { id: dto.cargoId, institucionId: a.institucionId } }),
      dto.cursoId ? this.prisma.curso.findFirst({ where: { id: dto.cursoId, institucionId: a.institucionId } }) : true,
      dto.espacioCurricularId ? this.prisma.espacioCurricular.findFirst({ where: { id: dto.espacioCurricularId, institucionId: a.institucionId } }) : true,
    ]);
    if (!docente) throw new BadRequestException('Docente inexistente');
    if (!cargo) throw new BadRequestException('Cargo inexistente');
    if (!curso) throw new BadRequestException('Curso inexistente');
    if (!espacio) throw new BadRequestException('Espacio curricular inexistente');
    if (cargo.tipo === 'HORAS_CATEDRA' && !dto.horasCatedra) throw new BadRequestException('Indique la cantidad de horas cátedra');
    if (dto.fechaHasta && dto.fechaHasta < dto.fechaDesde) throw new BadRequestException('La fecha de cese no puede ser anterior a la de alta');
    this.validarHorarios(dto.horarios);
  }

  listarDesignaciones(a: Actor, docenteId?: string, soloActivas?: boolean) {
    return this.prisma.designacion.findMany({
      where: { docente: { institucionId: a.institucionId }, docenteId, activa: soloActivas ? true : undefined },
      include: { cargo: true, curso: true, espacio: true, horarios: true, docente: { select: { id: true, apellido: true, nombre: true, legajo: true } } },
      orderBy: { fechaDesde: 'desc' },
    });
  }

  async crearDesignacion(a: Actor, dto: DesignacionDto) {
    await this.validarReferencias(a, dto);
    const { horarios, fechaDesde, fechaHasta, ...resto } = dto;
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.designacion.create({
        data: {
          ...resto,
          fechaDesde: parseFecha(fechaDesde),
          fechaHasta: fechaHasta ? parseFecha(fechaHasta) : null,
          horarios: horarios?.length ? { create: horarios } : undefined,
        },
        include: { horarios: true, cargo: true },
      });
      await this.auditoria.registrar(a, 'CREAR', 'designacion', d.id, null, d, tx);
      return d;
    });
  }

  async actualizarDesignacion(a: Actor, id: string, dto: DesignacionDto) {
    const antes = await this.prisma.designacion.findFirst({ where: { id, docente: { institucionId: a.institucionId } }, include: { horarios: true } });
    if (!antes) throw new NotFoundException('Designación no encontrada');
    if (dto.docenteId !== antes.docenteId) throw new BadRequestException('No se puede cambiar el docente de una designación');
    await this.validarReferencias(a, dto);
    const { horarios, fechaDesde, fechaHasta, docenteId: _d, ...resto } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (horarios) {
        // Los horarios referenciados por coberturas de reemplazo no se pueden borrar.
        const enUso = await tx.cobertura.count({ where: { horario: { designacionId: id } } });
        if (enUso) throw new BadRequestException('La designación tiene horarios cubiertos por reemplazos; no pueden reemplazarse.');
        await tx.horario.deleteMany({ where: { designacionId: id } });
        await tx.horario.createMany({ data: horarios.map((h) => ({ ...h, designacionId: id })) });
      }
      const d = await tx.designacion.update({
        where: { id },
        data: { ...resto, fechaDesde: parseFecha(fechaDesde), fechaHasta: fechaHasta ? parseFecha(fechaHasta) : null },
        include: { horarios: true },
      });
      await this.auditoria.registrar(a, 'ACTUALIZAR', 'designacion', id, antes, d, tx);
      return d;
    });
  }

  async darDeBaja(a: Actor, id: string, fechaHasta: string, motivoCese?: string) {
    const antes = await this.prisma.designacion.findFirst({ where: { id, docente: { institucionId: a.institucionId } } });
    if (!antes) throw new NotFoundException('Designación no encontrada');
    const fh = parseFecha(fechaHasta);
    if (fh < antes.fechaDesde) throw new BadRequestException('La fecha de cese no puede ser anterior a la de alta');
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.designacion.update({ where: { id }, data: { activa: false, fechaHasta: fh, motivoCese } });
      // Art. 350: el cese de un interino, transitorio o suplente cancela sus licencias (salvo maternidad y adopción).
      const licencias = await this.circuito.cancelarPorCese(tx, a, id, fh, motivoCese);
      await this.auditoria.registrar(a, 'BAJA', 'designacion', id, antes, { ...d, licenciasAfectadas: licencias }, tx);
      return { ...d, licenciasAfectadas: licencias };
    });
  }
}
