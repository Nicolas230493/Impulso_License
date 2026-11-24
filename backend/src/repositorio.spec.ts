/** Hallazgos de configuración del repositorio (Fase 5: 27, 28, 29, 30) y de infraestructura (6, 8). */
import { readFileSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '../..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');

describe('configuración del repositorio', () => {
  it('[27] el frontend servido (preview y nginx) tiene CSP estricta y Referrer-Policy', () => {
    for (const f of ['frontend/vite.config.ts', 'deploy/nginx/edulicencias.conf']) {
      const s = leer(f);
      for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", 'strict-origin-when-cross-origin']) expect({ f, d, ok: s.includes(d) }).toEqual({ f, d, ok: true });
    }
  });

  it('[28] .gitignore ignora todo .env* salvo los ejemplos', () => {
    const lineas = leer('.gitignore').split(/\r?\n/).map((l) => l.trim());
    expect(lineas).toContain('.env*');
    expect(lineas).toContain('!.env.example');
  });

  it('[29] sin allowScripts en package.json ni la instrucción en el README; CI instala con --ignore-scripts', () => {
    for (const f of ['backend/package.json', 'frontend/package.json']) expect(JSON.parse(leer(f)).allowScripts).toBeUndefined();
    expect(leer('README.md')).not.toMatch(/install-scripts approve/);
    const ci = leer('.github/workflows/ci.yml');
    expect(ci.match(/run: npm ci --ignore-scripts/g)?.length).toBe(2);
    expect(ci).toMatch(/npm audit --audit-level=high/);
  });

  it('[5] el README no publica contraseñas', () => {
    expect(leer('README.md')).not.toMatch(/EduLicencias2026/);
  });

  it('[30] el frontend descarga los blobs (no abre blob: en una pestaña)', () => {
    const api = leer('frontend/src/services/api.ts');
    expect(api).toMatch(/a\.download\s*=/);
    expect(api).not.toMatch(/window\.open/);
  });

  it('[6][8] docker-compose: sin puertos en la base, loopback en desarrollo, Redis con contraseña y credenciales por entorno', () => {
    const base = leer('docker-compose.yml');
    expect(base).not.toMatch(/^\s*ports:/m);
    expect(base).toMatch(/--requirepass/);
    expect(base).not.toMatch(/POSTGRES_PASSWORD:\s*edulicencias/);
    const dev = leer('docker-compose.override.yml');
    for (const p of dev.match(/- "([^"]+)"/g) ?? []) expect(p).toMatch(/"127\.0\.0\.1:/);
  });
});
