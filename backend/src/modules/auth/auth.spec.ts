import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService, GRACIA_ROTACION_MS, MAX_INTENTOS, MENSAJE_CREDENCIALES, minutosBloqueo } from './auth.service';
import { cargarActor } from './jwt.strategy';
import { DIAS_RETENCION_SESIONES, SesionesPurgaService } from './sesiones-purga.service';
import { ForbiddenException } from '@nestjs/common';
import { cifrarTexto } from '../../common/cifrado';
import { codigoParaPaso, desdeBase32, generarSecreto, pasoActual } from '../../common/totp';
import { Reflector } from '@nestjs/core';
import { PermisosGuard } from '../../common/guards';
import { MENSAJE_CAMBIO_PENDIENTE, PERMITE_CAMBIO_PENDIENTE } from '../../common/decoradores';

process.env.JWT_ACCESS_SECRET ??= 'f3a9c1e7b2d84f6a0c5e9d17b4f8a63c5e0d2b9f7a1c4e8d';
process.env.DATABASE_URL ??= 'postgresql://x';
process.env.CLAVE_CIFRADO ??= 'ab'.repeat(32);

const HASH = bcrypt.hashSync('Correcta2026x', 4);
const usuarioBase = { id: 'u1', institucionId: 'i1', email: 'a@b.c', passwordHash: HASH, activo: true, intentosFallidos: 0, nivelBloqueo: 0, bloqueadoHasta: null as Date | null, tokenVersion: 3 };

function crear(usuario: typeof usuarioBase | null) {
  const prisma = {
    usuario: { findUnique: jest.fn().mockResolvedValue(usuario), update: jest.fn().mockResolvedValue({}) },
    sesion: { create: jest.fn() },
  };
  const notificaciones = { notificar: jest.fn() };
  const svc = new AuthService(prisma as never, { signAsync: jest.fn() } as never, { registrar: jest.fn() } as never, notificaciones as never);
  return { svc, prisma, notificaciones };
}

const error = async (p: Promise<unknown>) => p.then(() => null, (e) => e as UnauthorizedException);

describe('login sin enumeración y con backoff (hallazgo 18)', () => {
  it('misma respuesta para cuenta inexistente, contraseña errónea, inactiva y bloqueada', async () => {
    const casos = [
      crear(null).svc.login('x@y.z', 'Correcta2026x', {}),
      crear(usuarioBase).svc.login('a@b.c', 'Mala', {}),
      crear({ ...usuarioBase, activo: false }).svc.login('a@b.c', 'Correcta2026x', {}),
      crear({ ...usuarioBase, bloqueadoHasta: new Date(Date.now() + 60_000) }).svc.login('a@b.c', 'Correcta2026x', {}),
    ];
    const errores = await Promise.all(casos.map(error));
    for (const e of errores) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect(e!.getResponse()).toEqual(errores[0]!.getResponse());
      expect(e!.message).toBe(MENSAJE_CREDENCIALES);
    }
  });

  it('backoff progresivo 1, 5, 15 minutos', () => {
    expect([1, 2, 3, 4].map(minutosBloqueo)).toEqual([1, 5, 15, 15]);
  });

  it(`al ${MAX_INTENTOS}.º fallo bloquea con el siguiente escalón y notifica al usuario`, async () => {
    const { svc, prisma, notificaciones } = crear({ ...usuarioBase, intentosFallidos: MAX_INTENTOS - 1, nivelBloqueo: 1 });
    const antes = Date.now();
    await error(svc.login('a@b.c', 'Mala', {}));
    const data = prisma.usuario.update.mock.calls[0][0].data;
    expect(data.nivelBloqueo).toBe(2);
    expect(data.bloqueadoHasta.getTime() - antes).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
    expect(data.bloqueadoHasta.getTime() - antes).toBeLessThan(5 * 60_000 + 5000);
    expect(notificaciones.notificar).toHaveBeenCalledWith(['u1'], expect.objectContaining({ tipo: 'CUENTA_BLOQUEADA' }));
  });

  it('el bloqueo vence solo: con el tiempo cumplido, la contraseña correcta entra y reinicia el nivel', async () => {
    const { svc, prisma } = crear({ ...usuarioBase, bloqueadoHasta: new Date(Date.now() - 1000), nivelBloqueo: 2 });
    jest.spyOn(svc as never, 'emitirSesion').mockResolvedValue({} as never);
    await svc.login('a@b.c', 'Correcta2026x', {});
    expect(prisma.usuario.update.mock.calls[0][0].data).toMatchObject({ nivelBloqueo: 0, bloqueadoHasta: null, intentosFallidos: 0 });
  });
});

describe('revocación de access tokens (hallazgo 17)', () => {
  const prisma = (tokenVersion: number) => ({
    usuario: { findUnique: jest.fn().mockResolvedValue({ ...usuarioBase, tokenVersion, roles: [], institucion: { activa: true }, docenteId: null }) },
  });
  it('un token con versión anterior ya no carga el actor', async () => {
    expect(await cargarActor(prisma(4) as never, 'u1', 3)).toBeNull();
    expect(await cargarActor(prisma(3) as never, 'u1', 3)).not.toBeNull();
  });
});

describe('purga de sesiones (hallazgo 32)', () => {
  it(`borra sesiones revocadas o vencidas hace más de ${DIAS_RETENCION_SESIONES} días`, async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const svc = new SesionesPurgaService({ sesion: { deleteMany } } as never);
    const ahora = new Date('2026-11-23T00:00:00Z');
    expect(await svc.purgar(ahora)).toBe(2);
    const limite = new Date(ahora.getTime() - DIAS_RETENCION_SESIONES * 86_400_000);
    expect(deleteMany).toHaveBeenCalledWith({ where: { OR: [{ revocadaEn: { lt: limite } }, { expiraEn: { lt: limite } }] } });
  });
});

describe('renovación simultánea desde varias pestañas', () => {
  const vieja = (revocadaHaceMs: number | null, reemplazadaPorId: string | null = 's2') => ({
    id: 's1', usuarioId: 'u1', expiraEn: new Date(Date.now() + 86_400_000),
    revocadaEn: revocadaHaceMs === null ? null : new Date(Date.now() - revocadaHaceMs), reemplazadaPorId,
  });
  const sucesora = (revocada = false) => ({ id: 's2', usuarioId: 'u1', expiraEn: new Date(Date.now() + 86_400_000), revocadaEn: revocada ? new Date() : null });

  function servicio(sesiones: Record<string, unknown>) {
    const prisma: Record<string, unknown> = {
      sesion: {
        findUnique: jest.fn(({ where }) => Promise.resolve(where.id ? sesiones[where.id] ?? null : sesiones.s1)),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      usuario: { update: jest.fn() },
      $transaction: jest.fn(async (arg: unknown): Promise<unknown> => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : arg)),
    };
    const svc = new AuthService(prisma as never, { signAsync: jest.fn() } as never, { registrar: jest.fn() } as never, { notificar: jest.fn() } as never);
    const emitir = jest.spyOn(svc as never, 'emitirSesion').mockResolvedValue({ accessToken: 'nuevo' } as never);
    const revocarTodo = jest.spyOn(svc as never, 'revocarTodo').mockResolvedValue(undefined as never);
    return { svc, emitir, revocarTodo };
  }

  it('dentro del margen y con la sucesora vigente, entrega una sesión nueva sin revocar todo', async () => {
    const { svc, emitir, revocarTodo } = servicio({ s1: vieja(2_000), s2: sucesora() });
    await expect(svc.refrescar('token', {})).resolves.toEqual({ accessToken: 'nuevo' });
    expect(emitir).toHaveBeenCalled();
    expect(revocarTodo).not.toHaveBeenCalled();
  });

  it('fuera del margen se trata como robo y se revoca todo', async () => {
    const { svc, revocarTodo } = servicio({ s1: vieja(GRACIA_ROTACION_MS + 1_000), s2: sucesora() });
    await expect(svc.refrescar('token', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocarTodo).toHaveBeenCalledWith('u1');
  });

  it('si la sucesora ya se cerró (logout o revocación), no hay margen', async () => {
    const { svc, revocarTodo } = servicio({ s1: vieja(2_000), s2: sucesora(true) });
    await expect(svc.refrescar('token', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocarTodo).toHaveBeenCalled();
  });

  it('una sesión revocada por logout (sin sucesora) no tiene margen', async () => {
    const { svc, revocarTodo } = servicio({ s1: vieja(1_000, null) });
    await expect(svc.refrescar('token', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocarTodo).toHaveBeenCalled();
  });
});

describe('contraseña temporal: el backend la exige', () => {
  const contexto = (user: unknown, permite: boolean) => {
    const reflector = { getAllAndOverride: jest.fn((clave: string) => (clave === PERMITE_CAMBIO_PENDIENTE ? permite : undefined)) } as unknown as Reflector;
    const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user }) }) };
    return () => new PermisosGuard(reflector).canActivate(ctx as never);
  };
  it('con debeCambiarPassword, las rutas comunes responden 403', () => {
    expect(contexto({ permisos: [], debeCambiarPassword: true }, false)).toThrow(new ForbiddenException(MENSAJE_CAMBIO_PENDIENTE));
  });
  it('las rutas marcadas con @PermiteCambioPendiente siguen disponibles', () => {
    expect(contexto({ permisos: [], debeCambiarPassword: true }, true)()).toBe(true);
  });
  it('sin contraseña temporal no cambia nada', () => {
    expect(contexto({ permisos: [], debeCambiarPassword: false }, false)()).toBe(true);
  });
});

describe('segundo factor (TOTP)', () => {
  const secreto = generarSecreto();
  // La misma clave que usa el servicio (la del entorno; Prisma puede haber cargado backend/.env).
  const clave = Buffer.from(process.env.CLAVE_CIFRADO!, 'hex');
  const conTotp = { ...usuarioBase, totpActivo: true, totpSecreto: cifrarTexto(secreto, clave), totpUltimoPaso: null as number | null };
  const codigo = (desfase = 0) => codigoParaPaso(desdeBase32(secreto), pasoActual() + desfase);

  function servicio(usuario: typeof conTotp) {
    const prisma = {
      usuario: { findUnique: jest.fn().mockResolvedValue(usuario), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('desafio.jwt'),
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', tipo: '2fa', tv: usuario.tokenVersion }),
    };
    const svc = new AuthService(prisma as never, jwt as never, { registrar: jest.fn() } as never, { notificar: jest.fn() } as never);
    const emitir = jest.spyOn(svc as never, 'emitirSesion').mockResolvedValue({ accessToken: 'ok' } as never);
    return { svc, prisma, jwt, emitir };
  }

  it('con TOTP activo, la contraseña sola no abre sesión ni reinicia el contador de fallos', async () => {
    const { svc, prisma, jwt, emitir } = servicio({ ...conTotp, intentosFallidos: 3 });
    await expect(svc.login('a@b.c', 'Correcta2026x', {})).resolves.toEqual({ requiere2fa: true, desafio: 'desafio.jwt' });
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ tipo: '2fa', sub: 'u1' }), { expiresIn: '5m' });
    expect(emitir).not.toHaveBeenCalled();
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('código correcto: abre sesión y registra el paso usado', async () => {
    const { svc, prisma, emitir } = servicio(conTotp);
    await expect(svc.loginSegundoFactor('desafio.jwt', codigo(), {})).resolves.toEqual({ accessToken: 'ok' });
    expect(prisma.usuario.updateMany.mock.calls[0][0].data.totpUltimoPaso).toBe(pasoActual());
    expect(emitir).toHaveBeenCalled();
  });

  it('código incorrecto: cuenta como intento fallido (bloqueo por fuerza bruta)', async () => {
    const { svc, prisma, emitir } = servicio({ ...conTotp, intentosFallidos: MAX_INTENTOS - 1 });
    const malo = codigo() === '000000' ? '111111' : '000000';
    await expect(svc.loginSegundoFactor('desafio.jwt', malo, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.usuario.update.mock.calls[0][0].data.bloqueadoHasta).toBeInstanceOf(Date);
    expect(emitir).not.toHaveBeenCalled();
  });

  it('un código ya usado no se acepta de nuevo', async () => {
    const { svc, emitir } = servicio({ ...conTotp, totpUltimoPaso: pasoActual() + 1 });
    await expect(svc.loginSegundoFactor('desafio.jwt', codigo(), {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(emitir).not.toHaveBeenCalled();
  });

  it('el desafío deja de valer si cambió la versión de token (logout global, cambio de contraseña)', async () => {
    const { svc, jwt } = servicio(conTotp);
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', tipo: '2fa', tv: conTotp.tokenVersion - 1 });
    await expect(svc.loginSegundoFactor('desafio.jwt', codigo(), {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('un access token común no sirve como desafío', async () => {
    const { svc, jwt } = servicio(conTotp);
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', tv: conTotp.tokenVersion });
    await expect(svc.loginSegundoFactor('desafio.jwt', codigo(), {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('con 2FA pendiente, el backend bloquea las rutas comunes', () => {
    const reflector = { getAllAndOverride: jest.fn(() => undefined) } as unknown as Reflector;
    const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user: { permisos: [], debeConfigurar2fa: true } }) }) };
    expect(() => new PermisosGuard(reflector).canActivate(ctx as never)).toThrow(ForbiddenException);
  });
});

describe('margen de gracia: solo desde el mismo equipo', () => {
  it('una cookie recién rotada usada desde otra IP se trata como robo', async () => {
    const sesiones: Record<string, unknown> = {
      s1: { id: 's1', usuarioId: 'u1', expiraEn: new Date(Date.now() + 86_400_000), revocadaEn: new Date(Date.now() - 1000), reemplazadaPorId: 's2' },
      s2: { id: 's2', usuarioId: 'u1', expiraEn: new Date(Date.now() + 86_400_000), revocadaEn: null, ip: '10.0.0.1', userAgent: 'Firefox' },
    };
    const prisma = { sesion: { findUnique: jest.fn(({ where }) => Promise.resolve(where.id ? sesiones[where.id] : sesiones.s1)), updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const svc = new AuthService(prisma as never, {} as never, { registrar: jest.fn() } as never, {} as never);
    const revocarTodo = jest.spyOn(svc as never, 'revocarTodo').mockResolvedValue(undefined as never);
    const emitir = jest.spyOn(svc as never, 'emitirSesion').mockResolvedValue({} as never);
    await expect(svc.refrescar('t', { ip: '200.1.1.1', userAgent: 'Firefox' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocarTodo).toHaveBeenCalled();
    revocarTodo.mockClear();
    await expect(svc.refrescar('t', { ip: '10.0.0.1', userAgent: 'Firefox' })).resolves.toBeDefined();
    expect(emitir).toHaveBeenCalled();
    expect(revocarTodo).not.toHaveBeenCalled();
  });
});
