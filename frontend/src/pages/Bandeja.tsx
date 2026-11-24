import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { SolicitudResumen } from '@/types';
import { Cargando, Encabezado, Tabla, Tarjeta } from '@/components/ui';
import { EstadoSolicitudBadge } from '@/components/Estados';
import { CATEGORIA, fecha, fechaHora } from '@/utils/formato';

type ConPaso = SolicitudResumen & { paso: { nombre: string } | null };

export default function Bandeja() {
  const navegar = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['bandeja'], queryFn: async () => (await api.get<{ pendientes: SolicitudResumen[]; enRevision: ConPaso[]; esperandoInstrumento?: SolicitudResumen[] }>('/autorizaciones/bandeja')).data, refetchInterval: 60_000 });
  if (isLoading || !data) return <Cargando />;

  const columnas = (conPaso: boolean) => [
    { titulo: 'Número', celda: (s: ConPaso) => <span className="whitespace-nowrap font-mono text-xs">{s.numero}</span> },
    { titulo: 'Docente', celda: (s: ConPaso) => <span className="font-medium text-slate-900">{s.docente.apellido}, {s.docente.nombre}</span> },
    { titulo: 'Tipo', celda: (s: ConPaso) => <>{s.tipoLicencia.nombre}<p className="text-xs text-slate-500">{CATEGORIA[s.tipoLicencia.categoria]}</p></> },
    { titulo: 'Período', celda: (s: ConPaso) => <span className="whitespace-nowrap">{fecha(s.fechaDesde)} – {fecha(s.fechaHasta)}</span> },
    { titulo: 'Presentada', celda: (s: ConPaso) => fechaHora(s.fechaSolicitud) },
    conPaso ? { titulo: 'Paso', celda: (s: ConPaso) => s.paso?.nombre } : { titulo: 'Estado', celda: (s: ConPaso) => <EstadoSolicitudBadge estado={s.estado} /> },
  ];

  return (
    <>
      <Encabezado titulo="Bandeja de trámites" subtitulo="Solicitudes que requieren su intervención" />
      <div className="space-y-6">
        <Tarjeta titulo={`Esperando su decisión (${data.enRevision.length})`} sinPadding>
          <Tabla filas={data.enRevision} clave={(s) => s.id} alClick={(s) => navegar(`/solicitudes/${s.id}`)} columnas={columnas(true)} vacio="No hay solicitudes esperando su decisión" />
        </Tarjeta>
        <Tarjeta titulo={`Pendientes de recepción (${data.pendientes.length})`} sinPadding>
          <Tabla filas={data.pendientes as ConPaso[]} clave={(s) => s.id} alClick={(s) => navegar(`/solicitudes/${s.id}`)} columnas={columnas(false)} vacio="No hay solicitudes pendientes de recepción" />
        </Tarjeta>
        {!!data.esperandoInstrumento?.length && (
          <Tarjeta titulo={`Esperando dictamen o resolución (${data.esperandoInstrumento.length})`} sinPadding>
            <Tabla filas={data.esperandoInstrumento as ConPaso[]} clave={(s) => s.id} alClick={(s) => navegar(`/solicitudes/${s.id}`)} columnas={columnas(false)} />
          </Tarjeta>
        )}
      </div>
    </>
  );
}
