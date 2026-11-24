import { isIP } from 'net';
import { z } from 'zod';

/**
 * Esquema del entorno (hallazgos 9, 10, 19, 31). Se valida al iniciar: una configuración insegura impide el arranque.
 */

/** Valores de ejemplo o de documentación que nunca deben usarse como secreto. */
export const SECRETOS_CONOCIDOS = ['cambiar-esto', 'changeme', 'change-me', 'secret', 'secreto', 'jwt-secret', 'your-secret', 'tu-secreto', 'edulicencias'];

const PALABRAS_PROXY = ['loopback', 'linklocal', 'uniquelocal'];

const booleano = (porDefecto: boolean) =>
  z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? porDefecto : v === 'true'));

/** Al menos 32 bytes aleatorios: 32+ caracteres, variedad mínima y ningún placeholder conocido. */
export function problemaSecreto(secreto: string): string | null {
  const s = secreto.trim();
  if (s.length < 32) return `debe tener al menos 32 caracteres (genere 32 bytes aleatorios: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`;
  const minus = s.toLowerCase();
  if (SECRETOS_CONOCIDOS.some((p) => minus.includes(p))) return 'contiene un valor de ejemplo conocido';
  if (new Set(s).size < 12) return 'no parece aleatorio (muy pocos caracteres distintos)';
  return null;
}

function origenValido(o: string) {
  try {
    const u = new URL(o);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === o;
  } catch {
    return false;
  }
}

/** Hallazgo 31: lista separada por comas, sin espacios ni entradas vacías; `*` no se admite. */
export const parsearOrigenes = (valor: string) => valor.split(',').map((s) => s.trim()).filter(Boolean);

function proxyValido(p: string) {
  if (PALABRAS_PROXY.includes(p)) return true;
  const [ip, prefijo] = p.split('/');
  const v = isIP(ip);
  if (!v) return false;
  if (prefijo === undefined) return true;
  const n = Number(prefijo);
  return Number.isInteger(n) && n >= 0 && n <= (v === 4 ? 32 : 128);
}

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1, 'es obligatoria'),
    JWT_ACCESS_SECRET: z.string({ error: 'es obligatoria' }).superRefine((v, ctx) => {
      const p = problemaSecreto(v);
      if (p) ctx.addIssue({ code: 'custom', message: p });
    }),
    JWT_ACCESS_TTL: z.string().regex(/^\d+[smh]$/, 'formato esperado: 15m, 900s, 1h').default('15m'),
    REFRESH_TTL_DIAS: z.coerce.number().int().min(1).max(90).default(7),
    COOKIE_SECURE: booleano(true),
    CORS_ORIGINS: z.string().optional(),
    /** Nombre anterior de CORS_ORIGINS; se acepta por compatibilidad. */
    CORS_ORIGIN: z.string().optional(),
    TRUSTED_PROXIES: z.string().optional(),
    REDIS_URL: z.string().optional(),
    STORAGE_DIR: z.string().default('./storage'),
    MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(10),
    /** Clave AES-256 (64 hex) para cifrar archivos y secretos de segundo factor. Obligatoria en producción. */
    CLAVE_CIFRADO: z.string().regex(/^[0-9a-fA-F]{64}$/, 'debe tener 64 caracteres hexadecimales (32 bytes aleatorios)').optional(),
    /** Antivirus (clamd). Obligatorio en producción: sin él, los archivos subidos no se escanean. */
    CLAMAV_HOST: z.string().optional(),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    /** Segundo factor obligatorio para ADMIN y SUPERVISOR. Por defecto: sí en producción, opcional en desarrollo. */
    EXIGIR_2FA: z.enum(['true', 'false']).optional(),
  })
  .transform((e, ctx) => {
    const origenes = parsearOrigenes(e.CORS_ORIGINS ?? e.CORS_ORIGIN ?? 'http://localhost:5173');
    if (!origenes.length) ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'debe indicar al menos un origen' });
    if (origenes.some((o) => o.includes('*'))) ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'no se admite "*" (indique los orígenes exactos)' });
    else for (const o of origenes) if (!origenValido(o)) ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: `origen inválido: ${o}` });

    const proxies = parsearOrigenes(e.TRUSTED_PROXIES ?? '');
    for (const p of proxies) if (!proxyValido(p)) ctx.addIssue({ code: 'custom', path: ['TRUSTED_PROXIES'], message: `IP o subred inválida: ${p}` });

    if (e.NODE_ENV === 'production') {
      // Hallazgo 9: en producción la cookie de sesión es siempre Secure.
      if (!e.COOKIE_SECURE) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'no puede ser false en producción' });
      // Hallazgo 19: los contadores de throttling se comparten entre réplicas.
      if (!e.REDIS_URL) ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'es obligatoria en producción (throttling compartido y tareas programadas)' });
      if (origenes.some((o) => o.startsWith('http://'))) ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'en producción los orígenes deben ser https' });
      if (!e.CLAVE_CIFRADO) ctx.addIssue({ code: 'custom', path: ['CLAVE_CIFRADO'], message: 'es obligatoria en producción (cifrado de archivos y del segundo factor)' });
      if (!e.CLAMAV_HOST) ctx.addIssue({ code: 'custom', path: ['CLAMAV_HOST'], message: 'es obligatorio en producción (antivirus de los archivos subidos)' });
      if (e.EXIGIR_2FA === 'false') ctx.addIssue({ code: 'custom', path: ['EXIGIR_2FA'], message: 'no puede desactivarse en producción' });
    }
    if (e.REDIS_URL) {
      try {
        const u = new URL(e.REDIS_URL);
        if (!['redis:', 'rediss:'].includes(u.protocol)) throw new Error();
        if (e.NODE_ENV === 'production' && !u.password) ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'debe incluir la contraseña de Redis' });
      } catch {
        ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'URL inválida (formato: redis://:contraseña@host:puerto)' });
      }
    }
    return {
      ...e, COOKIE_SECURE: e.NODE_ENV === 'production' ? true : e.COOKIE_SECURE, CORS_ORIGINS: origenes, TRUSTED_PROXIES: proxies,
      EXIGIR_2FA: e.EXIGIR_2FA === undefined ? e.NODE_ENV === 'production' : e.EXIGIR_2FA === 'true',
    };
  });

export type Entorno = z.output<typeof esquema>;

/** Valida el entorno. Lanza un error con todos los problemas encontrados (para ConfigModule.forRoot({ validate })). */
export function validarEntorno(config: Record<string, unknown>): Entorno {
  const r = esquema.safeParse(config);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join('.') || 'entorno'}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida; el servidor no se inicia:\n${detalle}`);
  }
  return r.data;
}

let cache: Entorno | null = null;
/** Entorno validado (se valida una vez por proceso). */
export const entorno = () => (cache ??= validarEntorno(process.env));
