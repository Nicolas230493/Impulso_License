import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AsistenciasService } from './asistencias.service';
import { NovedadDto, PlanillaAsistenciaDto } from './asistencias.dto';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';

@Controller()
export class AsistenciasController {
  constructor(private svc: AsistenciasService) {}

  @Get('asistencias') @RequierePermisos(P.ASISTENCIA_VER, P.ASISTENCIA_REGISTRAR)
  planilla(@ActorActual() a: Actor, @Query('fecha') fecha?: string) { return this.svc.planilla(a, fecha); }
  @Post('asistencias') @RequierePermisos(P.ASISTENCIA_REGISTRAR)
  registrar(@ActorActual() a: Actor, @Body() dto: PlanillaAsistenciaDto) { return this.svc.registrar(a, dto); }

  @Get('novedades') @RequierePermisos(P.ASISTENCIA_VER, P.ASISTENCIA_REGISTRAR)
  novedades(@ActorActual() a: Actor, @Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('docenteId') docenteId?: string) {
    return this.svc.listarNovedades(a, desde, hasta, docenteId);
  }
  @Post('novedades') @RequierePermisos(P.ASISTENCIA_REGISTRAR)
  crearNovedad(@ActorActual() a: Actor, @Body() dto: NovedadDto) { return this.svc.crearNovedad(a, dto); }
}
