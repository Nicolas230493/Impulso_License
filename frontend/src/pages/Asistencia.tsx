import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mensajesError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Designacion, EstadoAsistencia } from '@/types';
import { Alerta, Boton, Cargando, Encabezado, Input, Insignia, Tarjeta, Vacio } from '@/components/ui';
import { ASISTENCIA, descripcionDesignacion, hoyISO } from '@/utils/formato';
import { P } from '@/utils/permisos';

interface Fila extends Designacion {
  docente: { id: string; apellido: string; nombre: string; legajo: string };
  registro: { estado: EstadoAsistencia; justificada: boolean; justificacion: string | null; aviso: 'CON_AVISO' | 'SIN_AVISO' | null } | null;
  licencia: { id: string; numero: string } | null;
  tieneClase: boolean;
}
interface Registro { estado: EstadoAsistencia; justificada: boolean; justificacion: string; aviso?: 'CON_AVISO' | 'SIN_AVISO' | '' }

export default function Asistencia() {
  const { puede } = useAuth();
  const qc = useQueryClient();
  const [fecha, setFecha] = useState(hoyISO());
  const [soloConClase, setSoloConClase] = useState(true);
  const [cambios, setCambios] = useState<Record<string, Registro>>({});
  const [msg, setMsg] = useState<{ tipo: 'error' | 'exito'; textos: string[] }>();
  const [guardando, setGuardando] = useState(false);
  const registra = puede(P.ASISTENCIA_REGISTRAR);
  const { data, isLoading } = useQuery({ queryKey: ['asistencia', fecha], queryFn: async () => (await api.get<{ filas: Fila[] }>('/asistencias', { params: { fecha } })).data });

  useEffect(() => {
    setCambios({}); setMsg(undefined);
  }, [fecha]);

  const valor = (f: Fila): Registro =>
    cambios[f.id] ?? (f.registro ? { estado: f.registro.estado, justificada: f.registro.justificada, justificacion: f.registro.justificacion ?? '', aviso: f.registro.aviso ?? '' } : { estado: f.licencia ? 'LICENCIA' : 'PRESENTE', justificada: !!f.licencia, justificacion: '' });
  const set = (f: Fila, c: Partial<Registro>) => setCambios({ ...cambios, [f.id]: { ...valor(f), ...c } });
  const filas = (data?.filas ?? []).filter((f) => !soloConClase || f.tieneClase || f.registro);

  const guardar = async () => {
    setGuardando(true); setMsg(undefined);
    try {
      await api.post('/asistencias', { fecha, registros: filas.map((f) => ({ designacionId: f.id, ...valor(f), justificacion: valor(f).justificacion || undefined, aviso: valor(f).estado === 'AUSENTE' && valor(f).aviso ? valor(f).aviso : undefined })) });
      await qc.invalidateQueries({ queryKey: ['asistencia', fecha] });
      setCambios({}); setMsg({ tipo: 'exito', textos: [`Asistencia del día registrada (${filas.length} designaciones).`] });
    } catch (e) { setMsg({ tipo: 'error', textos: mensajesError(e) }); } finally { setGuardando(false); }
  };

  return (
    <>
      <Encabezado titulo="Asistencia diaria" subtitulo="Presentismo por designación. Los docentes con licencia autorizada se marcan automáticamente."
        acciones={<>
          <Input type="date" aria-label="Fecha" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className="w-44" />
          {registra && <Boton onClick={guardar} cargando={guardando} disabled={!filas.length}>Guardar planilla</Boton>}
        </>} />
      {msg && <div className="mb-4"><Alerta tipo={msg.tipo} mensajes={msg.textos} /></div>}
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={soloConClase} onChange={(e) => setSoloConClase(e.target.checked)} /> Mostrar solo designaciones con clase ese día
      </label>
      <Tarjeta sinPadding>
        {isLoading ? <Cargando /> : !filas.length ? <Vacio texto="No hay designaciones con actividad para la fecha." /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr><th className="px-4 py-2.5">Docente</th><th className="px-4 py-2.5">Designación</th><th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5">Justificación</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((f) => {
                  const v = valor(f);
                  return (
                    <tr key={f.id} className={f.licencia ? 'bg-orange-50/40' : ''}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{f.docente.apellido}, {f.docente.nombre}</p>
                        {f.licencia && <Link to={`/solicitudes/${f.licencia.id}`}><Insignia color="bg-orange-50 text-orange-700 ring-orange-300">Licencia {f.licencia.numero}</Insignia></Link>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{descripcionDesignacion(f)}<br />{f.horarios.map((h) => `${h.horaDesde}–${h.horaHasta}`).join(', ')}</td>
                      <td className="px-4 py-2.5">
                        <div role="radiogroup" aria-label={`Asistencia de ${f.docente.apellido}`} className="flex flex-wrap gap-1">
                          {(Object.keys(ASISTENCIA) as EstadoAsistencia[]).map((e) => (
                            <button key={e} type="button" role="radio" aria-checked={v.estado === e} disabled={!registra}
                              onClick={() => set(f, { estado: e, justificada: e === 'LICENCIA' ? true : v.justificada })}
                              className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${v.estado === e ? { PRESENTE: 'bg-emerald-600 text-white ring-emerald-600', AUSENTE: 'bg-red-600 text-white ring-red-600', TARDANZA: 'bg-amber-500 text-white ring-amber-500', LICENCIA: 'bg-orange-500 text-white ring-orange-500' }[e] : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}>
                              {ASISTENCIA[e]}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {(v.estado === 'AUSENTE' || v.estado === 'TARDANZA') && (
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={v.justificada} disabled={!registra} onChange={(e) => set(f, { justificada: e.target.checked })} /> Justificada</label>
                            {v.estado === 'AUSENTE' && (
                              <select aria-label="Aviso" className="rounded border-slate-300 py-0.5 text-xs" value={v.aviso ?? ''} disabled={!registra} onChange={(e) => set(f, { aviso: e.target.value as Registro['aviso'] })}>
                                <option value="">Aviso…</option><option value="CON_AVISO">Con aviso</option><option value="SIN_AVISO">Sin aviso</option>
                              </select>
                            )}
                            <Input className="py-1 text-xs" placeholder="Detalle" aria-label="Justificación" value={v.justificacion} disabled={!registra} onChange={(e) => set(f, { justificacion: e.target.value })} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
