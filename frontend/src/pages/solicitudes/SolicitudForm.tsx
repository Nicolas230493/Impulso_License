import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api, mensajesError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Designacion, Docente, DocenteDetalle, Evaluacion, Nomenclador, Paginado, SolicitudDetalle, TipoLicencia } from '@/types';
import { Alerta, Boton, Campo, Cargando, Encabezado, Input, Select, Tarjeta, Textarea } from '@/components/ui';
import { AGRUPACION, AUTORIDAD, CANAL, descripcionDesignacion, isoInput, REVISTA, UNIDAD, variantesPara } from '@/utils/formato';
import { P } from '@/utils/permisos';

interface Datos {
  docenteId: string; motivoId: string; tipoLicenciaId: string; designacionIds: string[]; fechaDesde: string; fechaHasta: string;
  fechaEvento: string; motivo: string; canalIngreso: string; avisoEn: string; ampliaciones: string[];
}

const NIVEL: Record<string, string> = {
  BLOQUEANTE: 'bg-red-50 text-red-800 ring-red-200',
  EXCEPCIONABLE: 'bg-amber-50 text-amber-900 ring-amber-200',
  ADVERTENCIA: 'bg-sky-50 text-sky-900 ring-sky-200',
};

/** Simulación con el motor de reglas: días, topes, saldos y requisitos antes de guardar. */
function Simulacion({ evaluacion, cargando, error }: { evaluacion?: Evaluacion; cargando: boolean; error?: string[] }) {
  if (cargando) return <p className="text-sm text-slate-500">Calculando…</p>;
  if (error) return <Alerta mensajes={error} />;
  if (!evaluacion) return <p className="text-sm text-slate-500">Complete motivo, designaciones y fechas para ver el cálculo.</p>;
  const hallazgos = [...new Map(evaluacion.porDesignacion.flatMap((x) => x.hallazgos).map((h) => [h.mensaje, h])).values()];
  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between"><span className="text-slate-500">Días a computar</span><span className="font-semibold">{evaluacion.diasPedidos} {UNIDAD[evaluacion.regla.unidad]}</span></div>
      {evaluacion.porDesignacion.map((x) => (
        <div key={x.designacionId} className="rounded-md bg-slate-50 p-2 text-xs">
          <p className="font-medium text-slate-700">{x.varianteCodigo} · {REVISTA[x.revista]} · encuadre {x.encuadreLegal ?? '—'}</p>
          {x.tope !== null && <p className="text-slate-600">Tope {x.tope} · disponibles {x.disponibles ?? '—'}{x.excedente ? ` · excede ${x.excedente}` : ''}</p>}
          {!!x.tramos.length && <p className="text-slate-600">Haberes: {x.tramos.map((t) => `${t.dias} d al ${t.pct} %`).join(' + ')}</p>}
        </div>
      ))}
      {evaluacion.regla.dictamenRM && <p className="text-xs text-slate-600">Requiere dictamen de Reconocimientos Médicos (24 h desde el reintegro).</p>}
      {evaluacion.regla.autoridad && evaluacion.regla.autoridad !== 'DIRECTOR' && <p className="text-xs text-slate-600">La otorga: {AUTORIDAD[evaluacion.regla.autoridad]}. La escuela la eleva.</p>}
      {hallazgos.map((h) => <p key={h.mensaje} className={`rounded-md px-2 py-1 text-xs ring-1 ${NIVEL[h.nivel]}`}>{h.mensaje}</p>)}
      {evaluacion.porDesignacion.some((x) => x.propuestaParticion) && (
        <p className="text-xs text-slate-600">Puede guardarla y luego partirla: lo que entra en el tope queda en esta solicitud y el resto pasa como prórroga del art. 347.</p>
      )}
    </div>
  );
}

export default function SolicitudForm() {
  const { id } = useParams();
  const { usuario, puede } = useAuth();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string[]>();
  const cargaTerceros = puede(P.LICENCIAS_CARGAR);
  const [buscarDoc, setBuscarDoc] = useState('');
  const [elegidas, setElegidas] = useState<Record<string, string>>({});

  const existente = useQuery({ queryKey: ['solicitud', id], queryFn: async () => (await api.get<SolicitudDetalle>(`/solicitudes/${id}`)).data, enabled: !!id });
  const nomenclador = useQuery({ queryKey: ['nomenclador'], queryFn: async () => (await api.get<Nomenclador>('/nomenclador')).data });
  const usaNomenclador = !!nomenclador.data?.motivos.length;
  const tipos = useQuery({ queryKey: ['tipos', 'vigentes'], queryFn: async () => (await api.get<TipoLicencia[]>('/tipos-licencia', { params: { vigentes: true } })).data, enabled: nomenclador.isSuccess && !usaNomenclador });
  const docentes = useQuery({
    queryKey: ['docentes', 'buscar', buscarDoc],
    queryFn: async () => (await api.get<Paginado<Docente>>('/docentes', { params: { buscar: buscarDoc || undefined, estadoLaboral: 'ACTIVO', porPagina: 50 } })).data.items,
    enabled: cargaTerceros && !id,
  });

  const { register, handleSubmit, watch, reset, setValue, formState: { isSubmitting } } = useForm<Datos>({
    defaultValues: { docenteId: cargaTerceros ? '' : usuario?.docenteId ?? '', designacionIds: [], fechaDesde: '', fechaHasta: '', fechaEvento: '', motivo: '', motivoId: '', tipoLicenciaId: '', canalIngreso: 'SISTEMA', avisoEn: '', ampliaciones: [] },
  });
  useEffect(() => {
    const s = existente.data;
    if (!s) return;
    reset({
      docenteId: s.docenteId, motivoId: s.motivoId ?? '', tipoLicenciaId: s.tipoLicenciaId, designacionIds: s.designaciones.map((d) => d.id),
      fechaDesde: isoInput(s.fechaDesde), fechaHasta: isoInput(s.fechaHasta), fechaEvento: s.fechaEvento ? isoInput(s.fechaEvento) : '', motivo: s.motivo ?? '',
      canalIngreso: s.canalIngreso ?? 'SISTEMA', avisoEn: s.avisoEn ? s.avisoEn.slice(0, 16) : '', ampliaciones: s.ampliaciones ?? [],
    });
    setElegidas(Object.fromEntries((s.variantes ?? []).map((v) => [v.designacionId, v.id])));
  }, [existente.data, reset]);

  const docenteId = watch('docenteId');
  const designaciones = useQuery({
    queryKey: ['docente', docenteId],
    queryFn: async () => (await api.get<DocenteDetalle>(`/docentes/${docenteId}`)).data,
    enabled: !!docenteId,
    select: (d) => d.designaciones.filter((x: Designacion) => x.activa),
  });

  const motivos = useMemo(
    () => (nomenclador.data?.motivos ?? []).filter((m) => m.agrupacion <= 3 && m.variantes.some((v) => v.reglaVigente?.resumen?.origen === 'SOLICITUD')),
    [nomenclador.data],
  );
  const motivo = motivos.find((m) => m.id === watch('motivoId'));
  const resumen = motivo?.variantes.find((v) => v.reglaVigente?.resumen)?.reglaVigente?.resumen ?? null;
  const todas = resumen?.alcanceCargos === 'TODOS';
  const seleccion = watch('designacionIds');
  const ids = todas ? (designaciones.data ?? []).map((d) => d.id) : seleccion ?? [];
  const desde = watch('fechaDesde'), hasta = watch('fechaHasta'), fechaEvento = watch('fechaEvento'), ampliaciones = watch('ampliaciones');

  // Variante por designación: automática si hay una sola (o solo cambia el % de haberes); si no, la elige el usuario.
  const porDesignacion = (designaciones.data ?? []).filter((d) => ids.includes(d.id)).map((d) => {
    const { candidatas, hayQueElegir } = motivo ? variantesPara(motivo.variantes, d.situacionRevista) : { candidatas: [], hayQueElegir: false };
    const auto = !hayQueElegir ? [...candidatas].sort((a, b) => (b.pctHaberes ?? 0) - (a.pctHaberes ?? 0))[0]?.id : undefined;
    return { d, candidatas, hayQueElegir, varianteId: hayQueElegir ? elegidas[d.id] : auto };
  });
  const completo = !!motivo && !!docenteId && porDesignacion.length > 0 && porDesignacion.every((x) => x.varianteId) && !!desde && !!hasta && hasta >= desde;
  const pedido = completo ? {
    docenteId, designacionIds: porDesignacion.map((x) => x.d.id), variantes: porDesignacion.map((x) => ({ designacionId: x.d.id, varianteId: x.varianteId! })),
    desde, hasta, fechaEvento: fechaEvento || undefined, ampliaciones: ampliaciones?.length ? ampliaciones : undefined, excluirSolicitudId: id,
  } : null;
  const simulacion = useQuery({
    queryKey: ['simular', pedido],
    queryFn: async () => (await api.post<Evaluacion>('/nomenclador/simular', pedido)).data,
    enabled: !!pedido,
    retry: false,
  });

  const enviar = async (d: Datos) => {
    setError(undefined);
    if (d.fechaHasta < d.fechaDesde) return setError(['La fecha final no puede ser anterior a la inicial']);
    let cuerpo: Record<string, unknown>;
    if (usaNomenclador) {
      if (!motivo) return setError(['Elija el motivo de la licencia']);
      if (!porDesignacion.length) return setError(['Seleccione al menos una designación afectada']);
      if (porDesignacion.some((x) => !x.varianteId)) return setError(['Elija la variante del nomenclador de cada designación']);
      cuerpo = {
        motivoId: motivo.id, designacionIds: porDesignacion.map((x) => x.d.id),
        variantes: porDesignacion.filter((x) => x.hayQueElegir).map((x) => ({ designacionId: x.d.id, varianteId: x.varianteId })),
        fechaDesde: d.fechaDesde, fechaHasta: d.fechaHasta, fechaEvento: d.fechaEvento || undefined, ampliaciones: d.ampliaciones ?? [], motivo: d.motivo || undefined,
        ...(cargaTerceros && d.docenteId !== usuario?.docenteId && { canalIngreso: d.canalIngreso, avisoEn: d.avisoEn ? new Date(d.avisoEn).toISOString() : undefined }),
      };
    } else {
      if (!d.designacionIds?.length) return setError(['Seleccione al menos una designación afectada']);
      cuerpo = { tipoLicenciaId: d.tipoLicenciaId, designacionIds: d.designacionIds, fechaDesde: d.fechaDesde, fechaHasta: d.fechaHasta, motivo: d.motivo || undefined };
    }
    try {
      const r = id
        ? await api.patch(`/solicitudes/${id}`, { ...cuerpo, version: existente.data?.version })
        : await api.post('/solicitudes', { ...cuerpo, docenteId: d.docenteId || undefined });
      await qc.invalidateQueries({ queryKey: ['solicitudes'] });
      await qc.invalidateQueries({ queryKey: ['solicitud', r.data.id] });
      navegar(`/solicitudes/${r.data.id}`);
    } catch (e) { setError(mensajesError(e)); }
  };

  if ((id && existente.isLoading) || nomenclador.isLoading) return <Cargando />;
  const porAgrupacion: Record<string, typeof motivos> = {};
  for (const m of motivos) (porAgrupacion[AGRUPACION[m.agrupacion]] ??= []).push(m);
  const tercero = cargaTerceros && !!docenteId && docenteId !== usuario?.docenteId;

  return (
    <>
      <Encabezado titulo={id ? `Editar solicitud ${existente.data?.numero}` : 'Nueva solicitud de licencia'}
        subtitulo="Se guarda como borrador. Podrá adjuntar la documentación y presentarla desde el detalle." />
      <form onSubmit={handleSubmit(enviar)} className="grid gap-6 lg:grid-cols-3" noValidate>
        <div className="space-y-6 lg:col-span-2">
          <Alerta mensajes={error} />
          <Tarjeta titulo="Datos de la licencia">
            <div className="grid gap-4 sm:grid-cols-2">
              {cargaTerceros && !id && (
                <>
                  <Campo etiqueta="Buscar docente">{(i) => <Input id={i} placeholder="Apellido, DNI o legajo" value={buscarDoc} onChange={(e) => setBuscarDoc(e.target.value)} />}</Campo>
                  <Campo etiqueta="Docente">{(i) => (
                    <Select id={i} {...register('docenteId', { required: true })}>
                      <option value="">Seleccione…</option>
                      {usuario?.docenteId && <option value={usuario.docenteId}>Yo mismo/a</option>}
                      {docentes.data?.map((d) => <option key={d.id} value={d.id}>{d.apellido}, {d.nombre} ({d.legajo})</option>)}
                    </Select>
                  )}</Campo>
                </>
              )}
              {usaNomenclador ? (
                <Campo className="sm:col-span-2" etiqueta="Motivo (nomenclador Ley 647-E)">{(i) => (
                  <Select id={i} {...register('motivoId', { required: true })} onChange={(e) => { setValue('motivoId', e.target.value); setElegidas({}); setValue('ampliaciones', []); }}>
                    <option value="">Seleccione…</option>
                    {Object.entries(porAgrupacion).map(([agr, ms]) => (
                      <optgroup key={agr} label={agr}>{ms.map((m) => <option key={m.id} value={m.id}>{m.codigo} – {m.nombre.charAt(0) + m.nombre.slice(1).toLowerCase()}</option>)}</optgroup>
                    ))}
                  </Select>
                )}</Campo>
              ) : (
                <Campo className="sm:col-span-2" etiqueta="Tipo de licencia">{(i) => (
                  <Select id={i} {...register('tipoLicenciaId', { required: true })}>
                    <option value="">Seleccione…</option>
                    {tipos.data?.map((t) => <option key={t.id} value={t.id}>{t.codigo} – {t.nombre}</option>)}
                  </Select>
                )}</Campo>
              )}
              <Campo etiqueta="Desde">{(i) => <Input id={i} type="date" required {...register('fechaDesde', { required: true })} />}</Campo>
              <Campo etiqueta="Hasta">{(i) => <Input id={i} type="date" required min={desde} {...register('fechaHasta', { required: true })} />}</Campo>
              {resumen?.fechaEvento && (
                <Campo etiqueta={`Fecha de ${resumen.fechaEvento.etiqueta}`} ayuda={resumen.fechaEvento.dentroDelPeriodo ? 'Debe estar dentro del período pedido.' : undefined}>
                  {(i) => <Input id={i} type="date" required={resumen.fechaEvento!.requerida} {...register('fechaEvento')} />}
                </Campo>
              )}
              {!!resumen?.ampliaciones.length && (
                <fieldset className="sm:col-span-2 space-y-1">
                  <legend className="text-sm font-medium text-slate-700">Ampliaciones (deben acreditarse)</legend>
                  {resumen.ampliaciones.map((a) => (
                    <label key={a.clave} className="flex items-center gap-2 text-sm"><input type="checkbox" value={a.clave} {...register('ampliaciones')} className="rounded border-slate-300" /> {a.condicion} (+{a.dias} días)</label>
                  ))}
                </fieldset>
              )}
              {tercero && (
                <>
                  <Campo etiqueta="Ingresó por">{(i) => (
                    <Select id={i} {...register('canalIngreso')}>{Object.entries(CANAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  )}</Campo>
                  <Campo etiqueta="Fecha y hora del aviso" ayuda="Arts. 313 d y 326">{(i) => <Input id={i} type="datetime-local" {...register('avisoEn')} />}</Campo>
                </>
              )}
              <Campo className="sm:col-span-2" etiqueta="Motivo / observaciones" ayuda={resumen?.sensible || resumen?.reservada ? 'Información sensible: solo visible para usted y personal autorizado.' : undefined}>
                {(i) => <Textarea id={i} {...register('motivo')} />}
              </Campo>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Designaciones afectadas">
            {!docenteId ? <p className="text-sm text-slate-500">Seleccione un docente.</p>
              : designaciones.isLoading ? <Cargando /> : (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Designaciones afectadas</legend>
                  {todas && <p className="text-xs text-slate-600">Esta licencia abarca todas las designaciones del docente (arts. 331 y 340).</p>}
                  {designaciones.data?.map((d) => {
                    const x = porDesignacion.find((p) => p.d.id === d.id);
                    return (
                      <div key={d.id} className="rounded-lg p-3 ring-1 ring-slate-200">
                        <label className="flex cursor-pointer items-start gap-3">
                          <input type="checkbox" value={d.id} disabled={todas} checked={todas || undefined} {...(todas ? {} : register('designacionIds'))} className="mt-0.5 rounded border-slate-300" />
                          <span>
                            <span className="block text-sm font-medium text-slate-900">{d.cargo.nombre} · {REVISTA[d.situacionRevista]}</span>
                            <span className="block text-xs text-slate-500">{descripcionDesignacion(d)}{d.horasCatedra ? ` · ${d.horasCatedra} hs` : ''}</span>
                          </span>
                        </label>
                        {x && motivo && (x.candidatas.length === 0
                          ? <p className="mt-2 text-xs text-red-700">El motivo no tiene variante para la revista {REVISTA[d.situacionRevista].toLowerCase()}.</p>
                          : x.hayQueElegir && (
                            <Select aria-label="Variante" className="mt-2" value={elegidas[d.id] ?? ''} onChange={(e) => setElegidas({ ...elegidas, [d.id]: e.target.value })}>
                              <option value="">Elija la variante…</option>
                              {x.candidatas.map((v) => <option key={v.id} value={v.id}>{v.codigo} – {v.denominacion ?? v.observaciones ?? `${v.pctHaberes ?? '?'} % de haberes`}</option>)}
                            </Select>
                          ))}
                      </div>
                    );
                  })}
                  {!designaciones.data?.length && <p className="text-sm text-slate-500">El docente no tiene designaciones activas.</p>}
                </fieldset>
              )}
          </Tarjeta>
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => navegar(-1)}>Cancelar</Boton>
            <Boton type="submit" cargando={isSubmitting}>Guardar borrador</Boton>
          </div>
        </div>
        <aside className="space-y-4">
          {usaNomenclador && (
            <Tarjeta titulo="Cálculo según la Ley 647-E">
              <Simulacion evaluacion={simulacion.data} cargando={simulacion.isFetching} error={simulacion.error ? mensajesError(simulacion.error) : undefined} />
            </Tarjeta>
          )}
          {resumen && (
            <Tarjeta titulo="Requisitos">
              {resumen.topeTexto && <p className="mb-2 text-sm text-slate-600">{resumen.topeTexto}</p>}
              <p className="text-xs font-semibold uppercase text-slate-500">Documentación</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {resumen.documentacion.length ? resumen.documentacion.map((d) => <li key={d.nombre}>{d.nombre}{d.plazoHoras ? ` (dentro de ${d.plazoHoras} h)` : ''}</li>) : <li>No requiere</li>}
              </ul>
              {!!resumen.informativos.length && <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">{resumen.informativos.map((t) => <li key={t}>{t}</li>)}</ul>}
              {resumen.nota && <p className="mt-2 text-xs text-slate-500">{resumen.nota}</p>}
            </Tarjeta>
          )}
        </aside>
      </form>
    </>
  );
}
