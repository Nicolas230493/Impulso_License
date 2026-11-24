import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/actor';
import { entorno } from '../../config/entorno';

/** Roles que deben usar segundo factor cuando EXIGIR_2FA está activo (siempre en producción). */
export const ROLES_CON_2FA = ['ADMIN', 'SUPERVISOR'];

export async function cargarActor(prisma: PrismaService, usuarioId: string, tokenVersion?: number): Promise<Omit<Actor, 'ip' | 'userAgent'> | null> {
  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } }, institucion: true },
  });
  if (!u || !u.activo || !u.institucion.activa) return null;
  // Hallazgo 17: un token emitido antes de un logout global, cambio de contraseña, de roles o desactivación ya no vale.
  if (tokenVersion !== undefined && tokenVersion !== u.tokenVersion) return null;
  const permisos = new Set<string>();
  u.roles.forEach((ur) => ur.rol.permisos.forEach((rp) => permisos.add(rp.permiso.codigo)));
  return {
    usuarioId: u.id,
    institucionId: u.institucionId,
    docenteId: u.docenteId,
    email: u.email,
    permisos: [...permisos].sort(),
    roles: u.roles.map((ur) => ({ id: ur.rol.id, codigo: ur.rol.codigo })),
    debeCambiarPassword: u.debeCambiarPassword,
    debeConfigurar2fa: entorno().EXIGIR_2FA && !u.totpActivo && u.roles.some((ur) => ROLES_CON_2FA.includes(ur.rol.codigo)),
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: entorno().JWT_ACCESS_SECRET,
      algorithms: ['HS256'],
    });
  }

  // Los permisos se resuelven en cada petición: un cambio de rol tiene efecto inmediato.
  async validate(payload: { sub: string; tv?: number; tipo?: string }) {
    // Tokens sin `tv` (emitidos antes de esta versión) no se aceptan, ni los desafíos de segundo factor.
    if (typeof payload.tv !== 'number' || payload.tipo) throw new UnauthorizedException('Sesión expirada');
    const actor = await cargarActor(this.prisma, payload.sub, payload.tv);
    if (!actor) throw new UnauthorizedException('Sesión expirada');
    return actor;
  }
}
