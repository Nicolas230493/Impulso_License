import { spawnSync } from 'child_process';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';
import { ArchivosController } from '../modules/archivos/archivos.controller';

describe('errores de base de datos sin detalles del esquema (hallazgo 20)', () => {
  it('P2002 devuelve "El registro ya existe" sin columnas ni índices', () => {
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };
    const e = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x', meta: { target: ['email', 'usuarios_email_key'] } });
    new PrismaExceptionFilter().catch(e, host as never);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ statusCode: 409, message: 'El registro ya existe' });
    expect(JSON.stringify(json.mock.calls)).not.toMatch(/email|usuarios_email_key/);
  });
});

describe('descarga de archivos (hallazgo 24)', () => {
  it('siempre attachment y en sandbox', async () => {
    const set = jest.fn();
    const svc = { abrir: jest.fn().mockResolvedValue({ archivo: { mimeType: 'application/pdf', nombreOriginal: 'a b.pdf' }, contenido: Buffer.from('%PDF-1.4') }) };
    await new ArchivosController(svc as never).descargar({} as never, 'id', { set } as never);
    const h = set.mock.calls[0][0];
    expect(h['Content-Disposition']).toMatch(/^attachment;/);
    expect(h['Content-Security-Policy']).toMatch(/sandbox/);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('seed con credenciales de demostración (hallazgo 5)', () => {
  const correr = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', join(__dirname, '../../prisma/seed.ts')], {
      env: { ...process.env, ...env, DATABASE_URL: 'postgresql://nadie:nada@127.0.0.1:1/nada' },
      encoding: 'utf8',
      timeout: 60_000,
    });

  it.each(['production', 'staging', ''])('NODE_ENV=%s aborta con error sin crear usuarios', (nodeEnv) => {
    const r = correr({ NODE_ENV: nodeEnv });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/solo corre con NODE_ENV=development o test/);
  }, 60_000);

  it('rechaza una SEED_ADMIN_PASSWORD que no cumple la política', () => {
    const r = correr({ NODE_ENV: 'test', SEED_ADMIN_PASSWORD: 'corta' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/SEED_ADMIN_PASSWORD no cumple/);
  }, 60_000);
});
