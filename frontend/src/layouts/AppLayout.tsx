import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, BookOpen, CalendarDays, ClipboardCheck, FileBarChart, FileText, GraduationCap, Inbox, LayoutDashboard, LogOut,
  Menu, Repeat, ScrollText, Settings2, ShieldCheck, UserCircle, Users, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { NOMBRE_APP, PiePagina } from '@/components/Marca';
import { api } from '@/services/api';
import { P } from '@/utils/permisos';

interface Item { a: string; texto: string; icono: typeof Bell; permisos?: string[]; soloDocente?: boolean }
const SECCIONES: { titulo?: string; items: Item[] }[] = [
  {
    items: [
      { a: '/', texto: 'Panel principal', icono: LayoutDashboard },
      { a: '/mi-legajo', texto: 'Mi legajo', icono: UserCircle, soloDocente: true },
      { a: '/solicitudes', texto: 'Solicitudes', icono: FileText },
      { a: '/bandeja', texto: 'Bandeja de trámites', icono: Inbox, permisos: [P.LICENCIAS_REVISAR, P.AUTORIZACIONES_DECIDIR] },
      { a: '/calendario', texto: 'Calendario', icono: CalendarDays },
    ],
  },
  {
    titulo: 'Gestión',
    items: [
      { a: '/docentes', texto: 'Personal docente', icono: Users, permisos: [P.DOCENTES_VER] },
      { a: '/reemplazos', texto: 'Reemplazos', icono: Repeat, permisos: [P.REEMPLAZOS_VER, P.REEMPLAZOS_GESTIONAR] },
      { a: '/asistencia', texto: 'Asistencia', icono: ClipboardCheck, permisos: [P.ASISTENCIA_VER, P.ASISTENCIA_REGISTRAR] },
      { a: '/informes', texto: 'Informes', icono: FileBarChart, permisos: [P.REPORTES_VER] },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      { a: '/config/nomenclador', texto: 'Nomenclador (Ley 647-E)', icono: BookOpen, permisos: [P.NOMENCLADOR_GESTIONAR, P.CATALOGO_GESTIONAR] },
      { a: '/config/catalogo', texto: 'Catálogo de licencias', icono: BookOpen, permisos: [P.CATALOGO_GESTIONAR, P.CIRCUITOS_GESTIONAR] },
      { a: '/config/estructura', texto: 'Cargos y cursos', icono: GraduationCap, permisos: [P.CARGOS_GESTIONAR] },
      { a: '/config/usuarios', texto: 'Usuarios y roles', icono: ShieldCheck, permisos: [P.USUARIOS_GESTIONAR] },
      { a: '/config/auditoria', texto: 'Auditoría', icono: ScrollText, permisos: [P.AUDITORIA_VER] },
    ],
  },
];

export default function AppLayout() {
  const { usuario, logout, puede } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const navegar = useNavigate();
  const { data: contador } = useQuery({
    queryKey: ['notificaciones', 'contador'],
    queryFn: async () => (await api.get<{ sinLeer: number }>('/notificaciones/contador')).data,
    refetchInterval: 60_000,
  });

  const visible = (i: Item) => (i.soloDocente ? !!usuario?.docenteId : !i.permisos || puede(...i.permisos));

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Principal">
      {SECCIONES.map((s, idx) => {
        const items = s.items.filter(visible);
        if (!items.length) return null;
        return (
          <div key={idx}>
            {s.titulo && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-indigo-300/80">{s.titulo}</p>}
            <ul className="space-y-0.5">
              {items.map((i) => (
                <li key={i.a}>
                  <NavLink
                    to={i.a}
                    end={i.a === '/'}
                    onClick={() => setAbierto(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/15 text-white' : 'text-indigo-100 hover:bg-white/10 hover:text-white'}`
                    }
                  >
                    <i.icono className="size-4.5 shrink-0" aria-hidden /> {i.texto}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const lateral = (
    <div className="flex h-full flex-col bg-gradient-to-b from-marca-800 to-indigo-950">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-lg bg-white/15 text-white"><Settings2 className="size-5" aria-hidden /></div>
        <div>
          <p className="font-semibold leading-tight text-white">{NOMBRE_APP}</p>
          <p className="max-w-40 truncate text-xs text-indigo-200" title={usuario?.institucion.nombre}>{usuario?.institucion.nombre}</p>
        </div>
      </div>
      {nav}
    </div>
  );

  return (
    <div className="min-h-dvh">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Saltar al contenido</a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{lateral}</aside>
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setAbierto(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{lateral}</div>
          <button className="absolute left-66 top-4 rounded bg-white p-1" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X className="size-5" /></button>
        </div>
      )}
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setAbierto(true)} aria-label="Abrir menú"><Menu className="size-5" /></button>
          <div className="flex-1" />
          <button onClick={() => navegar('/notificaciones')} className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label={`Notificaciones${contador?.sinLeer ? `: ${contador.sinLeer} sin leer` : ''}`}>
            <Bell className="size-5" />
            {!!contador?.sinLeer && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{contador.sinLeer > 99 ? '99+' : contador.sinLeer}</span>}
          </button>
          <NavLink to="/perfil" className="hidden text-right sm:block">
            <p className="text-sm font-medium text-slate-800">{usuario?.nombre} {usuario?.apellido}</p>
            <p className="text-xs text-slate-500">{usuario?.roles.map((r) => r.nombre).join(', ')}</p>
          </NavLink>
          <button onClick={logout} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut className="size-5" /></button>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
        <PiePagina className="border-t border-slate-200" />
      </div>
    </div>
  );
}
