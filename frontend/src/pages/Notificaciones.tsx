import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Notificacion, Paginado } from '@/types';
import { Boton, Cargando, Encabezado, Paginacion, Tarjeta, Vacio } from '@/components/ui';
import { fechaHora } from '@/utils/formato';

export default function Notificaciones() {
  const [pagina, setPagina] = useState(1);
  const qc = useQueryClient();
  const navegar = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['notificaciones', pagina],
    queryFn: async () => (await api.get<Paginado<Notificacion> & { sinLeer: number }>('/notificaciones', { params: { pagina, porPagina: 20 } })).data,
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['notificaciones'] });
  const leer = useMutation({ mutationFn: (id: string) => api.post(`/notificaciones/${id}/leida`), onSuccess: refrescar });
  const leerTodas = useMutation({ mutationFn: () => api.post('/notificaciones/leidas'), onSuccess: refrescar });

  const abrir = (n: Notificacion) => {
    if (!n.leida) leer.mutate(n.id);
    if (n.entidad === 'solicitud' && n.entidadId) navegar(`/solicitudes/${n.entidadId}`);
    if (n.entidad === 'reemplazo') navegar('/reemplazos');
  };

  return (
    <>
      <Encabezado titulo="Notificaciones" subtitulo={data ? `${data.sinLeer} sin leer` : undefined}
        acciones={!!data?.sinLeer && <Boton variante="secundario" onClick={() => leerTodas.mutate()} cargando={leerTodas.isPending}>Marcar todas como leídas</Boton>} />
      <Tarjeta sinPadding>
        {isLoading || !data ? <Cargando /> : !data.items.length ? <Vacio texto="No tiene notificaciones." /> : (
          <>
            <ul className="divide-y divide-slate-100">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => abrir(n)} className={`flex w-full gap-3 px-5 py-3 text-left hover:bg-slate-50 ${n.leida ? '' : 'bg-marca-50/40'}`}>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.leida ? 'bg-transparent' : 'bg-marca-600'}`} aria-hidden />
                    <span className="flex-1">
                      <span className={`block text-sm ${n.leida ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{n.titulo}</span>
                      <span className="block text-sm text-slate-500">{n.mensaje}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{fechaHora(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambiar={setPagina} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
