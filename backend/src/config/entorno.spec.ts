import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { parsearOrigenes, problemaSecreto, validarEntorno } from './entorno';

const SECRETO = 'f3a9c1e7b2d84f6a0c5e9d17b4f8a63c5e0d2b9f7a1c4e8d';
const base = { DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: SECRETO, CORS_ORIGINS: 'http://localhost:5173' };
const prod = {
  ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.edu.ar', REDIS_URL: 'redis://:clave@redis:6379', COOKIE_SECURE: 'true',
  CLAVE_CIFRADO: 'a'.repeat(64), CLAMAV_HOST: 'clamav',
};

describe('validación del entorno al arrancar (hallazgos 9, 10, 19, 31)', () => {
  it('acepta una configuración correcta', () => {
    const e = validarEntorno(prod);
    expect(e.COOKIE_SECURE).toBe(true);
    expect(e.CORS_ORIGINS).toEqual(['https://app.edu.ar']);
  });

  it.each(['cambiar-esto', 'corto', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'cambiar-esto-cambiar-esto-cambiar-esto-1234'])('[10] rechaza JWT_ACCESS_SECRET débil: %s', (s) => {
    expect(() => validarEntorno({ ...base, JWT_ACCESS_SECRET: s })).toThrow(/JWT_ACCESS_SECRET/);
  });
  it('[10] exige JWT_ACCESS_SECRET', () => {
    expect(() => validarEntorno({ DATABASE_URL: 'x' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(problemaSecreto(SECRETO)).toBeNull();
  });

  it('[9] COOKIE_SECURE=false en producción impide el arranque', () => {
    expect(() => validarEntorno({ ...prod, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });
  it('[9] en desarrollo se permite false y por defecto es true', () => {
    expect(validarEntorno({ ...base, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(validarEntorno(base).COOKIE_SECURE).toBe(true);
  });

  it('[19] REDIS_URL es obligatoria en producción y con contraseña', () => {
    expect(() => validarEntorno({ ...prod, REDIS_URL: undefined })).toThrow(/REDIS_URL/);
    expect(() => validarEntorno({ ...prod, REDIS_URL: 'redis://redis:6379' })).toThrow(/contraseña/);
  });
  it('[19] TRUSTED_PROXIES acepta IPs, subredes y palabras clave, y rechaza basura', () => {
    expect(validarEntorno({ ...base, TRUSTED_PROXIES: '10.0.0.5, 172.18.0.0/16,loopback' }).TRUSTED_PROXIES).toEqual(['10.0.0.5', '172.18.0.0/16', 'loopback']);
    expect(() => validarEntorno({ ...base, TRUSTED_PROXIES: '1' })).toThrow(/TRUSTED_PROXIES/);
  });

  it('[31] CORS_ORIGINS se normaliza y no admite "*"', () => {
    expect(parsearOrigenes(' http://a.com , ,http://b.com ')).toEqual(['http://a.com', 'http://b.com']);
    expect(validarEntorno({ ...base, CORS_ORIGINS: 'http://a.com, http://b.com' }).CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
    expect(() => validarEntorno({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => validarEntorno({ ...base, CORS_ORIGINS: 'http://a.com,*' })).toThrow(/CORS_ORIGINS/);
    expect(() => validarEntorno({ ...base, CORS_ORIGINS: 'http://a.com/ruta' })).toThrow(/origen inválido/);
  });

  it('en producción exige cifrado, antivirus y segundo factor', () => {
    expect(() => validarEntorno({ ...prod, CLAVE_CIFRADO: undefined })).toThrow(/CLAVE_CIFRADO/);
    expect(() => validarEntorno({ ...prod, CLAVE_CIFRADO: 'corta' })).toThrow(/CLAVE_CIFRADO/);
    expect(() => validarEntorno({ ...prod, CLAMAV_HOST: undefined })).toThrow(/CLAMAV_HOST/);
    expect(() => validarEntorno({ ...prod, EXIGIR_2FA: 'false' })).toThrow(/EXIGIR_2FA/);
    expect(validarEntorno(prod).EXIGIR_2FA).toBe(true);
    expect(validarEntorno(base).EXIGIR_2FA).toBe(false);
    expect(validarEntorno({ ...base, EXIGIR_2FA: 'true' }).EXIGIR_2FA).toBe(true);
  });

  it('el módulo de configuración no levanta con un entorno inseguro', async () => {
    const previo = { ...process.env };
    try {
      Object.assign(process.env, { ...prod, JWT_ACCESS_SECRET: 'cambiar-esto' });
      await expect(
        (async () => Test.createTestingModule({ imports: [ConfigModule.forRoot({ ignoreEnvFile: true, validate: validarEntorno })] }).compile())(),
      ).rejects.toThrow(/Configuración inválida/);
    } finally {
      process.env = previo;
    }
  });
});
