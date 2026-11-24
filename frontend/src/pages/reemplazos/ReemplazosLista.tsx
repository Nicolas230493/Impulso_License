import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, esConflicto, mensajesError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { EstadoReemplazo, Paginado, Reemplazo } from '@/types';
import { Alerta, Boton, Cargando, Encabezado, Paginacion, Select, Tabla, Tarjeta } from '@/components/ui';
import { EstadoReemplazoBadge } from '@/components/Estados';
import { DIAS, descripcionDesignacion, ESTADO_REEMPLAZO, fecha } from '@/utils/formato';
import { P } from '@/utils/permisos';

export default function ReemplazosLista() {
  const { puede } = useAuth();
  const qc = useQueryClient();
  const [estado, setEstado] = useState<EstadoReemplazo | ''>('');
  const [pagina, setPagina] = useState(1);
  const [error, setError] = useState<string[]>();
  const { data, isLoading } = useQuery({
    queryKey: ['reemplazos', estado, pagina],
    queryFn: async () => (await api.get<Paginado<Reemplazo>>('/reemplazos', { params: { estado: estado || undefined, pagina } })).data,
  });
  const gestiona = puede(P.REEMPLAZOS_GESTIONAR);
  const cambiar = async (r: Reemplazo, nuevo: EstadoReemplazo) => {
    if (nuevo === 'ANULADO' && !confirm('¿Anular el reemplazo?')) return;
    setError(undefined);
    try { await api.post(`/reemplazos/${r.id}/estado`, { estado: nuevo, version: r.version }); }
    catch (e) {
      setError(esConflicto(e) ? ['Otra persona modificó este reemplazo. Se recargó la lista: revise y vuelva a intentar.'] : mensajesError(e));
    }
    await qc.invalidateQueries({ queryKey: ['reemplazos'] });
  };

  return (
    <>
      <Encabezado titulo="Reemplazos docentes" subtitulo="Coberturas totales o parciales de designaciones"
        acciones={gestiona && <Link to="/reemplazos/nuevo"><Boton><Plus className="size-4" /> Registrar reemplazo</Boton></Link>} />
      <Alerta mensajes={error} />
      <Tarjeta sinPadding className="mt-2">
        <div className="border-b border-slate-100 p-4">
          <Select className="w-48" aria-label="Estado" value={estado} onChange={(e) => { setEstado(e.target.value as EstadoReemplazo | ''); setPagina(1); }}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_REEMPLAZO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </Select>
        </div>
        {isLoading || !data ? <Cargando /> : (
          <>
            <Tabla
              filas={data.items}
              clave={(r) => r.id}
              vacio="No hay reemplazos registrados"
              columnas={[
                { titulo: 'Titular', celda: (r) => <><p className="font-medium text-slate-900">{r.titular.apellido}, {r.titular.nombre}</p>{r.solicitud && <Link to={`/solicitudes/${r.solicitud.id}`} className="text-xs text-marca-700 hover:underline">{r.solicitud.numero}</Link>}</> },
                { titulo: 'Designación', celda: (r) => <span className="text-xs">{r.designacion.cargo.nombre}<br />{descripcionDesignacion(r.designacion)}</span> },
                {
                  titulo: 'Suplentes', celda: (r) => (
                    <ul className="space-y-1 text-xs">
                      {r.suplentes.map((s) => (
                        <li key={s.id}>
                          <span className="font-medium text-slate-800">{s.suplente.apellido}, {s.suplente.nombre}</span> · {fecha(s.fechaDesde)}–{fecha(s.fechaHasta)}
                          <br /><span className="text-slate-500">{s.coberturas.length ? s.coberturas.map((c) => `${DIAS[c.horario.diaSemana]} ${c.horario.horaDesde}`).join(', ') : 'Cobertura total'}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                },
                { titulo: 'Período', celda: (r) => <span className="whitespace-nowrap">{fecha(r.fechaDesde)} – {fecha(r.fechaHasta)}</span> },
                { titulo: 'Estado', celda: (r) => <EstadoReemplazoBadge estado={r.estado} /> },
                ...(gestiona ? [{
                  titulo: '', celda: (r: Reemplazo) => (
                    <div className="flex gap-1">
                      {r.estado === 'PROPUESTO' && <Boton variante="exito" onClick={() => cambiar(r, 'ACTIVO')}>Autorizar</Boton>}
                      {r.estado === 'ACTIVO' && <Boton variante="secundario" onClick={() => cambiar(r, 'FINALIZADO')}>Finalizar</Boton>}
                      {['PROPUESTO', 'ACTIVO'].includes(r.estado) && <Boton variante="fantasma" onClick={() => cambiar(r, 'ANULADO')}>Anular</Boton>}
                    </div>
                  ),
                }] : []),
              ]}
            />
            <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambiar={setPagina} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
