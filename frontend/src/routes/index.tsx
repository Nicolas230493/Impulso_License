import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/layouts/AppLayout';
import { Cargando, Vacio } from '@/components/ui';
import { P } from '@/utils/permisos';

const Login = lazy(() => import('@/pages/Login'));
const Panel = lazy(() => import('@/pages/Panel'));
const DocentesLista = lazy(() => import('@/pages/docentes/DocentesLista'));
const DocenteForm = lazy(() => import('@/pages/docentes/DocenteForm'));
const DocenteDetalle = lazy(() => import('@/pages/docentes/DocenteDetalle'));
const MiLegajo = lazy(() => import('@/pages/docentes/MiLegajo'));
const SolicitudesLista = lazy(() => import('@/pages/solicitudes/SolicitudesLista'));
const SolicitudForm = lazy(() => import('@/pages/solicitudes/SolicitudForm'));
const SolicitudDetalle = lazy(() => import('@/pages/solicitudes/SolicitudDetalle'));
const Bandeja = lazy(() => import('@/pages/Bandeja'));
const Calendario = lazy(() => import('@/pages/Calendario'));
const ReemplazosLista = lazy(() => import('@/pages/reemplazos/ReemplazosLista'));
const ReemplazoForm = lazy(() => import('@/pages/reemplazos/ReemplazoForm'));
const Asistencia = lazy(() => import('@/pages/Asistencia'));
const Informes = lazy(() => import('@/pages/Informes'));
const Notificaciones = lazy(() => import('@/pages/Notificaciones'));
const Perfil = lazy(() => import('@/pages/Perfil'));
const Catalogo = lazy(() => import('@/pages/admin/Catalogo'));
const Estructura = lazy(() => import('@/pages/admin/Estructura'));
const Usuarios = lazy(() => import('@/pages/admin/Usuarios'));
const Auditoria = lazy(() => import('@/pages/admin/Auditoria'));
const NomencladorAdmin = lazy(() => import('@/pages/admin/NomencladorAdmin'));

function RequiereSesion() {
  const { usuario, cargando } = useAuth();
  const loc = useLocation();
  if (cargando) return <Cargando texto="Iniciando sesión…" />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: loc.pathname }} />;
  // Usuarios con contraseña inicial o reseteada deben cambiarla antes de continuar.
  // Lo mismo si su rol exige verificación en dos pasos y todavía no la configuró.
  if ((usuario.debeCambiarPassword || usuario.debeConfigurar2fa) && loc.pathname !== '/perfil') return <Navigate to="/perfil" replace />;
  return <Outlet />;
}

/** Oculta rutas sin permiso. La autorización real siempre la aplica el backend. */
function Con({ permisos, children }: { permisos: string[]; children: ReactNode }) {
  const { puede } = useAuth();
  return puede(...permisos) ? <>{children}</> : <Vacio texto="No tiene permisos para acceder a esta sección." />;
}

const s = (el: ReactNode) => <Suspense fallback={<Cargando />}>{el}</Suspense>;

export const router = createBrowserRouter([
  { path: '/login', element: s(<Login />) },
  {
    element: <RequiereSesion />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: s(<Panel />) },
          { path: 'mi-legajo', element: s(<MiLegajo />) },
          { path: 'perfil', element: s(<Perfil />) },
          { path: 'notificaciones', element: s(<Notificaciones />) },
          { path: 'calendario', element: s(<Calendario />) },
          { path: 'solicitudes', element: s(<SolicitudesLista />) },
          { path: 'solicitudes/nueva', element: s(<Con permisos={[P.LICENCIAS_SOLICITAR, P.LICENCIAS_CARGAR]}><SolicitudForm /></Con>) },
          { path: 'solicitudes/:id', element: s(<SolicitudDetalle />) },
          { path: 'solicitudes/:id/editar', element: s(<SolicitudForm />) },
          { path: 'bandeja', element: s(<Con permisos={[P.LICENCIAS_REVISAR, P.AUTORIZACIONES_DECIDIR]}><Bandeja /></Con>) },
          { path: 'docentes', element: s(<Con permisos={[P.DOCENTES_VER]}><DocentesLista /></Con>) },
          { path: 'docentes/nuevo', element: s(<Con permisos={[P.DOCENTES_GESTIONAR]}><DocenteForm /></Con>) },
          { path: 'docentes/:id', element: s(<DocenteDetalle />) },
          { path: 'docentes/:id/editar', element: s(<Con permisos={[P.DOCENTES_GESTIONAR]}><DocenteForm /></Con>) },
          { path: 'reemplazos', element: s(<Con permisos={[P.REEMPLAZOS_VER, P.REEMPLAZOS_GESTIONAR]}><ReemplazosLista /></Con>) },
          { path: 'reemplazos/nuevo', element: s(<Con permisos={[P.REEMPLAZOS_GESTIONAR]}><ReemplazoForm /></Con>) },
          { path: 'asistencia', element: s(<Con permisos={[P.ASISTENCIA_VER, P.ASISTENCIA_REGISTRAR]}><Asistencia /></Con>) },
          { path: 'informes', element: s(<Con permisos={[P.REPORTES_VER]}><Informes /></Con>) },
          { path: 'config/catalogo', element: s(<Con permisos={[P.CATALOGO_GESTIONAR, P.CIRCUITOS_GESTIONAR]}><Catalogo /></Con>) },
          { path: 'config/nomenclador', element: s(<Con permisos={[P.NOMENCLADOR_GESTIONAR, P.CATALOGO_GESTIONAR]}><NomencladorAdmin /></Con>) },
          { path: 'config/estructura', element: s(<Con permisos={[P.CARGOS_GESTIONAR]}><Estructura /></Con>) },
          { path: 'config/usuarios', element: s(<Con permisos={[P.USUARIOS_GESTIONAR, P.ROLES_GESTIONAR]}><Usuarios /></Con>) },
          { path: 'config/auditoria', element: s(<Con permisos={[P.AUDITORIA_VER]}><Auditoria /></Con>) },
          { path: '*', element: <Vacio texto="Página no encontrada." /> },
        ],
      },
    ],
  },
]);
