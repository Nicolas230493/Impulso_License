import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { ActualizarUsuarioDto, CrearUsuarioDto, ResetPasswordDto, RolDto } from './usuarios.dto';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { PaginacionDto } from '../../common/paginacion.dto';

@Controller()
@RequierePermisos(P.USUARIOS_GESTIONAR)
export class UsuariosController {
  constructor(private svc: UsuariosService) {}

  @Get('usuarios') listar(@ActorActual() a: Actor, @Query() p: PaginacionDto) { return this.svc.listar(a, p); }
  @Post('usuarios') crear(@ActorActual() a: Actor, @Body() dto: CrearUsuarioDto) { return this.svc.crear(a, dto); }
  @Patch('usuarios/:id') actualizar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarUsuarioDto) {
    return this.svc.actualizar(a, id, dto);
  }
  @Post('usuarios/:id/reset-password') @HttpCode(204)
  reset(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    return this.svc.resetPassword(a, id, dto.password);
  }

  @Get('permisos') @RequierePermisos(P.USUARIOS_GESTIONAR, P.ROLES_GESTIONAR) permisos() { return this.svc.listarPermisos(); }
  @Get('roles') @RequierePermisos(P.USUARIOS_GESTIONAR, P.ROLES_GESTIONAR, P.CIRCUITOS_GESTIONAR) roles(@ActorActual() a: Actor) { return this.svc.listarRoles(a); }
  // Hallazgo 4: la matriz de roles y permisos requiere un permiso propio, separado de usuarios.gestionar.
  @Post('roles') @RequierePermisos(P.ROLES_GESTIONAR) crearRol(@ActorActual() a: Actor, @Body() dto: RolDto) { return this.svc.guardarRol(a, dto); }
  @Put('roles/:id') @RequierePermisos(P.ROLES_GESTIONAR) actualizarRol(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RolDto) {
    return this.svc.guardarRol(a, dto, id);
  }
}
