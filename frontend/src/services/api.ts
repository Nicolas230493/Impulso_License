import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

/**
 * Cliente HTTP. El access token vive solo en memoria (no en localStorage, para reducir el impacto de XSS);
 * la sesión se renueva con una cookie httpOnly + SameSite=Strict mediante /auth/refresh.
 */
let accessToken: string | null = null;
let alExpirar: (() => void) | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const onSesionExpirada = (fn: () => void) => { alExpirar = fn; };

export const api = axios.create({ baseURL: '/api', withCredentials: true, headers: { 'X-Requested-With': 'EduLicencias' } });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refrescando: Promise<string | null> | null = null;
const pedirRefresh = () => axios.post('/api/auth/refresh', null, { withCredentials: true, headers: { 'X-Requested-With': 'EduLicencias' } });
export function refrescarSesion(): Promise<string | null> {
  // Las pestañas se turnan para renovar (Web Locks): la siguiente ya envía la cookie que dejó la anterior.
  refrescando ??= (navigator.locks ? (navigator.locks.request('impulso-license-refresh', pedirRefresh) as unknown as Promise<AxiosResponse>) : pedirRefresh())
    .then((r) => { setAccessToken(r.data.accessToken); return r.data.accessToken as string; })
    .catch(() => { setAccessToken(null); return null; })
    .finally(() => { refrescando = null; });
  return refrescando;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _reintento?: boolean }) | undefined;
  if (error.response?.status === 401 && original && !original._reintento && !original.url?.startsWith('/auth/')) {
    original._reintento = true;
    const token = await refrescarSesion();
    if (token) return api(original);
    alExpirar?.();
  }
  return Promise.reject(error);
});

/** Extrae un mensaje legible (o la lista de errores de negocio) de una respuesta de error. */
export function mensajesError(e: unknown): string[] {
  const data = (e as AxiosError<{ message?: string | string[]; errores?: string[] }>)?.response?.data;
  if (data?.errores?.length) return data.errores;
  if (Array.isArray(data?.message)) return data.message;
  if (data?.message) return [data.message];
  return ['No se pudo completar la operación. Intente nuevamente.'];
}

/** ¿El error es un conflicto de concurrencia (otra persona modificó el registro)? */
export const esConflicto = (e: unknown) => (e as AxiosError)?.response?.status === 409;

/**
 * Descarga un recurso protegido (archivo o informe) con el token actual.
 * Siempre como descarga (hallazgo 30): nunca se abre un `blob:` en una pestaña, porque heredaría el origen de la app.
 */
export async function descargar(url: string, nombre?: string) {
  const r = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = nombre ?? 'archivo';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
