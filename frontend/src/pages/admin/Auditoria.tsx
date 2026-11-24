import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Paginado } from '@/types';
import { Cargando, Encabezado, Input, Paginacion, Select, Tarjeta, Vacio } from '@/components/ui';
import { fechaHora } from '@/utils/formato';

interface Registro {
  id: string; accion: string; entidad: string; entidadId: string | null; fecha: string; ip: string | null;
  valoresAnteriores: unknown; valoresNuevos: unknown; usuario: { nombre: string; apellido: string; email: string } | null;
}
const ENTIDADES = ['solicitud', 'docente', 'designacion', 'reemplazo', 'usuario', 'rol', 'tipo_licencia', 'regimen_licencia', 'circuito', 'archivo', 'asistencia', 'informe'];

export default function Auditoria() {
  const [pagina, setPagina] = useState(1);
  const [f, setF] = useState({ entidad: '', buscar: '', desde: '', hasta: '' });
  const [abierto, setAbierto] = useState<string>();
  const { data, isLoading } = useQuery({
    queryKey: ['auditoria', f, pagina],
    queryFn: async () => (await api.get<Paginado<Registro>>('/auditoria', { params: { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), pagina, porPagina: 50 } })).data,
    placeholderData: keepPreviousData,
  });
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setPagina(1); };

  return (
    <>
      <Encabezado titulo="Auditoría" subtitulo="Registro inalterable de acciones: usuario, fecha, registro afectado y valores modificados" />
      <Tarjeta sinPadding>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Select className="w-48" aria-label="Entidad" value={f.entidad} onChange={(e) => set('entidad', e.target.value)}><option value="">Todas las entidades</option>{ENTIDADES.map((x) => <option key={x}>{x}</option>)}</Select>
          <Input className="w-56" placeholder="Acción (p. ej. ESTADO_, LOGIN)" aria-label="Acción" value={f.buscar} onChange={(e) => set('buscar', e.target.value)} />
          <Input className="w-40" type="date" aria-label="Desde" value={f.desde} onChange={(e) => set('desde', e.target.value)} />
          <Input className="w-40" type="date" aria-label="Hasta" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} />
        </div>
        {isLoading || !data ? <Cargando /> : !data.items.length ? <Vacio texto="Sin registros" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr><th className="px-4 py-2.5">Fecha</th><th className="px-4 py-2.5">Usuario</th><th className="px-4 py-2.5">Acción</th><th className="px-4 py-2.5">Registro</th><th className="px-4 py-2.5">IP</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setAbierto(abierto === r.id ? undefined : r.id)}>
                        <td className="whitespace-nowrap px-4 py-2">{fechaHora(r.fecha)}</td>
                        <td className="px-4 py-2">{r.usuario ? `${r.usuario.apellido}, ${r.usuario.nombre}` : '—'}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.accion}</td>
                        <td className="px-4 py-2 text-xs">{r.entidad}<br /><span className="font-mono text-slate-400">{r.entidadId?.slice(0, 8)}</span></td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.ip}</td>
                      </tr>
                      {abierto === r.id && (
                        <tr><td colSpan={5} className="bg-slate-50 px-4 py-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            {[['Valores anteriores', r.valoresAnteriores], ['Valores nuevos', r.valoresNuevos]].map(([t, v]) => (
                              <div key={t as string}><p className="mb-1 text-xs font-semibold text-slate-500">{t as string}</p><pre className="max-h-64 overflow-auto rounded bg-white p-2 text-[11px] ring-1 ring-slate-200">{v ? JSON.stringify(v, null, 2) : '—'}</pre></div>
                            ))}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambiar={setPagina} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
