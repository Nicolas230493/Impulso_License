import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CambiarPasswordDto, CodigoTotpDto, DesactivarTotpDto, LoginDto, LoginSegundoFactorDto } from './auth.dto';
import { PermiteCambioPendiente, Publico } from '../../common/decoradores';
import { Actor, ActorActual } from '../../common/actor';
import { LIMITES, LimitePorEmail } from '../../common/throttling';
import { entorno } from '../../config/entorno';

export const COOKIE = 'edu_rt';
export const RUTA_COOKIE = '/api/auth';

/** Opciones de la cookie de refresh (hallazgo 9): en producción siempre Secure; HttpOnly, SameSite=Strict y path acotado. */
export function opcionesCookie(expires?: Date) {
  return { httpOnly: true, secure: entorno().COOKIE_SECURE, sameSite: 'strict' as const, path: RUTA_COOKIE, ...(expires && { expires }) };
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** La IP sale de la cadena de proxies confiables (trust proxy = TRUSTED_PROXIES). */
  private ctx(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private setCookie(res: Response, token: string, expiraEn: Date) {
    res.cookie(COOKIE, token, opcionesCookie(expiraEn));
  }

  /** Defensa CSRF adicional: los endpoints que usan la cookie exigen un header propio (fuerza preflight CORS). */
  private verificarCsrf(req: Request) {
    if (req.headers['x-requested-with'] !== 'EduLicencias') throw new ForbiddenException('Solicitud no permitida');
  }

  @Publico()
  @Throttle({ default: LIMITES.loginPorIp, email: LIMITES.loginPorEmail })
  @LimitePorEmail()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password, this.ctx(req));
    // Con segundo factor: todavía no hay sesión, solo un desafío de 5 minutos para el código.
    if ('requiere2fa' in r) return r;
    const { refreshToken, expiraEn, ...resto } = r;
    this.setCookie(res, refreshToken, expiraEn);
    return resto;
  }

  @Publico()
  @Throttle({ default: LIMITES.loginPorIp })
  @Post('login/2fa')
  @HttpCode(200)
  async loginSegundoFactor(@Body() dto: LoginSegundoFactorDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, expiraEn, ...resto } = await this.auth.loginSegundoFactor(dto.desafio, dto.codigo, this.ctx(req));
    this.setCookie(res, refreshToken, expiraEn);
    return resto;
  }

  /** Configuración del segundo factor: disponible aunque esté pendiente (es justamente lo que hay que resolver). */
  @PermiteCambioPendiente()
  @Throttle({ default: LIMITES.sesion })
  @Post('2fa/iniciar')
  @HttpCode(200)
  iniciarTotp(@ActorActual() actor: Actor) {
    return this.auth.iniciarTotp(actor);
  }

  @PermiteCambioPendiente()
  @Throttle({ default: LIMITES.loginPorIp })
  @Post('2fa/activar')
  @HttpCode(204)
  activarTotp(@ActorActual() actor: Actor, @Body() dto: CodigoTotpDto) {
    return this.auth.activarTotp(actor, dto.codigo);
  }

  @Throttle({ default: LIMITES.loginPorIp })
  @Post('2fa/desactivar')
  @HttpCode(204)
  desactivarTotp(@ActorActual() actor: Actor, @Body() dto: DesactivarTotpDto) {
    return this.auth.desactivarTotp(actor, dto.password, dto.codigo);
  }

  @Publico()
  @Throttle({ default: LIMITES.sesion })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verificarCsrf(req);
    const { refreshToken, expiraEn, ...resto } = await this.auth.refrescar(req.cookies?.[COOKIE], this.ctx(req));
    this.setCookie(res, refreshToken, expiraEn);
    return resto;
  }

  @Publico()
  @Throttle({ default: LIMITES.sesion })
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verificarCsrf(req);
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, opcionesCookie());
  }

  /** Cierra todas las sesiones del usuario e invalida de inmediato los access tokens emitidos. */
  @PermiteCambioPendiente()
  @Throttle({ default: LIMITES.sesion })
  @Post('logout-global')
  @HttpCode(204)
  async logoutGlobal(@ActorActual() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutGlobal(actor);
    res.clearCookie(COOKIE, opcionesCookie());
  }

  @PermiteCambioPendiente()
  @Get('me')
  me(@ActorActual() actor: Actor) {
    return this.auth.perfil(actor.usuarioId);
  }

  @PermiteCambioPendiente()
  @Post('cambiar-password')
  @HttpCode(204)
  cambiarPassword(@ActorActual() actor: Actor, @Body() dto: CambiarPasswordDto) {
    return this.auth.cambiarPassword(actor, dto.actual, dto.nueva);
  }
}
