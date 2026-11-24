import { ExecutionContext } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';
import { AuthController } from '../modules/auth/auth.controller';
import { opcionesThrottler } from './throttling';

const e = { REDIS_URL: undefined } as never;
const throttlers = (opcionesThrottler(e) as { throttlers: ThrottlerOptions[] }).throttlers;
const porEmail = throttlers.find((t) => t.name === 'email')!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (handler: (...a: any[]) => unknown) => ({ getHandler: () => handler, getClass: () => AuthController }) as unknown as ExecutionContext;

describe('throttling por cuenta (hallazgos 19 y 32)', () => {
  it('el límite por cuenta usa el email, no la IP ni X-Forwarded-For', async () => {
    const a = await porEmail.getTracker!({ ip: '1.1.1.1', headers: { 'x-forwarded-for': '9.9.9.9' }, body: { email: ' Laura@Demo.edu.ar ' } }, {} as never);
    const b = await porEmail.getTracker!({ ip: '2.2.2.2', headers: { 'x-forwarded-for': '8.8.8.8' }, body: { email: 'laura@demo.edu.ar' } }, {} as never);
    expect(a).toBe(b);
  });

  it('solo aplica al login', () => {
    expect(porEmail.skipIf!(ctx(AuthController.prototype.login))).toBe(false);
    expect(porEmail.skipIf!(ctx(AuthController.prototype.me))).toBe(true);
  });

  it('refresh y logout tienen límite propio', () => {
    for (const h of [AuthController.prototype.refresh, AuthController.prototype.logout, AuthController.prototype.logoutGlobal]) {
      expect(Reflect.getMetadataKeys(h).some((k: string) => String(k).startsWith('THROTTLER:LIMIT'))).toBe(true);
    }
  });
});
