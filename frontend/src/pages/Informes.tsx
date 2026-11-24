import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { api, descargar, mensajesError } from '@/services/api';
import { Alerta, Boton, Campo, Cargando, Encabezado, Input, Tabla, Tarjeta } from '@/components/ui';

interface Def { clave: string; titulo: string; descripcion: string }
interface Resultado { titulo: string; columnas: { clave: string; titulo: string }[]; filas: Record<string, string | number | null>[]; parametros: Record<string, string> }
const POR_MES = ['ausencias-mensuales', 'planilla-il1', 'planilla-il2', 'estadistica-mensual'];
const POR_ANIO = ['dias-por-regimen', 'concepto-anual'];
const SIN_PARAMS = ['solicitudes-pendientes', 'registro-art-347'];

export default function Informes() {
  const anio = new Date().getFullYear();
  const [sel, setSel] = useState<string>('licencias-por-periodo');
  const [p, setP] = useState({ desde: `${anio}-01-01`, hasta: `${anio}-12-31`, anio: String(anio), mes: String(new Date().getMonth() + 1) });
  const [error, setError] = useState<string[]>();
  const [descargando, setDescargando] = useState<string>();
  const defs = useQuery({ queryKey: ['informes'], queryFn: async () => (await api.get<Def[]>('/reportes/informes')).data });

  const params: Record<string, string> = POR_MES.includes(sel) ? { anio: p.anio, mes: p.mes } : POR_ANIO.includes(sel) ? { anio: p.anio } : SIN_PARAMS.includes(sel) ? {} : { desde: p.desde, hasta: p.hasta };
  const resultado = useQuery({
    queryKey: ['informe', sel, params],
    queryFn: async () => (await api.get<Resultado>(`/reportes/informes/${sel}`, { params })).data,
  });

  const exportar = async (formato: 'xlsx' | 'pdf') => {
    setDescargando(formato); setError(undefined);
    try { await descargar(`/reportes/informes/${sel}?${new URLSearchParams({ ...params, formato })}`, `${sel}.${formato}`); }
    catch (e) { setError(mensajesError(e)); } finally { setDescargando(undefined); }
  };

  return (
    <>
      <Encabezado titulo="Informes y estadísticas" subtitulo="Consulte en pantalla o exporte a PDF y Excel" />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Tarjeta sinPadding titulo="Informes disponibles">
          {defs.isLoading ? <Cargando /> : (
            <ul className="divide-y divide-slate-100">
              {defs.data?.map((d) => (
                <li key={d.clave}>
                  <button onClick={() => setSel(d.clave)} aria-current={sel === d.clave} className={`w-full px-4 py-3 text-left ${sel === d.clave ? 'bg-marca-50' : 'hover:bg-slate-50'}`}>
                    <p className={`text-sm font-medium ${sel === d.clave ? 'text-marca-700' : 'text-slate-800'}`}>{d.titulo}</p>
                    <p className="text-xs text-slate-500">{d.descripcion}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <div className="space-y-4">
          <Tarjeta>
            <div className="flex flex-wrap items-end gap-3">
              {!POR_MES.includes(sel) && !POR_ANIO.includes(sel) && !SIN_PARAMS.includes(sel) && <>
                <Campo etiqueta="Desde">{(i) => <Input id={i} type="date" value={p.desde} onChange={(e) => setP({ ...p, desde: e.target.value })} />}</Campo>
                <Campo etiqueta="Hasta">{(i) => <Input id={i} type="date" value={p.hasta} onChange={(e) => setP({ ...p, hasta: e.target.value })} />}</Campo>
              </>}
              {(POR_MES.includes(sel) || POR_ANIO.includes(sel)) && <Campo etiqueta="Año">{(i) => <Input id={i} type="number" className="w-28" value={p.anio} onChange={(e) => setP({ ...p, anio: e.target.value })} />}</Campo>}
              {POR_MES.includes(sel) && <Campo etiqueta="Mes">{(i) => <Input id={i} type="number" min={1} max={12} className="w-20" value={p.mes} onChange={(e) => setP({ ...p, mes: e.target.value })} />}</Campo>}
              <div className="flex-1" />
              <Boton variante="secundario" onClick={() => resultado.refetch()}><Play className="size-4" /> Actualizar</Boton>
              <Boton variante="secundario" onClick={() => exportar('xlsx')} cargando={descargando === 'xlsx'}><FileSpreadsheet className="size-4" /> Excel</Boton>
              <Boton variante="secundario" onClick={() => exportar('pdf')} cargando={descargando === 'pdf'}><FileText className="size-4" /> PDF</Boton>
            </div>
          </Tarjeta>
          <Alerta mensajes={error} />
          <Tarjeta sinPadding titulo={resultado.data?.titulo ?? 'Resultado'} acciones={resultado.data && <span className="flex items-center gap-1 text-xs text-slate-500"><Download className="size-3.5" />{resultado.data.filas.length} filas</span>}>
            {resultado.isLoading || !resultado.data ? <Cargando /> : (
              <Tabla filas={resultado.data.filas} clave={(f) => JSON.stringify(f)} vacio="Sin datos para los parámetros indicados"
                columnas={resultado.data.columnas.map((c) => ({ titulo: c.titulo, celda: (f: Record<string, string | number | null>) => f[c.clave] ?? '—' }))} />
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
