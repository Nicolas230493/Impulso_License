import { ForbiddenException } from '@nestjs/common';
import { Actor } from '../../common/actor';
import { P } from '../../common/permisos';
import { permisosQueExceden, UsuariosService } from './usuarios.service';

const actor = (over: Partial<Actor> = {}): Actor => ({
  usuarioId: 'gestor', institucionId: 'inst', docenteId: null, email: 'g@x', permisos: [P.USUARIOS_GESTIONAR], roles: [{ id: 'rol-gestor', codigo: 'GESTOR' }], ...over,
});
const ADMIN = actor({ usuarioId: 'admin', permisos: Object.values(P), roles: [{ id: 'rol-admin', codigo: 'ADMIN' }] });

const rolAdmin = { id: 'rol-admin', codigo: 'ADMIN', sistema: true, permisos: Object.values(P).map((codigo) => ({ permiso: { codigo } })) };
const rolDocente = { id: 'rol-doc', codigo: 'DOCENTE', sistema: true, permisos: [{ permiso: { codigo: P.LICENCIAS_SOLICITAR } }] };

function crear(roles = [rolAdmin, rolDocente]) {
  const auditoria = { registrar: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    usuario: {
      findFirst: jest.fn().mockResolvedValue({ id: 'objetivo', roles: [{ rol: rolDocente }] }),
      update: jest.fn().mockResolvedValue({ id: 'objetivo' }),
      create: jest.fn().mockResolvedValue({ id: 'nuevo' }),
    },
    rol: {
      findMany: jest.fn(({ where }) => Promise.resolve(roles.filter((r) => where.id.in.includes(r.id)))),
      findFirst: jest.fn(({ where }) => Promise.resolve(roles.find((r) => r.id === where.id) ?? null)),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'rol-nuevo', ...data })),
    },
    docente: { findFirst: jest.fn() },
    permiso: { findMany: jest.fn(({ where }) => Promise.resolve(where.codigo.in.map((c: string) => ({ id: c })))) },
    $transaction: jest.fn(async (fn) => (typeof fn === 'function' ? fn(prisma) : fn)),
    usuarioRol: { deleteMany: jest.fn(), createMany: jest.fn() },
    sesion: { updateMany: jest.fn() },
    rolPermiso: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  return { svc: new UsuariosService(prisma as never, auditoria as never), prisma, auditoria };
}

describe('escalada de privilegios (hallazgo 4)', () => {
  it('nadie modifica sus propios roles (403 auditado)', async () => {
    const { svc, auditoria } = crear();
    await expect(svc.actualizar(actor(), 'gestor', { rolIds: ['rol-admin'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), 'INTENTO_ESCALADA_PRIVILEGIOS', 'usuario', 'gestor', null, expect.anything());
  });

  it('un usuario con usuarios.gestionar no puede asignar ADMIN a otro', async () => {
    const { svc, prisma } = crear();
    await expect(svc.actualizar(actor(), 'objetivo', { rolIds: ['rol-admin'] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.crear(actor(), { email: 'a@b.c', nombre: 'a', apellido: 'b', password: 'x', rolIds: ['rol-admin'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuarioRol.createMany).not.toHaveBeenCalled();
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('regla de techo: no asigna roles con permisos que no tiene', async () => {
    const { svc } = crear();
    await expect(svc.actualizar(actor(), 'objetivo', { rolIds: ['rol-doc'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(permisosQueExceden(actor({ permisos: [P.LICENCIAS_SOLICITAR] }), [P.LICENCIAS_SOLICITAR])).toEqual([]);
  });

  it('no administra a un usuario con más privilegios (p. ej. resetear la clave de un ADMIN)', async () => {
    const { svc, prisma } = crear();
    prisma.usuario.findFirst.mockResolvedValue({ id: 'admin', roles: [{ rol: rolAdmin }] });
    await expect(svc.resetPassword(actor(), 'admin', 'Nueva12345A')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('un ADMIN sí puede asignar ADMIN, y el cambio de roles invalida los tokens (hallazgo 17)', async () => {
    const { svc, prisma } = crear();
    await svc.actualizar(ADMIN, 'objetivo', { rolIds: ['rol-admin'] });
    expect(prisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokenVersion: { increment: 1 } }) }));
  });

  it('los roles de sistema son inmutables, incluso para ADMIN (403 auditado)', async () => {
    const { svc, prisma, auditoria } = crear();
    await expect(svc.guardarRol(ADMIN, { codigo: 'DOCENTE', nombre: 'x', permisos: Object.values(P) }, 'rol-doc')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rolPermiso.createMany).not.toHaveBeenCalled();
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), 'INTENTO_ESCALADA_PRIVILEGIOS', 'rol', 'rol-doc', null, expect.anything());
  });

  it('no crea roles con permisos que el actor no tiene ni con código ADMIN', async () => {
    const { svc } = crear();
    const gestorRoles = actor({ permisos: [P.ROLES_GESTIONAR, P.DOCENTES_VER] });
    await expect(svc.guardarRol(gestorRoles, { codigo: 'X', nombre: 'x', permisos: [P.DATOS_SENSIBLES_VER] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.guardarRol(ADMIN, { codigo: 'ADMIN', nombre: 'x', permisos: [] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.guardarRol(gestorRoles, { codigo: 'LECTOR', nombre: 'Lector', permisos: [P.DOCENTES_VER] })).resolves.toBeDefined();
  });
});
