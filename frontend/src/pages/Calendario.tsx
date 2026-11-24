import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/services/api';
import { Boton, Cargando, Encabezado, Tarjeta } from '@/components/ui';
import { fecha, hoyISO } from '@/utils/formato';

interface Evento { tipo: 'licencia' | 'reincorporacion' | 'reemplazo' | 'feriado'; id: string; desde: string; hasta: string; estado: string; titulo: string; detalle: string }
const COLOR: Record<Evento['tipo'], string> = {
  licencia: 'bg-orange-100 text-orange-900 border-orange-300',
  reincorporacion: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  reemplazo: 'bg-sky-100 text-sky-900 border-sky-300',
  feriado: 'bg-slate-200 text-slate-700 border-slate-300',
};
const ETIQUETA: Record<Evento['tipo'], string> = { licencia: 'Licencias', reincorporacion: 'Reincorporaciones', reemplazo: 'Reemplazos', feriado: 'Feriados' };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function Calendario() {
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(Date.UTC(h.getFullYear(), h.getMonth(), 1)); });
  const [filtros, setFiltros] = useState<Record<Evento['tipo'], boolean>>({ licencia: true, reincorporacion: true, reemplazo: true, feriado: true });
  const navegar = useNavigate();
  const desde = iso(mes), hasta = iso(new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0)));
  const { data, isLoading } = useQuery({ queryKey: ['calendario', desde], queryFn: async () => (await api.get<{ eventos: Evento[] }>('/reportes/calendario', { params: { desde, hasta } })).data });

  const dias = useMemo(() => {
    const inicio = new Date(mes); inicio.setUTCDate(1 - ((mes.getUTCDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setUTCDate(inicio.getUTCDate() + i); return d; });
  }, [mes]);
  const eventos = (data?.eventos ?? []).filter((e) => filtros[e.tipo]);
  const delDia = (d: string) => eventos.filter((e) => e.desde <= d && e.hasta >= d);
  const cambiarMes = (n: number) => setMes(new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + n, 1)));
  const hoy = hoyISO();
  const abrir = (e: Evento) => e.tipo === 'reemplazo' ? navegar('/reemplazos') : e.tipo !== 'feriado' && navegar(`/solicitudes/${e.id}`);

  return (
    <>
      <Encabezado titulo="Calendario institucional" subtitulo="Ausencias, vencimientos, reincorporaciones y reemplazos"
        acciones={<div className="flex items-center gap-2">
          <Boton variante="secundario" onClick={() => cambiarMes(-1)} aria-label="Mes anterior"><ChevronLeft className="size-4" /></Boton>
          <span className="min-w-36 text-center font-medium first-letter:uppercase">{mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
          <Boton variante="secundario" onClick={() => cambiarMes(1)} aria-label="Mes siguiente"><ChevronRight className="size-4" /></Boton>
        </div>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(ETIQUETA) as Evento['tipo'][]).map((t) => (
          <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${filtros[t] ? COLOR[t] : 'border-slate-200 bg-white text-slate-400'}`}>
            <input type="checkbox" className="sr-only" checked={filtros[t]} onChange={(e) => setFiltros({ ...filtros, [t]: e.target.checked })} />{ETIQUETA[t]}
          </label>
        ))}
      </div>
      {isLoading ? <Cargando /> : (
        <>
          <Tarjeta sinPadding className="hidden md:block">
            <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-semibold uppercase text-slate-500">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {dias.map((d) => {
                const k = iso(d), ev = delDia(k), fuera = d.getUTCMonth() !== mes.getUTCMonth();
                return (
                  <div key={k} className={`min-h-28 border-b border-r border-slate-100 p-1.5 ${fuera ? 'bg-slate-50/60' : ''}`}>
                    <p className={`mb-1 text-xs ${k === hoy ? 'inline-grid size-6 place-items-center rounded-full bg-marca-700 font-bold text-white' : fuera ? 'text-slate-300' : 'text-slate-500'}`}>{d.getUTCDate()}</p>
                    <div className="space-y-0.5">
                      {ev.slice(0, 4).map((e) => (
                        <button key={e.tipo + e.id} onClick={() => abrir(e)} title={`${e.titulo} — ${e.detalle} (${fecha(e.desde)} a ${fecha(e.hasta)})`}
                          className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] ${COLOR[e.tipo]} ${e.estado && ['PENDIENTE', 'EN_REVISION', 'OBSERVADA', 'PENDIENTE_DICTAMEN', 'ELEVADA'].includes(e.estado) ? 'border-dashed opacity-75' : ''}`}>
                          {e.titulo}
                        </button>
                      ))}
                      {ev.length > 4 && <p className="px-1 text-[11px] text-slate-500">+{ev.length - 4} más</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Tarjeta>
          {/* Vista de lista para pantallas pequeñas */}
          <Tarjeta sinPadding className="md:hidden">
            <ul className="divide-y divide-slate-100">
              {eventos.sort((a, b) => a.desde.localeCompare(b.desde)).map((e) => (
                <li key={e.tipo + e.id}><button onClick={() => abrir(e)} className="w-full px-4 py-3 text-left">
                  <span className={`mb-1 inline-block rounded border px-1.5 text-[11px] ${COLOR[e.tipo]}`}>{ETIQUETA[e.tipo]}</span>
                  <p className="text-sm font-medium">{e.titulo}</p>
                  <p className="text-xs text-slate-500">{e.detalle} · {fecha(e.desde)}{e.hasta !== e.desde && ` a ${fecha(e.hasta)}`}</p>
                </button></li>
              ))}
            </ul>
          </Tarjeta>
          <p className="mt-2 text-xs text-slate-500">Las licencias en trámite se muestran con borde punteado.</p>
        </>
      )}
    </>
  );
}
