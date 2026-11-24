import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';
import { RegimenDto, TipoLicenciaDto } from './catalogo.dto';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';

@Controller()
export class CatalogoController {
  constructor(private svc: CatalogoService) {}

  @Get('regimenes') regimenes(@ActorActual() a: Actor) { return this.svc.listarRegimenes(a); }
  @Post('regimenes') @RequierePermisos(P.CATALOGO_GESTIONAR)
  crearRegimen(@ActorActual() a: Actor, @Body() dto: RegimenDto) { return this.svc.guardarRegimen(a, dto); }
  @Put('regimenes/:id') @RequierePermisos(P.CATALOGO_GESTIONAR)
  editarRegimen(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegimenDto) { return this.svc.guardarRegimen(a, dto, id); }

  @Get('tipos-licencia')
  tipos(@ActorActual() a: Actor, @Query('regimenId') regimenId?: string, @Query('vigentes') vigentes?: string) {
    return this.svc.listarTipos(a, { regimenId, vigentes: vigentes === 'true' });
  }
  @Get('tipos-licencia/:id') tipo(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.svc.obtenerTipo(a, id); }
  @Post('tipos-licencia') @RequierePermisos(P.CATALOGO_GESTIONAR)
  crearTipo(@ActorActual() a: Actor, @Body() dto: TipoLicenciaDto) { return this.svc.guardarTipo(a, dto); }
  @Put('tipos-licencia/:id') @RequierePermisos(P.CATALOGO_GESTIONAR)
  editarTipo(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TipoLicenciaDto) { return this.svc.guardarTipo(a, dto, id); }
}
