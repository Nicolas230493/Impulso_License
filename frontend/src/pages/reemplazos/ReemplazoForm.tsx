import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, mensajesError } from '@/services/api';
import type { Docente, Paginado, SolicitudDetalle, SolicitudResumen } from '@/types';
import { Alerta, Boton, Campo, Encabezado, Input, Select, Tarjeta, Textarea } from '@/components/ui';
import { DIAS, descripcionDesignacion, fecha, isoInput } from '@/utils/formato';

interface Tramo { suplenteId: string; fechaDesde: string; fechaHasta: string; horarioIds: string[] }

export default function ReemplazoForm() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [solicitudId, setSolicitudId] = useState('');
  const [designacionId, setDesignacionId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [instrumento, setInstrumento] = useState('');
  const [obs, setObs] = useState('');
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [error, setError] = useState<string[]>();
  const [enviando, setEnviando] = useState(false);

  const licencias = useQuery({
    queryKey: ['solicitudes', 'para-reemplazo'],
    queryFn: async () => (await api.get<Paginado<SolicitudResumen>>('/solicitudes', { params: { estado: ['AUTORIZADA', 'EN_REVISION'], porPagina: 200 }, paramsSerializer: { indexes: null } })).data.items,
  });
  const solicitud = useQuery({ queryKey: ['solicitud', solicitudId], queryFn: async () => (await api.get<SolicitudDetalle>(`/solicitudes/${solicitudId}`)).data, enabled: !!solicitudId });
  const designaciones = useQuery({
    queryKey: ['designaciones', solicitud.data?.docenteId],
    queryFn: async () => (await api.get<SolicitudDetalle['designaciones']>('/designaciones', { params: { docenteId: solicitud.data!.docenteId } })).data,
    enabled: !!solicitud.data,
  });
  const suplentes = useQuery({ queryKey: ['docentes', 'activos'], queryFn: async () => (await api.get<Paginado<Docente>>('/docentes', { params: { estadoLaboral: 'ACTIVO', porPagina: 200 } })).data.items });

  const afectadas = useMemo(() => {
    const ids = new Set(solicitud.data?.designaciones.map((d) => d.id));
    return (designaciones.data ?? []).filter((d) => ids.has(d.id));
  }, [solicitud.data, designaciones.data]);
  const designacion = afectadas.find((d) => d.id === designacionId);

  const elegirSolicitud = (id: string) => {
    setSolicitudId(id); setDesignacionId(''); setTramos([]);
    const s = licencias.data?.find((x) => x.id === id);
    if (s) { setDesde(isoInput(s.fechaDesde)); setHasta(isoInput(s.fechaHasta)); }
  };
  const agregarTramo = () => setTramos([...tramos, { suplenteId: '', fechaDesde: desde, fechaHasta: hasta, horarioIds: [] }]);
  const editar = (i: number, cambios: Partial<Tramo>) => setTramos(tramos.map((t, j) => (j === i ? { ...t, ...cambios } : t)));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!tramos.length) return setError(['Agregue al menos un suplente']);
    setEnviando(true);
    try {
      await api.post('/reemplazos', { solicitudId, designacionId, fechaDesde: desde, fechaHasta: hasta, instrumentoLegal: instrumento || undefined, observaciones: obs || undefined, suplentes: tramos });
      await qc.invalidateQueries({ queryKey: ['reemplazos'] });
      navegar('/reemplazos');
    } catch (err) { setError(mensajesError(err)); } finally { setEnviando(false); }
  };

  return (
    <>
      <Encabezado titulo="Registrar reemplazo" subtitulo="Se admite cobertura parcial: varios suplentes por franja horaria o por tramos de fechas." />
      <form onSubmit={enviar} className="space-y-6">
        <Alerta mensajes={error} />
        <Tarjeta titulo="Licencia y designación cubierta">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo className="sm:col-span-2" etiqueta="Licencia que origina el reemplazo">{(i) => (
              <Select id={i} required value={solicitudId} onChange={(e) => elegirSolicitud(e.target.value)}>
                <option value="">Seleccione…</option>
                {licencias.data?.map((s) => <option key={s.id} value={s.id}>{s.numero} — {s.docente.apellido}, {s.docente.nombre} ({fecha(s.fechaDesde)} a {fecha(s.fechaHasta)})</option>)}
              </Select>
            )}</Campo>
            <Campo className="sm:col-span-2" etiqueta="Designación afectada">{(i) => (
              <Select id={i} required value={designacionId} onChange={(e) => { setDesignacionId(e.target.value); setTramos([]); }} disabled={!solicitudId}>
                <option value="">Seleccione…</option>
                {afectadas.map((d) => <option key={d.id} value={d.id}>{d.cargo.nombre} — {descripcionDesignacion(d)}</option>)}
              </Select>
            )}</Campo>
            <Campo etiqueta="Desde">{(i) => <Input id={i} type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />}</Campo>
            <Campo etiqueta="Hasta">{(i) => <Input id={i} type="date" required value={hasta} onChange={(e) => setHasta(e.target.value)} />}</Campo>
            <Campo etiqueta="Instrumento legal (opcional)">{(i) => <Input id={i} value={instrumento} onChange={(e) => setInstrumento(e.target.value)} />}</Campo>
            <Campo etiqueta="Observaciones">{(i) => <Textarea id={i} rows={1} value={obs} onChange={(e) => setObs(e.target.value)} />}</Campo>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Suplentes" acciones={<Boton type="button" variante="secundario" onClick={agregarTramo} disabled={!designacion}><Plus className="size-4" /> Agregar suplente</Boton>}>
          {!designacion ? <p className="text-sm text-slate-500">Seleccione la designación para asignar suplentes.</p> : !tramos.length ? <p className="text-sm text-slate-500">Agregue uno o más suplentes.</p> : (
            <div className="space-y-4">
              {tramos.map((t, i) => (
                <div key={i} className="rounded-lg p-4 ring-1 ring-slate-200">
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                    <Campo etiqueta="Suplente">{(id) => (
                      <Select id={id} required value={t.suplenteId} onChange={(e) => editar(i, { suplenteId: e.target.value })}>
                        <option value="">Seleccione…</option>
                        {suplentes.data?.filter((d) => d.id !== solicitud.data?.docenteId).map((d) => <option key={d.id} value={d.id}>{d.apellido}, {d.nombre} ({d.legajo})</option>)}
                      </Select>
                    )}</Campo>
                    <Campo etiqueta="Desde">{(id) => <Input id={id} type="date" required min={desde} max={hasta} value={t.fechaDesde} onChange={(e) => editar(i, { fechaDesde: e.target.value })} />}</Campo>
                    <Campo etiqueta="Hasta">{(id) => <Input id={id} type="date" required min={desde} max={hasta} value={t.fechaHasta} onChange={(e) => editar(i, { fechaHasta: e.target.value })} />}</Campo>
                    <div className="flex items-end"><Boton type="button" variante="fantasma" aria-label="Quitar suplente" onClick={() => setTramos(tramos.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Boton></div>
                  </div>
                  {!!designacion.horarios.length && (
                    <fieldset className="mt-3">
                      <legend className="text-xs font-medium text-slate-600">Franjas que cubre (sin marcar = cobertura total)</legend>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {designacion.horarios.map((h) => (
                          <label key={h.id} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-slate-200 has-[:checked]:bg-marca-50 has-[:checked]:ring-marca-600/50">
                            <input type="checkbox" checked={t.horarioIds.includes(h.id)} onChange={(e) => editar(i, { horarioIds: e.target.checked ? [...t.horarioIds, h.id] : t.horarioIds.filter((x) => x !== h.id) })} />
                            {DIAS[h.diaSemana]} {h.horaDesde}–{h.horaHasta}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="secundario" onClick={() => navegar(-1)}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>Registrar (queda propuesto)</Boton>
        </div>
      </form>
    </>
  );
}
