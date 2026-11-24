import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor } from '../../common/actor';
import { PaginacionDto, paginar, resultadoPaginado } from '../../common/paginacion.dto';
import { ActualizarUsuarioDto, CrearUsuarioDto, RolDto } from './usuarios.dto';

const SELECT_USUARIO = {
  id: true, email: true, nombre: true, apellido: true, activo: true, ultimoAcceso: true, docenteId: true,
  docente: { select: { id: true, legajo: true, apellido: true, nombre: true } },
  roles: { select: { rol: { select: { id: true, codigo: true, nombre: true } } } },
} as const;

export const ROL_ADMIN = 'ADMIN';

/**
 * Regla de techo (hallazgo 4): un actor solo puede otorgar —o administrar a quien tiene— permisos que él mismo posee.
 * Devuelve los permisos que exceden al actor (vacío = permitido).
 */
export function permisosQueExceden(actor: Pick<Actor, 'permisos'>, permisos: Iterable<string>) {
  const propios = new Set(actor.permisos);
  return [...new Set(permisos)].filter((p) => !propios.has(p));
}

export const esAdmin = (actor: Pick<Actor, 'roles'>) => actor.roles.some((r) => r.codigo === ROL_ADMIN);

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService) {}

  async listar(actor: Actor, p: PaginacionDto) {
    const where = {
      institucionId: actor.institucionId,
      ...(p.buscar && {
        OR: ['email', 'nombre', 'apellido'].map((c) => ({ [c]: { contains: p.buscar, mode: 'insensitive' as const } })),
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.usuario.findMany({ where, select: SELECT_USUARIO, orderBy: { apellido: 'asc' }, ...paginar(p) }),
      this.prisma.usuario.count({ where }),
    ]);
    return resultadoPaginado(items.map((u) => ({ ...u, roles: u.roles.map((r) => r.rol) })), total, p);
  }

  /** Rechaza con 403 (y deja constancia en la auditoría) un intento de exceder los propios privilegios. */
  private async denegar(actor: Actor, motivo: string, entidad: string, entidadId: string | null, detalle?: unknown): Promise<never> {
    await this.auditoria.registrar(actor, 'INTENTO_ESCALADA_PRIVILEGIOS', entidad, entidadId, null, { motivo, detalle });
    throw new ForbiddenException(motivo);
  }

  /** Roles a asignar: deben ser de la institución y no exceder los permisos del actor; ADMIN solo lo asigna un ADMIN. */
  private async validarRolesAsignables(actor: Actor, rolIds: string[], usuarioId: string | null) {
    if (!rolIds.length) return;
    const roles = await this.prisma.rol.findMany({
      where: { id: { in: rolIds }, institucionId: actor.institucionId },
      include: { permisos: { include: { permiso: true } } },
    });
    if (roles.length !== rolIds.length) throw new BadRequestException('Algún rol no pertenece a la institución');
    if (roles.some((r) => r.codigo === ROL_ADMIN) && !esAdmin(actor)) {
      await this.denegar(actor, 'Solo un administrador puede asignar el rol de administrador', 'usuario', usuarioId, { rolIds });
    }
    const exceden = permisosQueExceden(actor, roles.flatMap((r) => r.permisos.map((p) => p.permiso.codigo)));
    if (exceden.length) await this.denegar(actor, 'No puede asignar roles con permisos que usted no tiene', 'usuario', usuarioId, { rolIds, exceden });
  }

  /** El actor no puede administrar a un usuario con más privilegios que él (p. ej. resetear la clave de un ADMIN). */
  private async validarUsuarioAdministrable(actor: Actor, usuarioId: string) {
    const objetivo = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, institucionId: actor.institucionId },
      include: { roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } } },
    });
    if (!objetivo) throw new NotFoundException('Usuario no encontrado');
    const esAdminObjetivo = objetivo.roles.some((r) => r.rol.codigo === ROL_ADMIN);
    const exceden = permisosQueExceden(actor, objetivo.roles.flatMap((r) => r.rol.permisos.map((p) => p.permiso.codigo)));
    if ((esAdminObjetivo && !esAdmin(actor)) || exceden.length) {
      await this.denegar(actor, 'No puede administrar a un usuario con más privilegios que usted', 'usuario', usuarioId, { exceden });
    }
    return objetivo;
  }

  private async validarDocente(actor: Actor, docenteId?: string | null) {
    if (!docenteId) return;
    const d = await this.prisma.docente.findFirst({ where: { id: docenteId, institucionId: actor.institucionId } });
    if (!d) throw new BadRequestException('Docente inexistente');
  }

  async crear(actor: Actor, dto: CrearUsuarioDto) {
    await this.validarRolesAsignables(actor, dto.rolIds, null);
    await this.validarDocente(actor, dto.docenteId);
    const u = await this.prisma.usuario.create({
      data: {
        institucionId: actor.institucionId,
        email: dto.email.toLowerCase().trim(),
        nombre: dto.nombre,
        apellido: dto.apellido,
        passwordHash: await bcrypt.hash(dto.password, 12),
        debeCambiarPassword: true,
        docenteId: dto.docenteId,
        roles: { create: dto.rolIds.map((rolId) => ({ rolId })) },
      },
      select: SELECT_USUARIO,
    });
    await this.auditoria.registrar(actor, 'CREAR', 'usuario', u.id, null, u);
    return u;
  }

  async actualizar(actor: Actor, id: string, dto: ActualizarUsuarioDto) {
    const antes = await this.prisma.usuario.findFirst({ where: { id, institucionId: actor.institucionId }, select: SELECT_USUARIO });
    if (!antes) throw new NotFoundException('Usuario no encontrado');
    if (id === actor.usuarioId && dto.activo === false) throw new BadRequestException('No puede desactivar su propio usuario');
    // Hallazgo 4: nadie modifica sus propios roles (ni siquiera para "quitarse" uno: lo hace otro administrador).
    if (id === actor.usuarioId && dto.rolIds) await this.denegar(actor, 'No puede modificar sus propios roles', 'usuario', id, { rolIds: dto.rolIds });
    if (id !== actor.usuarioId) await this.validarUsuarioAdministrable(actor, id);
    if (dto.rolIds) await this.validarRolesAsignables(actor, dto.rolIds, id);
    await this.validarDocente(actor, dto.docenteId);
    const { rolIds, ...datos } = dto;
    const revocar = !!rolIds || dto.activo === false;
    const despues = await this.prisma.$transaction(async (tx) => {
      if (rolIds) {
        await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
        await tx.usuarioRol.createMany({ data: rolIds.map((rolId) => ({ usuarioId: id, rolId })) });
      }
      if (dto.activo === false) await tx.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } });
      // Hallazgo 17: cambio de roles o desactivación invalidan los access tokens ya emitidos.
      return tx.usuario.update({ where: { id }, data: { ...datos, ...(revocar && { tokenVersion: { increment: 1 } }) }, select: SELECT_USUARIO });
    });
    await this.auditoria.registrar(actor, 'ACTUALIZAR', 'usuario', id, antes, despues);
    return despues;
  }

  async resetPassword(actor: Actor, id: string, password: string) {
    if (id !== actor.usuarioId) await this.validarUsuarioAdministrable(actor, id);
    const u = await this.prisma.usuario.findFirst({ where: { id, institucionId: actor.institucionId } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id },
        data: {
          passwordHash: await bcrypt.hash(password, 12), intentosFallidos: 0, bloqueadoHasta: null, nivelBloqueo: 0,
          debeCambiarPassword: id !== actor.usuarioId, tokenVersion: { increment: 1 },
          // Recuperación de cuenta (p. ej. teléfono perdido): el blanqueo hecho por otro usuario también reinicia el
          // segundo factor, que el titular vuelve a configurar al ingresar.
          ...(id !== actor.usuarioId && { totpSecreto: null, totpActivo: false, totpUltimoPaso: null }),
        },
      }),
      this.prisma.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } }),
    ]);
    await this.auditoria.registrar(actor, 'RESET_PASSWORD', 'usuario', id, null, { segundoFactorReiniciado: id !== actor.usuarioId && u.totpActivo });
  }

  // ── Roles y permisos ──
  listarPermisos() {
    return this.prisma.permiso.findMany({ orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }] });
  }

  async listarRoles(actor: Actor) {
    const roles = await this.prisma.rol.findMany({
      where: { institucionId: actor.institucionId },
      include: { permisos: { include: { permiso: true } }, _count: { select: { usuarios: true } } },
      orderBy: { nombre: 'asc' },
    });
    return roles.map(({ permisos, _count, ...r }) => ({ ...r, usuarios: _count.usuarios, permisos: permisos.map((p) => p.permiso.codigo) }));
  }

  private async idsPermisos(codigos: string[]) {
    const permisos = await this.prisma.permiso.findMany({ where: { codigo: { in: codigos } } });
    if (permisos.length !== codigos.length) throw new BadRequestException('Algún permiso no existe');
    return permisos.map((p) => p.id);
  }

  async guardarRol(actor: Actor, dto: RolDto, id?: string) {
    let antes = null;
    if (id) {
      antes = await this.prisma.rol.findFirst({ where: { id, institucionId: actor.institucionId }, include: { permisos: { include: { permiso: true } } } });
      if (!antes) throw new NotFoundException('Rol no encontrado');
      // Hallazgo 4: los roles del sistema son inmutables (código, nombre y permisos).
      if (antes.sistema) await this.denegar(actor, 'Los roles del sistema no se pueden modificar', 'rol', id, { codigo: dto.codigo, permisos: dto.permisos });
      // Tampoco se edita un rol que el actor tiene asignado (sería modificar sus propios permisos).
      if (actor.roles.some((r) => r.id === id)) await this.denegar(actor, 'No puede modificar un rol que usted tiene asignado', 'rol', id);
      const exceden = permisosQueExceden(actor, antes.permisos.map((p) => p.permiso.codigo));
      if (exceden.length) await this.denegar(actor, 'No puede modificar un rol con permisos que usted no tiene', 'rol', id, { exceden });
    }
    if (dto.codigo === ROL_ADMIN) await this.denegar(actor, 'El código ADMIN está reservado', 'rol', id ?? null);
    const exceden = permisosQueExceden(actor, dto.permisos);
    if (exceden.length) await this.denegar(actor, 'No puede otorgar permisos que usted no tiene', 'rol', id ?? null, { exceden });
    const permisoIds = await this.idsPermisos(dto.permisos);
    const rol = await this.prisma.$transaction(async (tx) => {
      const r = id
        ? await tx.rol.update({ where: { id }, data: { nombre: dto.nombre, descripcion: dto.descripcion, codigo: dto.codigo } })
        : await tx.rol.create({ data: { institucionId: actor.institucionId, codigo: dto.codigo, nombre: dto.nombre, descripcion: dto.descripcion } });
      await tx.rolPermiso.deleteMany({ where: { rolId: r.id } });
      await tx.rolPermiso.createMany({ data: permisoIds.map((permisoId) => ({ rolId: r.id, permisoId })) });
      return r;
    });
    await this.auditoria.registrar(actor, id ? 'ACTUALIZAR' : 'CREAR', 'rol', rol.id, antes, { ...rol, permisos: dto.permisos });
    return rol;
  }
}
