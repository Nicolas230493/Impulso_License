import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ES_PUBLICO, MENSAJE_2FA_PENDIENTE, MENSAJE_CAMBIO_PENDIENTE, PERMISOS_REQUERIDOS, PERMITE_CAMBIO_PENDIENTE } from './decoradores';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(ctx: ExecutionContext) {
    const publico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
    if (publico) return true;
    return super.canActivate(ctx);
  }
}

@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    // Contraseña temporal o segundo factor pendiente: hasta resolverlo, solo las rutas que lo permiten explícitamente.
    if ((user?.debeCambiarPassword || user?.debeConfigurar2fa) && !this.reflector.getAllAndOverride<boolean>(PERMITE_CAMBIO_PENDIENTE, [ctx.getHandler(), ctx.getClass()])) {
      throw new ForbiddenException(user.debeCambiarPassword ? MENSAJE_CAMBIO_PENDIENTE : MENSAJE_2FA_PENDIENTE);
    }
    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISOS_REQUERIDOS, [ctx.getHandler(), ctx.getClass()]);
    if (!requeridos?.length) return true;
    if (!user || !requeridos.some((p) => user.permisos?.includes(p))) {
      throw new ForbiddenException('No tiene permisos para realizar esta acción');
    }
    return true;
  }
}
