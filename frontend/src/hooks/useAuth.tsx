import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import { api, onSesionExpirada, refrescarSesion, setAccessToken } from '@/services/api';
import type { Perfil } from '@/types';
import { useQueryClient } from '@tanstack/react-query';

interface AuthCtx {
  usuario: Perfil | null;
  cargando: boolean;
  /** Devuelve el desafío si la cuenta usa verificación en dos pasos (falta el código). */
  login: (email: string, password: string) => Promise<{ desafio: string } | null>;
  loginSegundoFactor: (desafio: string, codigo: string) => Promise<void>;
  /** Vuelve a leer el perfil (p. ej. después de activar la verificación en dos pasos). */
  recargar: () => Promise<void>;
  logout: () => Promise<void>;
  puede: (...permisos: string[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    onSesionExpirada(() => { setUsuario(null); qc.clear(); });
    // Restaurar la sesión a partir de la cookie de refresco.
    refrescarSesion()
      .then(async (t) => { if (t) setUsuario((await api.get<Perfil>('/auth/me')).data); })
      .finally(() => setCargando(false));
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await axios.post('/api/auth/login', { email, password }, { withCredentials: true });
    if (r.data.requiere2fa) return { desafio: r.data.desafio as string };
    setAccessToken(r.data.accessToken);
    setUsuario(r.data.usuario);
    return null;
  }, []);

  const loginSegundoFactor = useCallback(async (desafio: string, codigo: string) => {
    const r = await axios.post('/api/auth/login/2fa', { desafio, codigo }, { withCredentials: true });
    setAccessToken(r.data.accessToken);
    setUsuario(r.data.usuario);
  }, []);

  const recargar = useCallback(async () => {
    setUsuario((await api.get<Perfil>('/auth/me')).data);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUsuario(null);
    qc.clear();
  }, [qc]);

  const puede = useCallback((...permisos: string[]) => !!usuario && permisos.some((p) => usuario.permisos.includes(p)), [usuario]);

  const valor = useMemo(() => ({ usuario, cargando, login, loginSegundoFactor, recargar, logout, puede }), [usuario, cargando, login, loginSegundoFactor, recargar, logout, puede]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}
