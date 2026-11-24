import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CargosService } from './cargos.service';
import { BajaDesignacionDto, LicenciaAutomaticaDto, CargoDto, CursoDto, DesignacionDto, EspacioDto } from './cargos.dto';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { CircuitoService } from '../licencias/circuito.service';
import { ExponeEntidad } from '../../common/sensitive/sensitive.module';
import { P } from '../../common/permisos';

@Controller()
@ExponeEntidad('solicitud')
export class CargosController {
  constructor(private svc: CargosService, private circuito: CircuitoService) {}

  @Get('cargos') cargos(@ActorActual() a: Actor) { return this.svc.listarCargos(a); }
  @Post('cargos') @RequierePermisos(P.CARGOS_GESTIONAR)
  crearCargo(@ActorActual() a: Actor, @Body() dto: CargoDto) { return this.svc.guardarCargo(a, dto); }
  @Put('cargos/:id') @RequierePermisos(P.CARGOS_GESTIONAR)
  editarCargo(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CargoDto) { return this.svc.guardarCargo(a, dto, id); }

  @Get('cursos') cursos(@ActorActual() a: Actor, @Query('ciclo') ciclo?: string) { return this.svc.listarCursos(a, ciclo ? Number(ciclo) : undefined); }
  @Post('cursos') @RequierePermisos(P.CARGOS_GESTIONAR)
  crearCurso(@ActorActual() a: Actor, @Body() dto: CursoDto) { return this.svc.guardarCurso(a, dto); }
  @Put('cursos/:id') @RequierePermisos(P.CARGOS_GESTIONAR)
  editarCurso(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CursoDto) { return this.svc.guardarCurso(a, dto, id); }

  @Get('espacios-curriculares') espacios(@ActorActual() a: Actor) { return this.svc.listarEspacios(a); }
  @Post('espacios-curriculares') @RequierePermisos(P.CARGOS_GESTIONAR)
  crearEspacio(@ActorActual() a: Actor, @Body() dto: EspacioDto) { return this.svc.guardarEspacio(a, dto); }
  @Put('espacios-curriculares/:id') @RequierePermisos(P.CARGOS_GESTIONAR)
  editarEspacio(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EspacioDto) { return this.svc.guardarEspacio(a, dto, id); }

  @Get('designaciones')
  @RequierePermisos(P.DOCENTES_VER, P.REEMPLAZOS_GESTIONAR, P.ASISTENCIA_REGISTRAR, P.LICENCIAS_CARGAR)
  designaciones(@ActorActual() a: Actor, @Query('docenteId') docenteId?: string, @Query('activas') activas?: string) {
    return this.svc.listarDesignaciones(a, docenteId, activas === 'true');
  }
  @Post('designaciones') @RequierePermisos(P.CARGOS_GESTIONAR)
  crearDesignacion(@ActorActual() a: Actor, @Body() dto: DesignacionDto) { return this.svc.crearDesignacion(a, dto); }
  @Put('designaciones/:id') @RequierePermisos(P.CARGOS_GESTIONAR)
  editarDesignacion(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DesignacionDto) {
    return this.svc.actualizarDesignacion(a, id, dto);
  }
  @Post('designaciones/:id/baja') @RequierePermisos(P.CARGOS_GESTIONAR)
  baja(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BajaDesignacionDto) {
    return this.svc.darDeBaja(a, id, dto.fechaHasta, dto.motivoCese);
  }
  /** Licencia automática 2.11 sobre otra designación del docente (arts. 319, 333 e y 342 e). */
  @Post('designaciones/:id/licencia-automatica') @RequierePermisos(P.CARGOS_GESTIONAR)
  licenciaAutomatica(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LicenciaAutomaticaDto) {
    return this.circuito.licenciaAutomatica(a, id, dto.designacionAfectadaId);
  }
}
