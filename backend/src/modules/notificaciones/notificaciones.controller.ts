import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor, ActorActual } from '../../common/actor';
import { PermiteCambioPendiente } from '../../common/decoradores';
import { PaginacionDto, paginar, resultadoPaginado } from '../../common/paginacion.dto';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async listar(@ActorActual() a: Actor, @Query() p: PaginacionDto, @Query('noLeidas') noLeidas?: string) {
    const where = { usuarioId: a.usuarioId, ...(noLeidas === 'true' && { leida: false }) };
    const [items, total, sinLeer] = await Promise.all([
      this.prisma.notificacion.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginar(p) }),
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.count({ where: { usuarioId: a.usuarioId, leida: false } }),
    ]);
    return { ...resultadoPaginado(items, total, p), sinLeer };
  }

  /** Lo consulta el encabezado de la app también en la pantalla de cambio de contraseña. */
  @PermiteCambioPendiente()
  @Get('contador')
  async contador(@ActorActual() a: Actor) {
    return { sinLeer: await this.prisma.notificacion.count({ where: { usuarioId: a.usuarioId, leida: false } }) };
  }

  @Post(':id/leida')
  @HttpCode(204)
  async marcar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.notificacion.updateMany({ where: { id, usuarioId: a.usuarioId }, data: { leida: true } });
  }

  @Post('leidas')
  @HttpCode(204)
  async marcarTodas(@ActorActual() a: Actor) {
    await this.prisma.notificacion.updateMany({ where: { usuarioId: a.usuarioId, leida: false }, data: { leida: true } });
  }
}
