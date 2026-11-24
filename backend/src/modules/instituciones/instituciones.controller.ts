import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsDateString, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { parseFecha } from '../../common/fechas';

class ActualizarInstitucionDto {
  @IsOptional() @IsString() @MaxLength(200) nombre?: string;
  @IsOptional() @IsString() cue?: string;
  @IsOptional() @IsString() cuit?: string;
  @IsOptional() @IsString() jurisdiccion?: string;
  @IsOptional() @IsString() domicilio?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEmail() email?: string;
}

class FeriadoDto {
  @IsDateString() fecha: string;
  @IsString() @MaxLength(200) descripcion: string;
}

@Controller('institucion')
export class InstitucionesController {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService) {}

  @Get()
  actual(@ActorActual() a: Actor) {
    return this.prisma.institucion.findUniqueOrThrow({ where: { id: a.institucionId } });
  }

  @Patch()
  @RequierePermisos(P.INSTITUCION_GESTIONAR)
  async actualizar(@ActorActual() a: Actor, @Body() dto: ActualizarInstitucionDto) {
    const antes = await this.prisma.institucion.findUniqueOrThrow({ where: { id: a.institucionId } });
    const despues = await this.prisma.institucion.update({ where: { id: a.institucionId }, data: dto });
    await this.auditoria.registrar(a, 'ACTUALIZAR', 'institucion', a.institucionId, antes, despues);
    return despues;
  }

  @Get('feriados')
  feriados(@ActorActual() a: Actor, @Query('anio') anio?: string) {
    const y = Number(anio) || new Date().getFullYear();
    return this.prisma.feriado.findMany({
      where: { institucionId: a.institucionId, fecha: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } },
      orderBy: { fecha: 'asc' },
    });
  }

  @Post('feriados')
  @RequierePermisos(P.INSTITUCION_GESTIONAR)
  async crearFeriado(@ActorActual() a: Actor, @Body() dto: FeriadoDto) {
    const f = await this.prisma.feriado.create({ data: { institucionId: a.institucionId, fecha: parseFecha(dto.fecha), descripcion: dto.descripcion } });
    await this.auditoria.registrar(a, 'CREAR', 'feriado', f.id, null, f);
    return f;
  }

  @Delete('feriados/:id')
  @HttpCode(204)
  @RequierePermisos(P.INSTITUCION_GESTIONAR)
  async borrarFeriado(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    const f = await this.prisma.feriado.findFirstOrThrow({ where: { id, institucionId: a.institucionId } });
    await this.prisma.feriado.delete({ where: { id } });
    await this.auditoria.registrar(a, 'ELIMINAR', 'feriado', id, f, null);
  }
}
