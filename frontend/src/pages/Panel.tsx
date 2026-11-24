import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Plus, Repeat, UserCheck, Users, UserX } from 'lucide-react';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { Boton, Cargando, Encabezado, Insignia, Tarjeta, Vacio } from '@/components/ui';
import { fecha } from '@/utils/formato';
import { P } from '@/utils/permisos';

interface PanelDatos {
  institucional: boolean;
  totalDocentes?: number; docentesActivos?: number; docentesConLicencia?: number; reemplazosActivos?: number;
  solicitudesPendientes: number; solicitudesObservadas: number; licenciasAutorizadas: number; enLicencia?: boolean;
  proximasReincorporaciones: { solicitudId: string; numero: string; docente: { apellido: string; nombre: string }; fechaHasta: string; reincorporacion: string; vencida: boolean; tipo: string }[];
}

function Indicador({ titulo, valor, icono: Icono, color, a }: { titulo: string; valor?: number; icono: typeof Users; color: string; a?: string }) {
  const cuerpo = (
    <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-marca-600/40">
      <div className={`grid size-11 shrink-0 place-items-center rounded-lg ${color}`}><Icono className="size-5" aria-hidden /></div>
      <div>
        <p className="text-2xl font-semibold text-slate-900">{valor ?? '—'}</p>
        <p className="text-sm text-slate-500">{titulo}</p>
      </div>
    </div>
  );
  return a ? <Link to={a}>{cuerpo}</Link> : cuerpo;
}

export default function Panel() {
  const { usuario, puede } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['panel'], queryFn: async () => (await api.get<PanelDatos>('/reportes/panel')).data });
  if (isLoading || !data) return <Cargando />;

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario?.nombre}`}
        subtitulo={new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        acciones={puede(P.LICENCIAS_SOLICITAR, P.LICENCIAS_CARGAR) && <Link to="/solicitudes/nueva"><Boton><Plus className="size-4" /> Nueva solicitud</Boton></Link>}
      />
      {!data.institucional && data.enLicencia && <div className="mb-6"><Insignia color="bg-emerald-50 text-emerald-800 ring-emerald-300">Actualmente se encuentra en uso de licencia</Insignia></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.institucional && (
          <>
            <Indicador titulo="Total de docentes" valor={data.totalDocentes} icono={Users} color="bg-slate-100 text-slate-700" a={puede(P.DOCENTES_VER) ? '/docentes' : undefined} />
            <Indicador titulo="Docentes activos" valor={data.docentesActivos} icono={UserCheck} color="bg-emerald-100 text-emerald-700" />
            <Indicador titulo="Docentes con licencia hoy" valor={data.docentesConLicencia} icono={UserX} color="bg-orange-100 text-orange-700" a="/calendario" />
            <Indicador titulo="Reemplazos activos" valor={data.reemplazosActivos} icono={Repeat} color="bg-sky-100 text-sky-700" a={puede(P.REEMPLAZOS_VER, P.REEMPLAZOS_GESTIONAR) ? '/reemplazos' : undefined} />
          </>
        )}
        <Indicador titulo="Solicitudes pendientes" valor={data.solicitudesPendientes} icono={ClipboardList} color="bg-amber-100 text-amber-700" a={puede(P.LICENCIAS_REVISAR, P.AUTORIZACIONES_DECIDIR) ? '/bandeja' : '/solicitudes?estado=PENDIENTE'} />
        <Indicador titulo="Solicitudes observadas" valor={data.solicitudesObservadas} icono={AlertTriangle} color="bg-red-100 text-red-700" a="/solicitudes?estado=OBSERVADA" />
        <Indicador titulo="Licencias autorizadas en curso" valor={data.licenciasAutorizadas} icono={CheckCircle2} color="bg-indigo-100 text-indigo-700" a="/solicitudes?estado=AUTORIZADA" />
      </div>

      <Tarjeta className="mt-6" titulo={<span className="flex items-center gap-2"><CalendarClock className="size-4" /> Próximas reincorporaciones</span>} sinPadding>
        {data.proximasReincorporaciones.length ? (
          <ul className="divide-y divide-slate-100">
            {data.proximasReincorporaciones.map((r) => (
              <li key={r.solicitudId}>
                <Link to={`/solicitudes/${r.solicitudId}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{r.docente.apellido}, {r.docente.nombre}</p>
                    <p className="text-xs text-slate-500">{r.numero} · {r.tipo} · finaliza {fecha(r.fechaHasta)}</p>
                  </div>
                  {r.vencida
                    ? <Insignia color="bg-red-50 text-red-700 ring-red-300">Reincorporación sin registrar</Insignia>
                    : <Insignia color="bg-sky-50 text-sky-700 ring-sky-300">Se reincorpora el {fecha(r.reincorporacion)}</Insignia>}
                </Link>
              </li>
            ))}
          </ul>
        ) : <Vacio texto="No hay reincorporaciones próximas." />}
      </Tarjeta>
    </>
  );
}
