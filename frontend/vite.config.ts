import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Cabeceras de seguridad del frontend (hallazgo 27). En producción las sirve el proxy/servidor web
 * (ver deploy/nginx/edulicencias.conf); acá se aplican a `vite preview` para probar el build con la misma política.
 * En `vite dev` no se aplica la CSP estricta porque el HMR inyecta scripts inline.
 */
export const CABECERAS_SEGURIDAD = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Mismo origen en desarrollo: la cookie de sesión (path /api/auth) funciona sin CORS.
    proxy: { '/api': 'http://localhost:3000' },
    headers: { 'Referrer-Policy': CABECERAS_SEGURIDAD['Referrer-Policy'], 'X-Content-Type-Options': 'nosniff' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:3000' },
    headers: CABECERAS_SEGURIDAD,
  },
});
