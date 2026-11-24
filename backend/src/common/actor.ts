import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Usuario autenticado y contexto de la petición, disponible en cada controlador. */
export interface Actor {
  usuarioId: string;
  institucionId: string;
  docenteId: string | null;
  email: string;
  permisos: string[];
  roles: { id: string; codigo: string }[];
  /** Contraseña temporal: hasta cambiarla solo se admiten las rutas marcadas con @PermiteCambioPendiente. */
  debeCambiarPassword?: boolean;
  /** Rol con segundo factor obligatorio (ADMIN, SUPERVISOR) que todavía no lo configuró: mismo tratamiento. */
  debeConfigurar2fa?: boolean;
  ip?: string;
  userAgent?: string;
}

export const tienePermiso = (actor: Actor, permiso: string) => actor.permisos.includes(permiso);

export const ActorActual = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest();
  return { ...req.user, ip: req.ip, userAgent: req.headers['user-agent'] };
});
