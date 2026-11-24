import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, mensajesError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Circuito, Regimen, Rol, TipoLicencia } from '@/types';
import { Alerta, Boton, Campo, Cargando, Encabezado, Input, Insignia, Modal, Select, Tabla, Tarjeta, Textarea } from '@/components/ui';
import { CATEGORIA, fecha, isoInput, REGLA } from '@/utils/formato';
import { P } from '@/utils/permisos';

export default function Catalogo() {
  const { puede } = useAuth();
  const [regimen, setRegimen] = useState<{ abierto: boolean; r?: Regimen }>({ abierto: false });
  const [tipo, setTipo] = useState<{ abierto: boolean; t?: TipoLicencia }>({ abierto: false });
  const [circuito, setCircuito] = useState<{ abierto: boolean; c?: Circuito }>({ abierto: false });
  const regimenes = useQuery({ queryKey: ['regimenes'], queryFn: async () => (await api.get<Regimen[]>('/regimenes')).data });
  const tipos = useQuery({ queryKey: ['tipos'], queryFn: async () => (await api.get<TipoLicencia[]>('/tipos-licencia')).data });
  const circuitos = useQuery({ queryKey: ['circuitos'], queryFn: async () => (await api.get<Circuito[]>('/circuitos')).data });
  const cat = puede(P.CATALOGO_GESTIONAR), circ = puede(P.CIRCUITOS_GESTIONAR);

  return (
    <>
      <Encabezado titulo="Catálogo de licencias" subtitulo="Regímenes normativos, tipos de licencia, reglas y circuitos de autorización" />
      <Alerta tipo="info" mensajes={['Las reglas normativas son configurables y deben ser validadas por la autoridad competente de la jurisdicción.']} />
      <div className="mt-6 space-y-6">
        <Tarjeta sinPadding titulo="Regímenes" acciones={cat && <Boton onClick={() => setRegimen({ abierto: true })}><Plus className="size-4" /> Nuevo régimen</Boton>}>
          {regimenes.isLoading ? <Cargando /> : (
            <Tabla filas={regimenes.data ?? []} clave={(r) => r.id} alClick={cat ? (r) => setRegimen({ abierto: true, r }) : undefined}
              columnas={[
                { titulo: 'Código', celda: (r) => <span className="font-mono text-xs">{r.codigo}</span> },
                { titulo: 'Nombre', celda: (r) => <><p className="font-medium text-slate-900">{r.nombre}</p><p className="text-xs text-slate-500">{r.normativa}</p></> },
                { titulo: 'Gestión', celda: (r) => (r.tipoGestion === 'PUBLICA' ? 'Pública' : 'Privada') },
                { titulo: 'Vigencia', celda: (r) => `${fecha(r.vigenteDesde)} → ${r.vigenteHasta ? fecha(r.vigenteHasta) : 'actual'}` },
                { titulo: 'Tipos', celda: (r) => r._count?.tipos, className: 'text-center' },
                { titulo: 'Estado', celda: (r) => (r.activo ? <Insignia color="bg-emerald-50 text-emerald-700 ring-emerald-300">Activo</Insignia> : <Insignia>Inactivo</Insignia>) },
              ]} />
          )}
        </Tarjeta>

        <Tarjeta sinPadding titulo="Tipos de licencia" acciones={cat && <Boton onClick={() => setTipo({ abierto: true })} disabled={!regimenes.data?.length}><Plus className="size-4" /> Nuevo tipo</Boton>}>
          {tipos.isLoading ? <Cargando /> : (
            <Tabla filas={tipos.data ?? []} clave={(t) => t.id} alClick={cat ? (t) => setTipo({ abierto: true, t }) : undefined}
              columnas={[
                { titulo: 'Código', celda: (t) => <span className="whitespace-nowrap font-mono text-xs">{t.codigo}</span> },
                { titulo: 'Nombre', celda: (t) => <><p className="font-medium text-slate-900">{t.nombre}</p><p className="text-xs text-slate-500">{t.regimen.nombre}</p></> },
                { titulo: 'Categoría', celda: (t) => CATEGORIA[t.categoria] },
                { titulo: 'Cómputo', celda: (t) => (t.formaComputo === 'DIAS_HABILES' ? 'Hábiles' : 'Corridos') },
                { titulo: 'Documentación', celda: (t) => <span className="text-xs">{t.documentacionRequerida.join(', ') || '—'}</span> },
                { titulo: 'Reglas', celda: (t) => <ul className="text-xs">{t.reglas.map((r) => <li key={r.tipo}>{REGLA[r.tipo]}: {r.valor}</li>)}</ul> },
                { titulo: 'Circuito', celda: (t) => <span className="text-xs">{t.circuito?.nombre ?? 'Predeterminado'}</span> },
                { titulo: '', celda: (t) => !t.activo && <Insignia>Inactivo</Insignia> },
              ]} />
          )}
        </Tarjeta>

        <Tarjeta sinPadding titulo="Circuitos de autorización" acciones={circ && <Boton onClick={() => setCircuito({ abierto: true })}><Plus className="size-4" /> Nuevo circuito</Boton>}>
          {circuitos.isLoading ? <Cargando /> : (
            <ul className="divide-y divide-slate-100">
              {circuitos.data?.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="flex items-center gap-2 font-medium text-slate-900">{c.nombre} {c.predeterminado && <Insignia color="bg-marca-50 text-marca-700 ring-marca-600/30">Predeterminado</Insignia>}</p>
                    {c.descripcion && <p className="text-xs text-slate-500">{c.descripcion}</p>}
                    <ol className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {c.pasos.map((p, i) => <li key={p.id} className="flex items-center gap-2">{i > 0 && <span className="text-slate-300">→</span>}<span className="rounded bg-slate-100 px-2 py-1">{p.orden}. {p.nombre} <span className="text-slate-500">({p.rol.nombre})</span></span></li>)}
                    </ol>
                  </div>
                  {circ && <Boton variante="fantasma" onClick={() => setCircuito({ abierto: true, c })}><Pencil className="size-4" /> Editar</Boton>}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
      {regimen.abierto && <RegimenModal r={regimen.r} onCerrar={() => setRegimen({ abierto: false })} />}
      {tipo.abierto && <TipoModal t={tipo.t} regimenes={regimenes.data ?? []} circuitos={circuitos.data ?? []} onCerrar={() => setTipo({ abierto: false })} />}
      {circuito.abierto && <CircuitoModal c={circuito.c} onCerrar={() => setCircuito({ abierto: false })} />}
    </>
  );
}

function useGuardar(clave: string, onCerrar: () => void) {
  const qc = useQueryClient();
  const [error, setError] = useState<string[]>();
  const guardar = async (fn: () => Promise<unknown>) => {
    setError(undefined);
    try { await fn(); await qc.invalidateQueries({ queryKey: [clave] }); await qc.invalidateQueries({ queryKey: ['tipos'] }); onCerrar(); }
    catch (e) { setError(mensajesError(e)); }
  };
  return { error, guardar };
}

function RegimenModal({ r, onCerrar }: { r?: Regimen; onCerrar: () => void }) {
  const { error, guardar } = useGuardar('regimenes', onCerrar);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { codigo: r?.codigo ?? '', nombre: r?.nombre ?? '', tipoGestion: r?.tipoGestion ?? 'PRIVADA', normativa: r?.normativa ?? '', descripcion: r?.descripcion ?? '', vigenteDesde: isoInput(r?.vigenteDesde), vigenteHasta: isoInput(r?.vigenteHasta), activo: r?.activo ?? true },
  });
  return (
    <Modal abierto titulo={r ? 'Editar régimen' : 'Nuevo régimen'} onCerrar={onCerrar}>
      <form onSubmit={handleSubmit((d) => guardar(() => (r ? api.put(`/regimenes/${r.id}`, { ...d, vigenteHasta: d.vigenteHasta || undefined }) : api.post('/regimenes', { ...d, vigenteHasta: d.vigenteHasta || undefined }))))} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alerta mensajes={error} /></div>
        <Campo etiqueta="Código">{(i) => <Input id={i} required {...register('codigo')} />}</Campo>
        <Campo etiqueta="Gestión">{(i) => <Select id={i} {...register('tipoGestion')}><option value="PRIVADA">Privada</option><option value="PUBLICA">Pública</option></Select>}</Campo>
        <Campo className="sm:col-span-2" etiqueta="Nombre">{(i) => <Input id={i} required {...register('nombre')} />}</Campo>
        <Campo className="sm:col-span-2" etiqueta="Normativa de referencia">{(i) => <Input id={i} {...register('normativa')} />}</Campo>
        <Campo etiqueta="Vigente desde">{(i) => <Input id={i} type="date" required {...register('vigenteDesde')} />}</Campo>
        <Campo etiqueta="Vigente hasta">{(i) => <Input id={i} type="date" {...register('vigenteHasta')} />}</Campo>
        <Campo className="sm:col-span-2" etiqueta="Descripción">{(i) => <Textarea id={i} {...register('descripcion')} />}</Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('activo')} /> Activo</label>
        <div className="flex justify-end gap-2 sm:col-span-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={isSubmitting}>Guardar</Boton></div>
      </form>
    </Modal>
  );
}

function TipoModal({ t, regimenes, circuitos, onCerrar }: { t?: TipoLicencia; regimenes: Regimen[]; circuitos: Circuito[]; onCerrar: () => void }) {
  const { error, guardar } = useGuardar('tipos', onCerrar);
  const { register, control, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      regimenId: t?.regimenId ?? regimenes[0]?.id, circuitoId: t?.circuitoId ?? '', codigo: t?.codigo ?? '', nombre: t?.nombre ?? '', categoria: t?.categoria ?? 'SALUD',
      articulo: t?.articulo ?? '', descripcion: t?.descripcion ?? '', documentacion: (t?.documentacionRequerida ?? []).join('\n'), formaComputo: t?.formaComputo ?? 'DIAS_CORRIDOS',
      conGoceHaberes: t?.conGoceHaberes ?? true, autoridadCompetente: t?.autoridadCompetente ?? '', vigenteDesde: isoInput(t?.vigenteDesde), vigenteHasta: isoInput(t?.vigenteHasta), activo: t?.activo ?? true,
      reglas: (t?.reglas ?? []).map((r) => ({ tipo: r.tipo, valor: String(r.valor) })),
    },
  });
  const reglas = useFieldArray({ control, name: 'reglas' });
  return (
    <Modal abierto titulo={t ? `Editar ${t.codigo}` : 'Nuevo tipo de licencia'} onCerrar={onCerrar} ancho="max-w-3xl">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(({ documentacion, reglas: rs, ...d }) => {
        const cuerpo = {
          ...d, circuitoId: d.circuitoId || null, vigenteHasta: d.vigenteHasta || undefined, articulo: d.articulo || undefined, autoridadCompetente: d.autoridadCompetente || undefined,
          documentacionRequerida: documentacion.split('\n').map((x) => x.trim()).filter(Boolean), reglas: rs.map((r) => ({ tipo: r.tipo, valor: Number(r.valor) })),
        };
        return guardar(() => (t ? api.put(`/tipos-licencia/${t.id}`, cuerpo) : api.post('/tipos-licencia', cuerpo)));
      })}>
        <div className="sm:col-span-2"><Alerta mensajes={error} /></div>
        <Campo etiqueta="Régimen">{(i) => <Select id={i} {...register('regimenId')}>{regimenes.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</Select>}</Campo>
        <Campo etiqueta="Circuito de autorización">{(i) => <Select id={i} {...register('circuitoId')}><option value="">Predeterminado de la institución</option>{circuitos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>}</Campo>
        <Campo etiqueta="Código">{(i) => <Input id={i} required {...register('codigo')} />}</Campo>
        <Campo etiqueta="Artículo / norma">{(i) => <Input id={i} {...register('articulo')} />}</Campo>
        <Campo className="sm:col-span-2" etiqueta="Nombre">{(i) => <Input id={i} required {...register('nombre')} />}</Campo>
        <Campo etiqueta="Categoría">{(i) => <Select id={i} {...register('categoria')}>{Object.entries(CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Campo>
        <Campo etiqueta="Forma de cómputo">{(i) => <Select id={i} {...register('formaComputo')}><option value="DIAS_CORRIDOS">Días corridos</option><option value="DIAS_HABILES">Días hábiles</option></Select>}</Campo>
        <Campo etiqueta="Vigente desde">{(i) => <Input id={i} type="date" required {...register('vigenteDesde')} />}</Campo>
        <Campo etiqueta="Vigente hasta">{(i) => <Input id={i} type="date" {...register('vigenteHasta')} />}</Campo>
        <Campo etiqueta="Autoridad competente">{(i) => <Input id={i} {...register('autoridadCompetente')} />}</Campo>
        <div className="flex items-end gap-4 pb-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" {...register('conGoceHaberes')} /> Con goce de haberes</label>
          <label className="flex items-center gap-2"><input type="checkbox" {...register('activo')} /> Activo</label>
        </div>
        <Campo className="sm:col-span-2" etiqueta="Descripción">{(i) => <Textarea id={i} {...register('descripcion')} />}</Campo>
        <Campo className="sm:col-span-2" etiqueta="Documentación obligatoria" ayuda="Un documento por línea. Se exige al presentar la solicitud.">{(i) => <Textarea id={i} {...register('documentacion')} />}</Campo>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-slate-700">Reglas de duración y cómputo</legend>
          <div className="space-y-2">
            {reglas.fields.map((f, idx) => (
              <div key={f.id} className="flex gap-2">
                <Select aria-label="Regla" {...register(`reglas.${idx}.tipo`)}>{Object.entries(REGLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Input aria-label="Valor" type="number" min={0} className="w-28" required {...register(`reglas.${idx}.valor`)} />
                <Boton type="button" variante="fantasma" onClick={() => reglas.remove(idx)} aria-label="Quitar regla"><Trash2 className="size-4" /></Boton>
              </div>
            ))}
            <Boton type="button" variante="secundario" onClick={() => reglas.append({ tipo: 'MAX_DIAS_POR_ANIO', valor: '' })}><Plus className="size-4" /> Agregar regla</Boton>
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 sm:col-span-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={isSubmitting}>Guardar</Boton></div>
      </form>
    </Modal>
  );
}

function CircuitoModal({ c, onCerrar }: { c?: Circuito; onCerrar: () => void }) {
  const { error, guardar } = useGuardar('circuitos', onCerrar);
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<Rol[]>('/roles')).data, retry: false });
  const { register, control, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { nombre: c?.nombre ?? '', descripcion: c?.descripcion ?? '', predeterminado: c?.predeterminado ?? false, activo: c?.activo ?? true, pasos: c?.pasos.map((p) => ({ nombre: p.nombre, rolId: p.rolId })) ?? [{ nombre: '', rolId: '' }] },
  });
  const pasos = useFieldArray({ control, name: 'pasos' });
  const opcionesRol = roles.data ?? c?.pasos.map((p) => p.rol) ?? [];
  return (
    <Modal abierto titulo={c ? 'Editar circuito' : 'Nuevo circuito'} onCerrar={onCerrar} ancho="max-w-2xl">
      <form className="space-y-4" onSubmit={handleSubmit((d) => {
        const cuerpo = { ...d, descripcion: d.descripcion || undefined, pasos: d.pasos.map((p, i) => ({ ...p, orden: i + 1 })) };
        return guardar(() => (c ? api.put(`/circuitos/${c.id}`, cuerpo) : api.post('/circuitos', cuerpo)));
      })}>
        <Alerta mensajes={error} />
        <Campo etiqueta="Nombre">{(i) => <Input id={i} required {...register('nombre')} />}</Campo>
        <Campo etiqueta="Descripción">{(i) => <Input id={i} {...register('descripcion')} />}</Campo>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Pasos (en orden)</legend>
          <div className="space-y-2">
            {pasos.fields.map((f, idx) => (
              <div key={f.id} className="flex items-center gap-2">
                <span className="w-6 text-sm text-slate-500">{idx + 1}.</span>
                <Input aria-label="Nombre del paso" placeholder="Nombre del paso" required {...register(`pasos.${idx}.nombre`)} />
                <Select aria-label="Rol responsable" required className="w-56" {...register(`pasos.${idx}.rolId`)}>
                  <option value="">Rol responsable…</option>
                  {opcionesRol.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </Select>
                <Boton type="button" variante="fantasma" disabled={pasos.fields.length === 1} onClick={() => pasos.remove(idx)} aria-label="Quitar paso"><Trash2 className="size-4" /></Boton>
              </div>
            ))}
            <Boton type="button" variante="secundario" onClick={() => pasos.append({ nombre: '', rolId: '' })}><Plus className="size-4" /> Agregar paso</Boton>
          </div>
        </fieldset>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" {...register('predeterminado')} /> Circuito predeterminado</label>
          <label className="flex items-center gap-2"><input type="checkbox" {...register('activo')} /> Activo</label>
        </div>
        <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={isSubmitting}>Guardar</Boton></div>
      </form>
    </Modal>
  );
}
