import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ReemplazosService } from './reemplazos.service';
import { CambioEstadoReemplazoDto, CrearReemplazoDto, FiltroReemplazosDto } from './reemplazos.dto';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { ExponeEntidad } from '../../common/sensitive/sensitive.module';

@Controller('reemplazos')
@ExponeEntidad('solicitud')
export class ReemplazosController {
  constructor(private svc: ReemplazosService) {}

  @Get() @RequierePermisos(P.REEMPLAZOS_VER, P.REEMPLAZOS_GESTIONAR)
  listar(@ActorActual() a: Actor, @Query() f: FiltroReemplazosDto) { return this.svc.listar(a, f); }
  @Get(':id') @RequierePermisos(P.REEMPLAZOS_VER, P.REEMPLAZOS_GESTIONAR)
  obtener(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.svc.obtener(a, id); }
  @Post() @RequierePermisos(P.REEMPLAZOS_GESTIONAR)
  crear(@ActorActual() a: Actor, @Body() dto: CrearReemplazoDto) { return this.svc.crear(a, dto); }
  @Post(':id/estado') @HttpCode(200) @RequierePermisos(P.REEMPLAZOS_GESTIONAR)
  estado(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CambioEstadoReemplazoDto) { return this.svc.cambiarEstado(a, id, dto); }
}
