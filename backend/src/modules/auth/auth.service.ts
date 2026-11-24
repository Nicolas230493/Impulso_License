import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Actor } from '../../common/actor';
import { entorno } from '../../config/entorno';
import { cargarActor, ROLES_CON_2FA } from './jwt.strategy';
import { cifrarTexto, claveDesdeHex, descifrarTexto } from '../../common/cifrado';
import { generarSecreto, uriOtpauth, verificarCodigo } from '../../common/totp';

/** Desafío entre la contraseña y el código del segundo factor: corto y de un solo propósito. */
export const DURACION_DESAFIO_2FA = '5m';
export const EMISOR_TOTP = 'Impulso License';

export const MAX_INTENTOS = 5;
/** Backoff progresivo por cuenta (hallazgo 18): 1, 5 y 15 minutos; el desbloqueo es automático. */
export const ESCALONES_BLOQUEO_MIN = [1, 5, 15];
export const MENSAJE_CREDENCIALES = 'Credenciales inválidas';
/**
 * Margen para la cookie recién rotada: si dos pestañas renuevan a la vez, la segunda llega con el token que la primera
 * acaba de rotar. Dentro de este margen, y mientras la sesión que la reemplazó siga viva, no se trata como robo.
 */
export const GRACIA_ROTACION_MS = 30_000;

const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente', 12);
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Minutos de bloqueo para el n-ésimo bloqueo consecutivo (1-based). */
export const minutosBloqueo = (nivel: number) => ESCALONES_BLOQUEO_MIN[Math.min(Math.max(nivel, 1), ESCALONES_BLOQUEO_MIN.length) - 1];

interface Contexto { ip?: string; userAgent?: string }

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private auditoria: AuditoriaService,
    private notificaciones: NotificacionesService,
  ) {}

  /**
   * Hallazgo 18: la respuesta es idéntica ("Credenciales inválidas", 401) para usuario inexistente, contraseña errónea,
   * cuenta inactiva o bloqueada, y siempre se compara contra un hash bcrypt para igualar los tiempos.
   */
  async login(email: string, password: string, ctx: Contexto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
    const ok = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_FICTICIO);
    const ahora = new Date();

    if (usuario?.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
      await this.auditoria.registrar({ usuarioId: usuario.id, institucionId: usuario.institucionId, ...ctx }, 'LOGIN_BLOQUEADO', 'usuario', usuario.id);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }
    if (!usuario || !ok || !usuario.activo) {
      if (usuario) await this.registrarFallo(usuario, ctx, ahora);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }

    // Con segundo factor: la contraseña sola no abre sesión ni reinicia el contador de fallos (si no, alternar
    // contraseña correcta y códigos erróneos permitiría probar códigos sin límite).
    if (usuario.totpActivo) {
      await this.auditoria.registrar({ usuarioId: usuario.id, institucionId: usuario.institucionId, ...ctx }, 'LOGIN_PASO_CONTRASENA', 'usuario', usuario.id);
      const desafio = await this.jwt.signAsync({ sub: usuario.id, tipo: '2fa', tv: usuario.tokenVersion }, { expiresIn: DURACION_DESAFIO_2FA });
      return { requiere2fa: true as const, desafio };
    }
    return this.completarLogin(usuario, ctx, ahora);
  }

  private async completarLogin(usuario: { id: string; institucionId: string }, ctx: Contexto, ahora: Date, extra: Prisma.UsuarioUpdateInput = {}) {
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, nivelBloqueo: 0, ultimoAcceso: ahora, ...extra },
    });
    await this.auditoria.registrar({ usuarioId: usuario.id, institucionId: usuario.institucionId, ...ctx }, 'LOGIN', 'usuario', usuario.id);
    return this.emitirSesion(usuario.id, ctx);
  }

  /** Segundo paso del login: código TOTP. Los códigos erróneos cuentan para el bloqueo por intentos. */
  async loginSegundoFactor(desafio: string, codigo: string, ctx: Contexto) {
    let payload: { sub: string; tipo?: string; tv?: number };
    try {
      payload = await this.jwt.verifyAsync(desafio, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('El ingreso expiró; vuelva a ingresar su contraseña');
    }
    if (payload.tipo !== '2fa') throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
    const ahora = new Date();
    if (!usuario || !usuario.activo || !usuario.totpActivo || !usuario.totpSecreto || usuario.tokenVersion !== payload.tv)
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
      await this.auditoria.registrar({ usuarioId: usuario.id, institucionId: usuario.institucionId, ...ctx }, 'LOGIN_BLOQUEADO', 'usuario', usuario.id);
      throw new UnauthorizedException(MENSAJE_CREDENCIALES);
    }
    const paso = verificarCodigo(descifrarTexto(usuario.totpSecreto, this.clave()), codigo, { ultimoPasoUsado: usuario.totpUltimoPaso });
    if (paso === null) {
      await this.registrarFallo(usuario, ctx, ahora);
      throw new UnauthorizedException('Código de verificación incorrecto');
    }
    // Un mismo código no se acepta dos veces, ni siquiera en peticiones simultáneas.
    const r = await this.prisma.usuario.updateMany({
      where: { id: usuario.id, OR: [{ totpUltimoPaso: null }, { totpUltimoPaso: { lt: paso } }] },
      data: { totpUltimoPaso: paso },
    });
    if (!r.count) throw new UnauthorizedException('Código de verificación ya utilizado');
    return this.completarLogin(usuario, ctx, ahora);
  }

  // ───────────── Configuración del segundo factor ─────────────

  private clave() {
    const clave = claveDesdeHex(entorno().CLAVE_CIFRADO);
    if (!clave) throw new ServiceUnavailableException('El segundo factor requiere CLAVE_CIFRADO en la configuración del servidor');
    return clave;
  }

  /** Genera un secreto nuevo (todavía inactivo) y devuelve lo necesario para cargarlo en la app autenticadora. */
  async iniciarTotp(actor: Actor) {
    const u = await this.prisma.usuario.findUniqueOrThrow({ where: { id: actor.usuarioId } });
    if (u.totpActivo) throw new ConflictException('La verificación en dos pasos ya está activa');
    const secreto = generarSecreto();
    await this.prisma.usuario.update({ where: { id: u.id }, data: { totpSecreto: cifrarTexto(secreto, this.clave()), totpActivo: false, totpUltimoPaso: null } });
    await this.auditoria.registrar(actor, 'TOTP_INICIADO', 'usuario', u.id);
    return { secreto, uri: uriOtpauth(EMISOR_TOTP, u.email, secreto) };
  }

  /** Activa el segundo factor tras comprobar que la app genera códigos válidos. */
  async activarTotp(actor: Actor, codigo: string) {
    const u = await this.prisma.usuario.findUniqueOrThrow({ where: { id: actor.usuarioId } });
    if (u.totpActivo) throw new ConflictException('La verificación en dos pasos ya está activa');
    if (!u.totpSecreto) throw new BadRequestException('Primero genere el código de configuración');
    const paso = verificarCodigo(descifrarTexto(u.totpSecreto, this.clave()), codigo);
    if (paso === null) throw new BadRequestException('Código incorrecto. Verifique la hora del teléfono e intente de nuevo.');
    await this.prisma.usuario.update({ where: { id: u.id }, data: { totpActivo: true, totpUltimoPaso: paso } });
    await this.auditoria.registrar(actor, 'TOTP_ACTIVADO', 'usuario', u.id);
  }

  /** Desactiva el segundo factor (con contraseña y código). Los roles que lo tienen obligatorio no pueden. */
  async desactivarTotp(actor: Actor, password: string, codigo: string) {
    if (this.segundoFactorObligatorio(actor.roles.map((r) => r.codigo))) throw new ForbiddenException('Su rol requiere la verificación en dos pasos');
    const u = await this.prisma.usuario.findUniqueOrThrow({ where: { id: actor.usuarioId } });
    if (!u.totpActivo || !u.totpSecreto) throw new ConflictException('La verificación en dos pasos no está activa');
    const ok = await bcrypt.compare(password, u.passwordHash);
    const paso = verificarCodigo(descifrarTexto(u.totpSecreto, this.clave()), codigo, { ultimoPasoUsado: u.totpUltimoPaso });
    if (!ok || paso === null) throw new BadRequestException('Contraseña o código incorrectos');
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id: u.id }, data: { totpSecreto: null, totpActivo: false, totpUltimoPaso: null, tokenVersion: { increment: 1 } } }),
      this.prisma.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null }, data: { revocadaEn: new Date() } }),
    ]);
    await this.auditoria.registrar(actor, 'TOTP_DESACTIVADO', 'usuario', u.id);
  }

  segundoFactorObligatorio(codigosRol: string[]) {
    return entorno().EXIGIR_2FA && codigosRol.some((c) => ROLES_CON_2FA.includes(c));
  }

  private async registrarFallo(
    usuario: { id: string; institucionId: string; intentosFallidos: number; nivelBloqueo: number },
    ctx: Contexto,
    ahora: Date,
  ) {
    const intentos = usuario.intentosFallidos + 1;
    const bloquear = intentos >= MAX_INTENTOS;
    const nivel = bloquear ? usuario.nivelBloqueo + 1 : usuario.nivelBloqueo;
    const minutos = minutosBloqueo(nivel);
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: bloquear
        ? { intentosFallidos: 0, nivelBloqueo: nivel, bloqueadoHasta: new Date(ahora.getTime() + minutos * 60_000) }
        : { intentosFallidos: intentos },
    });
    const actor = { usuarioId: usuario.id, institucionId: usuario.institucionId, ...ctx };
    await this.auditoria.registrar(actor, 'LOGIN_FALLIDO', 'usuario', usuario.id);
    if (bloquear) {
      await this.auditoria.registrar(actor, 'CUENTA_BLOQUEADA', 'usuario', usuario.id, null, { minutos, nivel });
      await this.notificaciones.notificar([usuario.id], {
        tipo: 'CUENTA_BLOQUEADA',
        titulo: 'Su cuenta se bloqueó temporalmente',
        mensaje: `Se registraron ${MAX_INTENTOS} intentos fallidos de ingreso. La cuenta se desbloquea sola en ${minutos} minuto(s). Si no fue usted, cambie su contraseña.`,
        entidad: 'usuario',
        entidadId: usuario.id,
      });
    }
  }

  async refrescar(refreshToken: string | undefined, ctx: Contexto) {
    if (!refreshToken) throw new UnauthorizedException('Sesión no iniciada');
    const sesion = await this.prisma.sesion.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!sesion || sesion.expiraEn < new Date()) throw new UnauthorizedException('Sesión expirada');
    if (!sesion.revocadaEn) {
      const rotada = await this.rotar(sesion.id, sesion.usuarioId, ctx);
      if (rotada) return rotada;
    }
    // Ya estaba revocada, o la rotó otra petición concurrente: se relee el estado confirmado.
    const actual = await this.prisma.sesion.findUnique({ where: { id: sesion.id } });
    if (actual?.revocadaEn && (await this.enGracia(actual, ctx))) return this.emitirSesion(actual.usuarioId, ctx);
    // Reutilización de un token ya rotado fuera del margen: posible robo → revocar todo e invalidar access tokens.
    if (actual?.revocadaEn) await this.revocarTodo(actual.usuarioId);
    throw new UnauthorizedException('Sesión expirada');
  }

  /** Rota la sesión de forma atómica: la revoca, crea la nueva y deja el vínculo. null si otra petición ya la rotó. */
  private async rotar(sesionId: string, usuarioId: string, ctx: Contexto) {
    const nueva = await this.prisma.$transaction(async (tx) => {
      const r = await tx.sesion.updateMany({ where: { id: sesionId, revocadaEn: null }, data: { revocadaEn: new Date() } });
      if (!r.count) return null;
      const creada = await this.crearSesion(tx, usuarioId, ctx);
      await tx.sesion.update({ where: { id: sesionId }, data: { reemplazadaPorId: creada.id } });
      return creada;
    });
    return nueva && this.completarSesion(usuarioId, nueva);
  }

  /**
   * La sesión se rotó hace menos de GRACIA_ROTACION_MS, la que la reemplazó sigue vigente (no hubo logout ni
   * revocación) y el pedido viene del mismo equipo (IP y navegador) que hizo la rotación: un token robado y usado
   * desde otro lado se sigue tratando como robo.
   */
  private async enGracia(s: { revocadaEn: Date | null; reemplazadaPorId: string | null }, ctx: Contexto) {
    if (!s.revocadaEn || !s.reemplazadaPorId || Date.now() - s.revocadaEn.getTime() > GRACIA_ROTACION_MS) return false;
    const sucesora = await this.prisma.sesion.findUnique({ where: { id: s.reemplazadaPorId } });
    if (!sucesora || sucesora.revocadaEn || sucesora.expiraEn <= new Date()) return false;
    return (sucesora.ip ?? null) === (ctx.ip ?? null) && (sucesora.userAgent ?? null) === (ctx.userAgent?.slice(0, 300) ?? null);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.sesion.updateMany({ where: { tokenHash: hashToken(refreshToken), revocadaEn: null }, data: { revocadaEn: new Date() } });
  }

  /** Revoca todas las sesiones e incrementa tokenVersion: los access tokens emitidos dejan de valer (hallazgo 17). */
  private async revocarTodo(usuarioId: string) {
    await this.prisma.$transaction([
      this.prisma.sesion.updateMany({ where: { usuarioId, revocadaEn: null }, data: { revocadaEn: new Date() } }),
      this.prisma.usuario.update({ where: { id: usuarioId }, data: { tokenVersion: { increment: 1 } } }),
    ]);
  }

  async logoutGlobal(actor: Actor) {
    await this.revocarTodo(actor.usuarioId);
    await this.auditoria.registrar(actor, 'LOGOUT_GLOBAL', 'usuario', actor.usuarioId);
  }

  async perfil(usuarioId: string) {
    const actor = await cargarActor(this.prisma, usuarioId);
    if (!actor) throw new UnauthorizedException();
    const u = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: {
        id: true, email: true, nombre: true, apellido: true, docenteId: true, debeCambiarPassword: true, totpActivo: true,
        institucion: { select: { id: true, nombre: true, tipoGestion: true } },
        roles: { select: { rol: { select: { codigo: true, nombre: true } } } },
      },
    });
    return {
      ...u, roles: u.roles.map((r) => r.rol), permisos: actor.permisos,
      debeConfigurar2fa: !!actor.debeConfigurar2fa, segundoFactorObligatorio: this.segundoFactorObligatorio(u.roles.map((r) => r.rol.codigo)),
    };
  }

  async cambiarPassword(actor: Actor, actual: string, nueva: string) {
    const u = await this.prisma.usuario.findUniqueOrThrow({ where: { id: actor.usuarioId } });
    if (!(await bcrypt.compare(actual, u.passwordHash))) throw new BadRequestException('La contraseña actual es incorrecta');
    if (await bcrypt.compare(nueva, u.passwordHash)) throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: u.id },
        data: { passwordHash: await bcrypt.hash(nueva, 12), debeCambiarPassword: false, tokenVersion: { increment: 1 } },
      }),
      this.prisma.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null }, data: { revocadaEn: new Date() } }),
    ]);
    await this.auditoria.registrar(actor, 'CAMBIO_PASSWORD', 'usuario', u.id);
  }

  private async emitirSesion(usuarioId: string, ctx: Contexto) {
    return this.completarSesion(usuarioId, await this.crearSesion(this.prisma, usuarioId, ctx));
  }

  private async crearSesion(db: Prisma.TransactionClient | PrismaService, usuarioId: string, ctx: Contexto) {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiraEn = new Date(Date.now() + entorno().REFRESH_TTL_DIAS * 86_400_000);
    const { id } = await db.sesion.create({
      data: { usuarioId, tokenHash: hashToken(refreshToken), expiraEn, ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300) },
      select: { id: true },
    });
    return { id, refreshToken, expiraEn };
  }

  private async completarSesion(usuarioId: string, { refreshToken, expiraEn }: { refreshToken: string; expiraEn: Date }) {
    const { tokenVersion } = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { tokenVersion: true } });
    const accessToken = await this.jwt.signAsync({ sub: usuarioId, tv: tokenVersion });
    return { accessToken, refreshToken, expiraEn, usuario: await this.perfil(usuarioId) };
  }
}
