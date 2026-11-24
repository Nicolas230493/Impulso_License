import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { Entorno } from '../config/entorno';

/**
 * Throttling (hallazgos 19 y 32).
 * - Contadores en Redis para compartirlos entre réplicas (en memoria solo si no hay REDIS_URL, fuera de producción).
 * - Límite doble en el login: por IP (throttler "default") y por cuenta (throttler "email"). El de cuenta no depende de
 *   la IP, así que rotar `X-Forwarded-For` no lo evita.
 */

export const LIMITE_POR_EMAIL = 'limitePorEmail';
/** Activa el límite por cuenta (email del cuerpo) en el handler. */
export const LimitePorEmail = () => SetMetadata(LIMITE_POR_EMAIL, true);

export const LIMITES = {
  general: { ttl: 60_000, limit: 300 },
  loginPorIp: { ttl: 60_000, limit: 10 },
  loginPorEmail: { ttl: 15 * 60_000, limit: 10 },
  sesion: { ttl: 60_000, limit: 30 },
};

const limitePorEmailActivo = (ctx: ExecutionContext) =>
  !!Reflect.getMetadata(LIMITE_POR_EMAIL, ctx.getHandler()) || !!Reflect.getMetadata(LIMITE_POR_EMAIL, ctx.getClass());

export const normalizarEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

export function opcionesThrottler(e: Entorno): ThrottlerModuleOptions {
  return {
    storage: e.REDIS_URL ? new ThrottlerStorageRedisService(new Redis(e.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 })) : undefined,
    throttlers: [
      { name: 'default', ...LIMITES.general },
      {
        name: 'email',
        ...LIMITES.loginPorEmail,
        skipIf: (ctx) => !limitePorEmailActivo(ctx),
        // La clave es la cuenta, no la IP. Sin email válido se cuenta bajo una clave común (no se evita el límite).
        getTracker: (req) => `cuenta:${normalizarEmail(req.body?.email) || 'sin-email'}`,
      },
    ],
  };
}
