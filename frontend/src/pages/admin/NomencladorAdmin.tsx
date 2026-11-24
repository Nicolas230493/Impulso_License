import { Fragment, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { api, mensajesError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Nomenclador } from '@/types';
import { Alerta, Boton, Campo, Cargando, Encabezado, Input, Insignia, Modal, Tarjeta, Textarea, Vacio } from '@/components/ui';
import { AGRUPACION, AUTORIDAD, fecha, REVISTA } from '@/utils/formato';
import { P } from '@/utils/permisos';

interface Cambio { campo: string; antes: unknown; despues: unknown }
interface VistaPrevia {
  regimen: { nombre: string } | null; totales: { motivos: number; variantes: number };
  motivosNuevos: string[]; variantesNuevas: string[]; variantesModificadas: { codigo: string; cambios: Cambio[] }[]; variantesADesactivar: string[];
  sinCambios: number; avisos: { codigo?: string; hoja: string; fila: number; mensaje: string }[]; errores: { hoja: string; fila: number; mensaje: string }[];
}
interface Version { id: string; version: number; vigenciaDesde: string; vigenciaHasta: string | null; definicion: unknown; nota: string | null; createdAt: string }

const pago = (p: number | null) => (p === null ? '—' : p === 0 ? 'Sin goce' : `${p} %`);

/** Importación del Excel oficial con vista previa de diferencias, y reglas versionadas de cada variante. */
export default function NomencladorAdmin() {
  const { puede } = useAuth();
  const gestiona = puede(P.NOMENCLADOR_GESTIONAR);
  const qc = useQueryClient();
  const archivo = useRef<HTMLInputElement>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [vista, setVista] = useState<VistaPrevia>();
  const [msg, setMsg] = useState<{ tipo: 'error' | 'exito'; t: string[] }>();
  const [ocupado, setOcupado] = useState(false);
  const [reglasDe, setReglasDe] = useState<{ id: string; codigo: string }>();
  const { data, isLoading } = useQuery({ queryKey: ['nomenclador'], queryFn: async () => (await api.get<Nomenclador>('/nomenclador')).data });

  const formulario = () => {
    const f = archivo.current?.files?.[0];
    if (!f) return null;
    const fd = new FormData();
    fd.append('archivo', f);
    return fd;
  };
  const previsualizar = async () => {
    const fd = formulario();
    if (!fd) return setMsg({ tipo: 'error', t: ['Elija el Excel del nomenclador'] });
    setOcupado(true); setMsg(undefined);
    try { setVista((await api.post<VistaPrevia>('/nomenclador/importar/vista-previa', fd)).data); } catch (e) { setMsg({ tipo: 'error', t: mensajesError(e) }); } finally { setOcupado(false); }
  };
  const aplicar = async () => {
    const fd = formulario();
    if (!fd) return;
    setOcupado(true);
    try {
      const r = (await api.post<{ variantes: number; reglasCreadas: number; desactivadas: number }>('/nomenclador/importar', fd)).data;
      setMsg({ tipo: 'exito', t: [`Nomenclador aplicado: ${r.variantes} variantes, ${r.reglasCreadas} reglas nuevas, ${r.desactivadas} desactivadas.`] });
      setVista(undefined);
      await qc.invalidateQueries({ queryKey: ['nomenclador'] });
    } catch (e) { setMsg({ tipo: 'error', t: mensajesError(e) }); } finally { setOcupado(false); }
  };

  if (isLoading) return <Cargando />;
  const porAgrupacion = new Map<number, Nomenclador['motivos']>();
  for (const m of data?.motivos ?? []) porAgrupacion.set(m.agrupacion, [...(porAgrupacion.get(m.agrupacion) ?? []), m]);

  return (
    <>
      <Encabezado titulo="Nomenclador de licencias" subtitulo={data?.regimen?.nombre ?? 'Ley 647-E — Estatuto del Docente (Chaco)'} />
      {msg && <div className="mb-4"><Alerta tipo={msg.tipo} mensajes={msg.t} /></div>}
      {gestiona && (
        <Tarjeta titulo="Importar el Excel oficial" className="mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <Campo etiqueta="Archivo .xlsx">{(i) => <Input id={i} ref={archivo} type="file" accept=".xlsx" />}</Campo>
            <Boton variante="secundario" cargando={ocupado} onClick={previsualizar}><Upload className="size-4" /> Ver diferencias</Boton>
          </div>
          {vista && (
            <div className="mt-4 space-y-3 text-sm">
              <p>{vista.totales.motivos} motivos y {vista.totales.variantes} variantes en el archivo. Nuevas: <strong>{vista.variantesNuevas.length}</strong> ·
                modificadas: <strong>{vista.variantesModificadas.length}</strong> · a desactivar: <strong>{vista.variantesADesactivar.length}</strong> · sin cambios: {vista.sinCambios}</p>
              <Alerta mensajes={vista.errores.map((e) => `${e.hoja} fila ${e.fila}: ${e.mensaje}`)} />
              {!!vista.variantesModificadas.length && (
                <details><summary className="cursor-pointer font-medium">Cambios por variante</summary>
                  <ul className="mt-2 space-y-1 text-xs">{vista.variantesModificadas.map((v) => <li key={v.codigo}><strong>{v.codigo}</strong>: {v.cambios.map((c) => `${c.campo}: ${JSON.stringify(c.antes)} → ${JSON.stringify(c.despues)}`).join(' · ')}</li>)}</ul>
                </details>
              )}
              {!!vista.variantesADesactivar.length && <p className="text-xs text-amber-800">Se desactivan (ya no están en el Excel): {vista.variantesADesactivar.join(', ')}</p>}
              {!!vista.avisos.length && (
                <details><summary className="cursor-pointer font-medium">{vista.avisos.length} avisos del archivo</summary>
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">{vista.avisos.map((a, i) => <li key={i}>{a.codigo ?? `${a.hoja} fila ${a.fila}`}: {a.mensaje}</li>)}</ul>
                </details>
              )}
              <div className="flex justify-end gap-2">
                <Boton variante="secundario" onClick={() => setVista(undefined)}>Cancelar</Boton>
                <Boton cargando={ocupado} disabled={!!vista.errores.length} onClick={aplicar}>Aplicar</Boton>
              </div>
            </div>
          )}
        </Tarjeta>
      )}

      {!data?.motivos.length ? <Vacio texto="Todavía no se cargó el nomenclador." /> : (
        <Tarjeta sinPadding>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr><th className="px-4 py-2">Código</th><th className="px-4 py-2">Motivo / variante</th><th className="px-4 py-2">Revista</th><th className="px-4 py-2">Encuadre</th><th className="px-4 py-2">Haberes</th><th className="px-4 py-2">Otorga</th><th className="px-4 py-2">Regla</th></tr>
              </thead>
              <tbody>
                {[...porAgrupacion.entries()].map(([agr, motivos]) => (
                  <Fragment key={agr}>
                    <tr><td colSpan={7} className="bg-slate-100/60 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{agr}. {AGRUPACION[agr]}</td></tr>
                    {motivos.map((m) => (
                      <Fragment key={m.id}>
                        <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setAbiertos({ ...abiertos, [m.id]: !abiertos[m.id] })}>
                          <td className="px-4 py-2 font-mono text-xs">{abiertos[m.id] ? <ChevronDown className="mr-1 inline size-3.5" /> : <ChevronRight className="mr-1 inline size-3.5" />}{m.codigo}</td>
                          <td className="px-4 py-2 font-medium" colSpan={5}>{m.nombre} <span className="text-xs font-normal text-slate-500">· {m.variantes.length} variantes{m.planillaIL !== 'NINGUNA' ? ` · ${m.planillaIL}` : ''}</span></td>
                          <td />
                        </tr>
                        {abiertos[m.id] && m.variantes.map((v) => (
                          <tr key={v.id} className={`border-t border-slate-50 ${v.activa ? '' : 'opacity-50'}`}>
                            <td className="px-4 py-1.5 pl-9 font-mono text-xs">{v.codigo}</td>
                            <td className="px-4 py-1.5 text-xs text-slate-600">{v.denominacion ?? v.observaciones ?? ''}</td>
                            <td className="px-4 py-1.5 text-xs">{v.revistas.filter((r) => r !== 'TRANSITORIO').map((r) => REVISTA[r]).join(' / ') || '—'}</td>
                            <td className="px-4 py-1.5 text-xs">{v.encuadreLegal ?? '—'}</td>
                            <td className="px-4 py-1.5 text-xs">{pago(v.pctHaberes)}</td>
                            <td className="px-4 py-1.5 text-xs">{v.autoridad ? AUTORIDAD[v.autoridad] : '—'}</td>
                            <td className="px-4 py-1.5 text-xs">
                              {v.reglaVigente ? <button className="text-marca-700 hover:underline" onClick={() => setReglasDe({ id: v.id, codigo: v.codigo })}>v{v.reglaVigente.version}{v.reglaVigente.resumen?.diferencia ? ' *' : ''}</button>
                                : <Insignia color="bg-amber-50 text-amber-800 ring-amber-300">Sin regla</Insignia>}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-slate-500">* La regla resuelve una diferencia entre el nomenclador y la ley (ver detalle de la regla).</p>
        </Tarjeta>
      )}
      {reglasDe && <ReglasModal variante={reglasDe} editable={gestiona} onCerrar={() => setReglasDe(undefined)} />}
    </>
  );
}

function ReglasModal({ variante, editable, onCerrar }: { variante: { id: string; codigo: string }; editable: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['reglas', variante.id], queryFn: async () => (await api.get<{ reglas: Version[] }>(`/nomenclador/variantes/${variante.id}/reglas`)).data });
  const [nueva, setNueva] = useState<{ vigenciaDesde: string; json: string; nota: string }>();
  const [error, setError] = useState<string[]>();
  const guardar = async () => {
    if (!nueva) return;
    let definicion: unknown;
    try { definicion = JSON.parse(nueva.json); } catch { return setError(['El JSON de la regla no es válido']); }
    try {
      await api.post(`/nomenclador/variantes/${variante.id}/reglas`, { vigenciaDesde: nueva.vigenciaDesde, definicion, nota: nueva.nota || undefined });
      setNueva(undefined);
      await Promise.all([qc.invalidateQueries({ queryKey: ['reglas', variante.id] }), qc.invalidateQueries({ queryKey: ['nomenclador'] })]);
    } catch (e) { setError(mensajesError(e)); }
  };
  return (
    <Modal abierto titulo={`Reglas de la variante ${variante.codigo}`} onCerrar={onCerrar} ancho="max-w-3xl">
      {isLoading ? <Cargando /> : (
        <div className="space-y-4">
          <Alerta mensajes={error} />
          {data?.reglas.map((r) => (
            <details key={r.id} open={r === data.reglas[0]} className="rounded-lg ring-1 ring-slate-200">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Versión {r.version} · vigente desde {fecha(r.vigenciaDesde)}{r.vigenciaHasta ? ` hasta ${fecha(r.vigenciaHasta)}` : ''}</summary>
              {r.nota && <p className="px-3 text-xs text-slate-600">{r.nota}</p>}
              <pre className="max-h-72 overflow-auto bg-slate-50 p-3 text-xs">{JSON.stringify(r.definicion, null, 2)}</pre>
            </details>
          ))}
          {editable && !nueva && (
            <div className="flex justify-end">
              <Boton variante="secundario" onClick={() => setNueva({ vigenciaDesde: new Date().toISOString().slice(0, 10), json: JSON.stringify(data?.reglas[0]?.definicion ?? {}, null, 2), nota: '' })}>Nueva versión</Boton>
            </div>
          )}
          {nueva && (
            <div className="space-y-3">
              <Campo etiqueta="Vigente desde" ayuda="La versión anterior se cierra el día previo; las solicitudes anteriores se siguen evaluando con su regla.">
                {(i) => <Input id={i} type="date" value={nueva.vigenciaDesde} onChange={(e) => setNueva({ ...nueva, vigenciaDesde: e.target.value })} />}
              </Campo>
              <Campo etiqueta="Definición (JSON)">{(i) => <Textarea id={i} rows={14} className="font-mono text-xs" value={nueva.json} onChange={(e) => setNueva({ ...nueva, json: e.target.value })} />}</Campo>
              <Campo etiqueta="Fundamento">{(i) => <Input id={i} value={nueva.nota} onChange={(e) => setNueva({ ...nueva, nota: e.target.value })} placeholder="Norma o resolución que motiva el cambio" />}</Campo>
              <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setNueva(undefined)}>Cancelar</Boton><Boton onClick={guardar}>Guardar versión</Boton></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
