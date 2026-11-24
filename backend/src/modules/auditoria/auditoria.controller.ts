import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { ExponeEntidad } from '../../common/sensitive/sensitive.module';
import { PaginacionDto, paginar, resultadoPaginado } from '../../common/paginacion.dto';
import { parseFecha, sumarDias } from '../../common/fechas';

class FiltroAuditoriaDto extends PaginacionDto {
  @IsOptional() @IsString() entidad?: string;
  @IsOptional() @IsString() entidadId?: string;
  @IsOptional() @IsString() usuarioId?: string;
  @IsOptional() @IsString() desde?: string;
  @IsOptional() @IsString() hasta?: string;
}

@Controller('auditoria')
@RequierePermisos(P.AUDITORIA_VER)
@ExponeEntidad('auditoria') // segunda barrera: los registros históricos también se sanean al leer
export class AuditoriaController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async listar(@ActorActual() actor: Actor, @Query() f: FiltroAuditoriaDto) {
    const where = {
      institucionId: actor.institucionId,
      entidad: f.entidad,
      entidadId: f.entidadId,
      usuarioId: f.usuarioId,
      accion: f.buscar ? { contains: f.buscar, mode: 'insensitive' as const } : undefined,
      fecha: f.desde || f.hasta
        ? { gte: f.desde ? parseFecha(f.desde) : undefined, lt: f.hasta ? sumarDias(parseFecha(f.hasta), 1) : undefined }
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.auditoria.findMany({ where, orderBy: { fecha: 'desc' }, ...paginar(f) }),
      this.prisma.auditoria.count({ where }),
    ]);
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.usuarioId).filter(Boolean) as string[])] } },
      select: { id: true, nombre: true, apellido: true, email: true },
    });
    const porId = new Map(usuarios.map((u) => [u.id, u]));
    return resultadoPaginado(items.map((i) => ({ ...i, usuario: i.usuarioId ? porId.get(i.usuarioId) : null })), total, f);
  }
}
