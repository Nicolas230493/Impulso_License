import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { EstadoSolicitud, Paginado, SolicitudResumen } from '@/types';
import { Boton, Cargando, Encabezado, Input, Paginacion, Select, Tabla, Tarjeta } from '@/components/ui';
import { EstadoSolicitudBadge } from '@/components/Estados';
import { CATEGORIA, ESTADO_SOLICITUD, fecha } from '@/utils/formato';
import { P } from '@/utils/permisos';

export default function SolicitudesLista() {
  const { puede } = useAuth();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [buscar, setBuscar] = useState('');
  const estado = (params.get('estado') ?? '') as EstadoSolicitud | '';
  const pagina = Number(params.get('pagina') ?? 1);
  const todas = puede(P.LICENCIAS_VER_TODAS);

  const { data, isLoading } = useQuery({
    queryKey: ['solicitudes', buscar, estado, pagina],
    queryFn: async () => (await api.get<Paginado<SolicitudResumen>>('/solicitudes', { params: { buscar: buscar || undefined, estado: estado || undefined, pagina } })).data,
    placeholderData: keepPreviousData,
  });
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'pagina') p.delete('pagina'); setParams(p); };

  return (
    <>
      <Encabezado titulo={todas ? 'Solicitudes de licencia' : 'Mis solicitudes'}
        acciones={puede(P.LICENCIAS_SOLICITAR, P.LICENCIAS_CARGAR) && <Link to="/solicitudes/nueva"><Boton><Plus className="size-4" /> Nueva solicitud</Boton></Link>} />
      <Tarjeta sinPadding>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          {todas && (
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
              <Input className="pl-9" placeholder="Número, apellido o DNI" aria-label="Buscar" value={buscar} onChange={(e) => { setBuscar(e.target.value); set('pagina', ''); }} />
            </div>
          )}
          <Select className="w-48" aria-label="Estado" value={estado} onChange={(e) => set('estado', e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_SOLICITUD).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </Select>
        </div>
        {isLoading || !data ? <Cargando /> : (
          <>
            <Tabla
              filas={data.items}
              clave={(s) => s.id}
              alClick={(s) => navegar(`/solicitudes/${s.id}`)}
              vacio="No hay solicitudes"
              columnas={[
                { titulo: 'Número', celda: (s) => <span className="whitespace-nowrap font-mono text-xs">{s.numero}</span> },
                ...(todas ? [{ titulo: 'Docente', celda: (s: SolicitudResumen) => <span className="font-medium text-slate-900">{s.docente.apellido}, {s.docente.nombre}</span> }] : []),
                { titulo: 'Tipo', celda: (s) => <>{s.tipoLicencia.nombre}<p className="text-xs text-slate-500">{CATEGORIA[s.tipoLicencia.categoria]}</p></> },
                { titulo: 'Período', celda: (s) => <span className="whitespace-nowrap">{fecha(s.fechaDesde)} – {fecha(s.fechaHasta)}</span> },
                { titulo: 'Días', celda: (s) => s.diasComputados, className: 'text-center' },
                { titulo: 'Estado', celda: (s) => <EstadoSolicitudBadge estado={s.estado} /> },
              ]}
            />
            <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambiar={(p) => set('pagina', String(p))} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
