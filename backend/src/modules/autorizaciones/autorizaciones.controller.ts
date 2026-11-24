import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AutorizacionesService } from './autorizaciones.service';
import { CircuitoDto, DecisionDto } from './autorizaciones.dto';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { ExponeEntidad } from '../../common/sensitive/sensitive.module';
import { VersionDto } from '../licencias/solicitudes.dto';

@Controller()
@ExponeEntidad('solicitud')
export class AutorizacionesController {
  constructor(private svc: AutorizacionesService) {}

  @Get('circuitos') @RequierePermisos(P.CIRCUITOS_GESTIONAR, P.CATALOGO_GESTIONAR)
  circuitos(@ActorActual() a: Actor) { return this.svc.listarCircuitos(a); }
  @Post('circuitos') @RequierePermisos(P.CIRCUITOS_GESTIONAR)
  crear(@ActorActual() a: Actor, @Body() dto: CircuitoDto) { return this.svc.guardarCircuito(a, dto); }
  @Put('circuitos/:id') @RequierePermisos(P.CIRCUITOS_GESTIONAR)
  editar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CircuitoDto) { return this.svc.guardarCircuito(a, dto, id); }

  @Get('autorizaciones/bandeja') @RequierePermisos(P.LICENCIAS_REVISAR, P.AUTORIZACIONES_DECIDIR)
  bandeja(@ActorActual() a: Actor) { return this.svc.bandeja(a); }

  @Post('solicitudes/:id/tomar') @HttpCode(200) @RequierePermisos(P.LICENCIAS_REVISAR)
  tomar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) { return this.svc.tomarEnRevision(a, id, dto.version); }

  @Post('solicitudes/:id/decision') @HttpCode(200) @RequierePermisos(P.AUTORIZACIONES_DECIDIR)
  decidir(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.svc.decidir(a, id, dto); }
}
