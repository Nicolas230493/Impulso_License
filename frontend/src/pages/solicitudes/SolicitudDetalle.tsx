import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, CheckCircle2, Circle, FileText, Inbox, Lock, MessageSquareWarning, Pencil, Send, Trash2, Upload, UserCheck, XCircle } from 'lucide-react';
import { api, descargar, esConflicto, mensajesError } from '@/services/api';
import type { SolicitudDetalle as Detalle } from '@/types';
import { Alerta, Boton, Campo, Cargando, Dato, Encabezado, Input, Insignia, Modal, Select, Tarjeta, Textarea } from '@/components/ui';
import { EstadoReemplazoBadge, EstadoSolicitudBadge } from '@/components/Estados';
import { CANAL, CATEGORIA, descripcionDesignacion, ESTADO_SOLICITUD, fecha, fechaHora, hoyISO, REVISTA, tamanio, UNIDAD } from '@/utils/formato';

type Dialogo = null | 'OBSERVADA' | 'RECHAZADA' | 'APROBADA' | 'anular' | 'reincorporar' | 'documento' | 'DICTAMEN' | 'RESOLUCION' | 'excepcion' | 'interrumpir';

export default function SolicitudDetalle() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string[]>();
  const [exito, setExito] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const { data: s, isLoading, error: errCarga } = useQuery({ queryKey: ['solicitud', id], queryFn: async () => (await api.get<Detalle>(`/solicitudes/${id}`)).data });

  const accion = async (fn: () => Promise<unknown>, mensaje: string) => {
    setError(undefined); setExito(undefined); setOcupado(true);
    try {
      await fn();
      setDialogo(null); setExito(mensaje);
      await Promise.all([qc.invalidateQueries({ queryKey: ['solicitud', id] }), qc.invalidateQueries({ queryKey: ['solicitudes'] }), qc.invalidateQueries({ queryKey: ['bandeja'] }), qc.invalidateQueries({ queryKey: ['panel'] })]);
    } catch (e) {
      // 409: otra persona modificó la solicitud. Se muestra el aviso y se recargan los datos actuales.
      setError(esConflicto(e) ? ['Otra persona modificó esta solicitud mientras la veía. Se recargaron los datos: revise y vuelva a intentar.'] : mensajesError(e));
      setDialogo(null);
      if (esConflicto(e)) await qc.invalidateQueries({ queryKey: ['solicitud', id] });
    } finally { setOcupado(false); }
  };

  if (isLoading) return <Cargando />;
  if (!s) return <Alerta mensajes={mensajesError(errCarga)} />;
  const a = s.acciones;
  const faltantes = s.tipoLicencia.documentacionRequerida.filter((r) => !s.documentos.some((d) => d.tipoDocumento.toLowerCase() === r.toLowerCase()));
  const pasoActual = s.circuito?.pasos.find((p) => p.orden === s.pasoActual);

  return (
    <>
      <Encabezado
        titulo={<span className="flex flex-wrap items-center gap-3">{s.numero} <EstadoSolicitudBadge estado={s.estado} /></span>}
        subtitulo={`${s.docente.apellido}, ${s.docente.nombre} · Legajo ${s.docente.legajo} · ${s.tipoLicencia.nombre}`}
        acciones={
          <>
            {a.editar && <Link to={`/solicitudes/${s.id}/editar`}><Boton variante="secundario"><Pencil className="size-4" /> Editar</Boton></Link>}
            {a.presentar && <Boton cargando={ocupado} onClick={() => accion(() => api.post(`/solicitudes/${s.id}/presentar`, { version: s.version }), 'Solicitud presentada. Se notificó a Secretaría.')}><Send className="size-4" /> Presentar</Boton>}
            {a.tomar && <Boton cargando={ocupado} onClick={() => accion(() => api.post(`/solicitudes/${s.id}/tomar`, { version: s.version }), 'Solicitud recibida para revisión.')}><Inbox className="size-4" /> Recibir para revisión</Boton>}
            {a.decidir && <>
              <Boton variante="exito" onClick={() => setDialogo('APROBADA')}><Check className="size-4" /> Aprobar</Boton>
              <Boton variante="secundario" onClick={() => setDialogo('OBSERVADA')}><MessageSquareWarning className="size-4" /> Observar</Boton>
              <Boton variante="peligro" onClick={() => setDialogo('RECHAZADA')}><XCircle className="size-4" /> Rechazar</Boton>
            </>}
            {a.cargarDictamen && <Boton onClick={() => setDialogo('DICTAMEN')}><FileText className="size-4" /> Cargar dictamen</Boton>}
            {a.cargarResolucion && <Boton onClick={() => setDialogo('RESOLUCION')}><FileText className="size-4" /> Cargar resolución</Boton>}
            {a.excepcion && <Boton variante="secundario" onClick={() => setDialogo('excepcion')}>Conceder excepción</Boton>}
            {a.partir && <Boton variante="secundario" cargando={ocupado} onClick={() => confirm('Lo que entra en el tope queda en esta solicitud y el resto pasa a una prórroga del art. 347 en borrador. ¿Continuar?') && accion(() => api.post(`/solicitudes/${s.id}/partir`, { version: s.version }), 'Solicitud partida. El resto quedó como prórroga en borrador.')}>Partir solicitud</Boton>}
            {a.interrumpir && <Boton variante="secundario" onClick={() => setDialogo('interrumpir')}>Interrumpir anual</Boton>}
            {a.reencuadrar && <Boton variante="secundario" cargando={ocupado} onClick={() => confirm('La solicitud pasa a largo tratamiento (art. 316): se crea una nueva en borrador y esta queda reencuadrada. ¿Continuar?') && accion(() => api.post(`/solicitudes/${s.id}/reencuadrar`, { version: s.version }), 'Reencuadrada como largo tratamiento. Complete y presente la nueva solicitud.')}>Reencuadrar</Boton>}
            {a.disposicion && <Boton variante="secundario" onClick={() => descargar(`/solicitudes/${s.id}/disposicion.pdf`, `disposicion-${s.numero}.pdf`).catch((e) => setError(mensajesError(e)))}><FileText className="size-4" /> Disposición</Boton>}
            {a.reincorporar && <Boton onClick={() => setDialogo('reincorporar')}><UserCheck className="size-4" /> Registrar reincorporación</Boton>}
            {a.anular && <Boton variante="fantasma" onClick={() => setDialogo('anular')}><Ban className="size-4" /> Anular</Boton>}
          </>
        }
      />
      <div className="mb-6 space-y-3">
        <Alerta mensajes={error} />
        {exito && <Alerta tipo="exito" mensajes={[exito]} />}
        {s.estado === 'OBSERVADA' && <Alerta tipo="info" mensajes={[`Observación: ${s.historial.at(-1)?.comentario ?? ''}`, 'Corrija lo indicado y vuelva a presentar la solicitud.']} />}
        {a.decidir && pasoActual && <Alerta tipo="info" mensajes={[`Esta solicitud espera su intervención: ${pasoActual.nombre}.`]} />}
        {s.estado === 'PENDIENTE_DICTAMEN' && <Alerta tipo="info" mensajes={['Espera el dictamen de Reconocimientos Médicos. Sin dictamen dentro de las 24 h del reintegro, las faltas pasan a injustificadas (art. 313).']} />}
        {s.estado === 'ELEVADA' && <Alerta tipo="info" mensajes={['Elevada a la autoridad externa: se otorga al registrar su resolución.']} />}
        {s.dictamenVencido && <Alerta mensajes={['Venció el plazo del dictamen de Reconocimientos Médicos: las faltas del período quedaron injustificadas.']} />}
        {s.excepcionMotivo && <Alerta tipo="info" mensajes={[`Excepción concedida (${s.excepcionInstrumento}): ${s.excepcionMotivo}`]} />}
        {(s.padre || !!s.derivadas?.length) && (
          <Alerta tipo="info">
            {s.padre && <p>Deriva de la solicitud <Link className="font-medium underline" to={`/solicitudes/${s.padre.id}`}>{s.padre.numero}</Link>.</p>}
            {s.derivadas?.map((x) => <p key={x.id}>Solicitud derivada: <Link className="font-medium underline" to={`/solicitudes/${x.id}`}>{x.numero}</Link> ({ESTADO_SOLICITUD[x.estado].texto}).</p>)}
          </Alerta>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Tarjeta titulo="Datos de la solicitud">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Dato etiqueta={s.motivoNomenclador ? 'Motivo (Ley 647-E)' : 'Tipo de licencia'}>{s.tipoLicencia.reservado ? s.tipoLicencia.nombre : `${s.tipoLicencia.codigo} – ${s.tipoLicencia.nombre}`}</Dato>
              <Dato etiqueta="Categoría">{s.tipoLicencia.reservado ? 'Reservada' : CATEGORIA[s.tipoLicencia.categoria]}</Dato>
              <Dato etiqueta="Régimen">{s.tipoLicencia.regimen.nombre}</Dato>
              <Dato etiqueta="Desde">{fecha(s.fechaDesde)}</Dato>
              <Dato etiqueta="Hasta">{fecha(s.fechaHasta)}</Dato>
              <Dato etiqueta="Días computados">{s.diasComputados} {s.tipoLicencia.formaComputo === 'DIAS_HABILES' ? 'hábiles' : 'corridos'}</Dato>
              <Dato etiqueta="Presentada">{fechaHora(s.fechaSolicitud)}</Dato>
              <Dato etiqueta="Cargada por">{s.usuarios[s.solicitanteId]}</Dato>
              <Dato etiqueta="Haberes">{s.tramosHaberes?.length ? s.tramosHaberes.map((t) => `${t.dias} d al ${t.pct} %`).join(' + ') : s.pctHaberes !== null && s.pctHaberes !== undefined ? (s.pctHaberes === 0 ? 'Sin goce' : `${s.pctHaberes} %`) : s.tipoLicencia.conGoceHaberes ? 'Con goce' : 'Sin goce'}</Dato>
              {s.fechaEvento && <Dato etiqueta="Fecha del evento">{fecha(s.fechaEvento)}</Dato>}
              {s.canalIngreso && s.canalIngreso !== 'SISTEMA' && <Dato etiqueta="Ingresó por">{CANAL[s.canalIngreso]}{s.avisoEn ? ` · aviso ${fechaHora(s.avisoEn)}` : ''}</Dato>}
              {s.origen && s.origen !== 'SOLICITUD' && <Dato etiqueta="Origen">{s.origen === 'AUTOMATICA' ? 'Automática (designación)' : 'Novedad de RR.HH.'}</Dato>}
              <div className="sm:col-span-3"><Dato etiqueta="Motivo">{s.motivo ?? '—'}</Dato></div>
            </dl>
            {s.reincorporacion && (
              <div className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
                Reincorporación registrada el <strong>{fecha(s.reincorporacion.fechaEfectiva)}</strong>{s.reincorporacion.observaciones && ` — ${s.reincorporacion.observaciones}`}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Designaciones afectadas" sinPadding>
            <ul className="divide-y divide-slate-100">
              {s.designaciones.map((d) => (
                <li key={d.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-900">{d.cargo.nombre}</p>
                  <p className="text-xs text-slate-500">{descripcionDesignacion(d)}</p>
                  {s.variantes?.filter((v) => v.designacionId === d.id).map((v) => (
                    <p key={v.id} className="text-xs text-slate-600">Variante {v.codigo}{v.encuadreLegal ? ` · art. ${v.encuadreLegal}` : ''}{v.revista ? ` · ${REVISTA[v.revista]}` : ''}</p>
                  ))}
                </li>
              ))}
            </ul>
          </Tarjeta>

          {s.evaluacion && (
            <Tarjeta titulo="Evaluación según la Ley 647-E">
              <p className="mb-2 text-sm text-slate-700">{s.evaluacion.diasPedidos} {UNIDAD[s.evaluacion.regla.unidad]}
                {s.evaluacion.porDesignacion.map((x) => x.tope !== null ? ` · tope ${x.tope}, disponibles ${x.disponibles ?? '—'}` : '').filter((x, i, l) => x && l.indexOf(x) === i).join('')}</p>
              {[...s.evaluacion.bloqueantes.map((m) => ['bg-red-50 text-red-800 ring-red-200', m]), ...s.evaluacion.excepcionables.map((m) => ['bg-amber-50 text-amber-900 ring-amber-200', m]), ...s.evaluacion.advertencias.map((m) => ['bg-sky-50 text-sky-900 ring-sky-200', m])]
                .map(([c, m]) => <p key={m} className={`mb-1 rounded-md px-2 py-1 text-xs ring-1 ${c}`}>{m}</p>)}
              {s.evaluacion.admisible && !s.evaluacion.advertencias.length && <p className="text-xs text-emerald-700">Cumple los topes y requisitos.</p>}
            </Tarjeta>
          )}

          {!!s.instrumentos?.length && (
            <Tarjeta titulo="Instrumentos legales" sinPadding>
              <ul className="divide-y divide-slate-100">
                {s.instrumentos.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span>
                      <strong>{{ DISPOSICION: 'Disposición', RESOLUCION: 'Resolución', DICTAMEN: 'Dictamen' }[i.tipo]} N.º {i.numero}</strong> · {i.emisor} · {fecha(i.fecha)}
                      {i.favorable === false && <Insignia color="ml-2 bg-red-50 text-red-700 ring-red-300">Desfavorable</Insignia>}
                    </span>
                    {i.archivoId && <Boton variante="fantasma" onClick={() => descargar(`/archivos/${i.archivoId}`, `${i.tipo.toLowerCase()}-${i.numero}`).catch((e) => setError(mensajesError(e)))}>Descargar</Boton>}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <Tarjeta titulo="Documentación respaldatoria" sinPadding acciones={a.adjuntar && <Boton variante="secundario" onClick={() => setDialogo('documento')}><Upload className="size-4" /> Adjuntar</Boton>}>
            {!!faltantes.length && !['ANULADA', 'RECHAZADA', 'FINALIZADA'].includes(s.estado) && (
              <div className="border-b border-slate-100 px-5 py-3"><Alerta mensajes={[`Documentación obligatoria pendiente: ${faltantes.join(', ')}`]} /></div>
            )}
            {s.documentos.length ? (
              <ul className="divide-y divide-slate-100">
                {s.documentos.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <FileText className="size-5 text-slate-400" aria-hidden />
                    <button className="flex-1 text-left" onClick={() => descargar(`/archivos/${d.archivo.id}`, d.archivo.nombreOriginal).catch((e) => setError(mensajesError(e)))}>
                      <p className="text-sm font-medium text-marca-700 hover:underline">{d.tipoDocumento}{d.archivo.confidencial && <Lock className="ml-1 inline size-3.5 text-slate-500" aria-label="Confidencial" />}</p>
                      <p className="text-xs text-slate-500">{d.archivo.nombreOriginal} · {tamanio(d.archivo.tamanio)} · {fechaHora(d.createdAt)}</p>
                    </button>
                    {d.verificado ? <Insignia color="bg-emerald-50 text-emerald-700 ring-emerald-300">Verificado</Insignia> : <Insignia>Sin verificar</Insignia>}
                    {a.verificarDocumentos && (
                      <Boton variante="fantasma" onClick={() => accion(() => api.post(`/solicitudes/${s.id}/documentos/${d.id}/verificar`, { version: s.version }, { params: { valor: !d.verificado } }), d.verificado ? 'Verificación quitada.' : 'Documento verificado.')}>
                        {d.verificado ? 'Quitar verificación' : 'Verificar'}
                      </Boton>
                    )}
                    {a.editar && <Boton variante="fantasma" aria-label="Quitar" onClick={() => confirm('¿Quitar el documento?') && accion(() => api.delete(`/solicitudes/${s.id}/documentos/${d.id}`), 'Documento quitado.')}><Trash2 className="size-4" /></Boton>}
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-center text-sm text-slate-500">Sin documentación adjunta</p>}
          </Tarjeta>

          {!!s.reemplazos.length && (
            <Tarjeta titulo="Reemplazos" sinPadding>
              <ul className="divide-y divide-slate-100">
                {s.reemplazos.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{r.suplentes.map((x) => `${x.suplente.apellido}, ${x.suplente.nombre}`).join(' · ')} — {fecha(r.fechaDesde)} a {fecha(r.fechaHasta)}</span>
                    <EstadoReemplazoBadge estado={r.estado} />
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>

        <aside className="space-y-6">
          {s.circuito && (
            <Tarjeta titulo={`Circuito: ${s.circuito.nombre}`}>
              <ol className="space-y-3">
                {s.circuito.pasos.map((p) => {
                  const decisiones = s.autorizaciones.filter((x) => x.paso === p.orden);
                  const ultima = decisiones.at(-1);
                  const hecho = ultima?.decision === 'APROBADA' && (s.pasoActual > p.orden || ['AUTORIZADA', 'FINALIZADA'].includes(s.estado));
                  const actual = s.estado === 'EN_REVISION' && s.pasoActual === p.orden;
                  return (
                    <li key={p.id} className="flex gap-3">
                      {hecho ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className={`mt-0.5 size-5 shrink-0 ${actual ? 'text-sky-600' : 'text-slate-300'}`} aria-hidden />}
                      <div className="text-sm">
                        <p className={`font-medium ${actual ? 'text-sky-700' : 'text-slate-800'}`}>{p.orden}. {p.nombre}</p>
                        <p className="text-xs text-slate-500">{p.rol.nombre}</p>
                        {decisiones.map((x) => (
                          <p key={x.id} className="mt-1 text-xs text-slate-600">
                            <strong>{x.decision === 'APROBADA' ? 'Aprobado' : x.decision === 'OBSERVADA' ? 'Observado' : 'Rechazado'}</strong> por {s.usuarios[x.usuarioId]} · {fechaHora(x.fecha)}
                            {x.observacion && <span className="block italic">“{x.observacion}”</span>}
                          </p>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Tarjeta>
          )}
          <Tarjeta titulo="Historial">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {[...s.historial].reverse().map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-white ring-2 ring-marca-600" aria-hidden />
                  <p className="font-medium text-slate-800">{ESTADO_SOLICITUD[h.estadoNuevo].texto}</p>
                  <p className="text-xs text-slate-500">{fechaHora(h.fecha)} · {s.usuarios[h.usuarioId]}</p>
                  {h.comentario && <p className="mt-0.5 text-xs text-slate-600">{h.comentario}</p>}
                </li>
              ))}
            </ol>
          </Tarjeta>
        </aside>
      </div>

      <DialogoDecision tipo={dialogo} ocupado={ocupado} onCerrar={() => setDialogo(null)}
        onConfirmar={(texto) => {
          if (dialogo === 'anular') return accion(() => api.post(`/solicitudes/${s.id}/anular`, { comentario: texto || undefined, version: s.version }), 'Solicitud anulada.');
          if (dialogo === 'APROBADA' || dialogo === 'OBSERVADA' || dialogo === 'RECHAZADA')
            return accion(() => api.post(`/solicitudes/${s.id}/decision`, { decision: dialogo, observacion: texto || undefined, version: s.version }), dialogo === 'APROBADA' ? 'Paso aprobado.' : dialogo === 'OBSERVADA' ? 'Solicitud observada.' : 'Solicitud rechazada.');
        }} />
      <Modal abierto={dialogo === 'reincorporar'} titulo="Registrar reincorporación" onCerrar={() => setDialogo(null)}>
        <Reincorporacion fechaHasta={s.fechaHasta} ocupado={ocupado} onConfirmar={(f, obs) => accion(() => api.post(`/solicitudes/${s.id}/reincorporacion`, { fechaEfectiva: f, observaciones: obs || undefined, version: s.version }), 'Reincorporación registrada. La licencia quedó finalizada.')} />
      </Modal>
      <Modal abierto={dialogo === 'DICTAMEN' || dialogo === 'RESOLUCION'} titulo={dialogo === 'DICTAMEN' ? 'Dictamen de Reconocimientos Médicos' : 'Resolución de la autoridad externa'} onCerrar={() => setDialogo(null)}>
        <InstrumentoForm tipo={dialogo === 'DICTAMEN' ? 'DICTAMEN' : 'RESOLUCION'} ocupado={ocupado}
          onEnviar={(fd) => accion(() => { fd.set('version', String(s.version)); return api.post(`/solicitudes/${s.id}/instrumentos`, fd); }, dialogo === 'DICTAMEN' ? 'Dictamen registrado.' : 'Resolución registrada.')} />
      </Modal>
      <Modal abierto={dialogo === 'excepcion'} titulo="Conceder excepción a topes o requisitos" onCerrar={() => setDialogo(null)}>
        <ExcepcionForm hallazgos={s.evaluacion?.excepcionables ?? []} ocupado={ocupado}
          onEnviar={(motivo, instrumentoLegal) => accion(() => api.post(`/solicitudes/${s.id}/excepcion`, { motivo, instrumentoLegal, version: s.version }), 'Excepción registrada.')} />
      </Modal>
      <Modal abierto={dialogo === 'interrumpir'} titulo="Interrumpir la licencia anual (art. 315)" onCerrar={() => setDialogo(null)}>
        <InterrupcionForm ocupado={ocupado}
          onEnviar={(f, causa, obs) => accion(() => api.post(`/solicitudes/${s.id}/interrumpir`, { fecha: f, causa, observaciones: obs || undefined, version: s.version }), 'Licencia interrumpida. El resto quedó como borrador para retomarla.')} />
      </Modal>
      <Modal abierto={dialogo === 'documento'} titulo="Adjuntar documentación" onCerrar={() => setDialogo(null)}>
        <SubirDocumento requeridos={s.tipoLicencia.documentacionRequerida} ocupado={ocupado} onSubir={(fd) => accion(() => { fd.set('version', String(s.version)); return api.post(`/solicitudes/${s.id}/documentos`, fd); }, 'Documento adjuntado.')} />
      </Modal>
    </>
  );
}

function DialogoDecision({ tipo, ocupado, onCerrar, onConfirmar }: { tipo: Dialogo; ocupado: boolean; onCerrar: () => void; onConfirmar: (t: string) => void }) {
  const [texto, setTexto] = useState('');
  const conf = {
    APROBADA: { titulo: 'Aprobar', etiqueta: 'Observaciones (opcional)', boton: 'Aprobar', variante: 'exito' as const, obligatorio: false },
    OBSERVADA: { titulo: 'Observar solicitud', etiqueta: 'Indique qué debe corregirse', boton: 'Observar', variante: 'primario' as const, obligatorio: true },
    RECHAZADA: { titulo: 'Rechazar solicitud', etiqueta: 'Fundamento del rechazo', boton: 'Rechazar', variante: 'peligro' as const, obligatorio: true },
    anular: { titulo: 'Anular solicitud', etiqueta: 'Motivo de la anulación', boton: 'Anular', variante: 'peligro' as const, obligatorio: false },
  }[tipo as 'APROBADA'];
  if (!conf) return null;
  return (
    <Modal abierto titulo={conf.titulo} onCerrar={() => { setTexto(''); onCerrar(); }}>
      <form onSubmit={(e) => { e.preventDefault(); onConfirmar(texto); setTexto(''); }} className="space-y-4">
        <Campo etiqueta={conf.etiqueta}>{(i) => <Textarea id={i} required={conf.obligatorio} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />}</Campo>
        <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" variante={conf.variante} cargando={ocupado}>{conf.boton}</Boton></div>
      </form>
    </Modal>
  );
}

function Reincorporacion({ fechaHasta, ocupado, onConfirmar }: { fechaHasta: string; ocupado: boolean; onConfirmar: (f: string, o: string) => void }) {
  const siguiente = new Date(`${fechaHasta.slice(0, 10)}T00:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  const [f, setF] = useState(siguiente.toISOString().slice(0, 10) > hoyISO() ? hoyISO() : siguiente.toISOString().slice(0, 10));
  const [o, setO] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirmar(f, o); }} className="space-y-4">
      <p className="text-sm text-slate-600">La licencia finaliza el {fecha(fechaHasta)}. Si la reincorporación es anticipada, los reemplazos vinculados se cerrarán el día anterior.</p>
      <Campo etiqueta="Fecha efectiva de reincorporación">{(i) => <Input id={i} type="date" required value={f} onChange={(e) => setF(e.target.value)} />}</Campo>
      <Campo etiqueta="Observaciones">{(i) => <Textarea id={i} value={o} onChange={(e) => setO(e.target.value)} />}</Campo>
      <div className="flex justify-end"><Boton type="submit" cargando={ocupado}>Registrar</Boton></div>
    </form>
  );
}

function SubirDocumento({ requeridos, ocupado, onSubir }: { requeridos: string[]; ocupado: boolean; onSubir: (fd: FormData) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState(requeridos[0] ?? 'Otro');
  const [otro, setOtro] = useState('');
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      const f = ref.current?.files?.[0];
      if (!f) return;
      const fd = new FormData();
      fd.append('tipoDocumento', tipo === 'Otro' ? otro || 'Otro' : tipo);
      fd.append('archivo', f);
      onSubir(fd);
    }}>
      <Campo etiqueta="Tipo de documento">{(i) => <Select id={i} value={tipo} onChange={(e) => setTipo(e.target.value)}>{[...requeridos, 'Otro'].map((r) => <option key={r}>{r}</option>)}</Select>}</Campo>
      {tipo === 'Otro' && <Campo etiqueta="Descripción">{(i) => <Input id={i} value={otro} onChange={(e) => setOtro(e.target.value)} />}</Campo>}
      <Campo etiqueta="Archivo" ayuda="PDF, PNG o JPG — máximo 10 MB">{(i) => <Input id={i} ref={ref} type="file" required accept=".pdf,.png,.jpg,.jpeg" />}</Campo>
      <div className="flex justify-end"><Boton type="submit" cargando={ocupado}><Upload className="size-4" /> Subir</Boton></div>
    </form>
  );
}

function InstrumentoForm({ tipo, ocupado, onEnviar }: { tipo: 'DICTAMEN' | 'RESOLUCION'; ocupado: boolean; onEnviar: (fd: FormData) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [d, setD] = useState({ numero: '', fecha: hoyISO(), emisor: tipo === 'DICTAMEN' ? 'Reconocimientos Médicos' : '', favorable: 'true', observaciones: '' });
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData();
      fd.append('tipo', tipo);
      Object.entries(d).forEach(([k, v]) => v && fd.append(k, v));
      const f = ref.current?.files?.[0];
      if (f) fd.append('archivo', f);
      onEnviar(fd);
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Número">{(i) => <Input id={i} required value={d.numero} onChange={(e) => setD({ ...d, numero: e.target.value })} />}</Campo>
        <Campo etiqueta="Fecha">{(i) => <Input id={i} type="date" required value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />}</Campo>
      </div>
      <Campo etiqueta="Emitido por" ayuda={tipo === 'RESOLUCION' ? 'Ministerio, Subsecretaría, Dirección Regional, Supervisión…' : undefined}>{(i) => <Input id={i} required value={d.emisor} onChange={(e) => setD({ ...d, emisor: e.target.value })} />}</Campo>
      <Campo etiqueta="Resultado">{(i) => (
        <Select id={i} value={d.favorable} onChange={(e) => setD({ ...d, favorable: e.target.value })}>
          <option value="true">{tipo === 'DICTAMEN' ? 'Favorable' : 'Otorga la licencia'}</option>
          <option value="false">{tipo === 'DICTAMEN' ? 'Desfavorable (se rechaza)' : 'Deniega la licencia'}</option>
        </Select>
      )}</Campo>
      <Campo etiqueta="Observaciones">{(i) => <Textarea id={i} value={d.observaciones} onChange={(e) => setD({ ...d, observaciones: e.target.value })} />}</Campo>
      <Campo etiqueta="Copia del instrumento (opcional)" ayuda="PDF, PNG o JPG — se guarda como confidencial">{(i) => <Input id={i} ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg" />}</Campo>
      <div className="flex justify-end"><Boton type="submit" cargando={ocupado}>Registrar</Boton></div>
    </form>
  );
}

function ExcepcionForm({ hallazgos, ocupado, onEnviar }: { hallazgos: string[]; ocupado: boolean; onEnviar: (motivo: string, instrumento: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [instrumento, setInstrumento] = useState('');
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onEnviar(motivo, instrumento); }}>
      {!!hallazgos.length && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{hallazgos.map((h) => <li key={h}>{h}</li>)}</ul>}
      <Campo etiqueta="Instrumento legal que la dispone">{(i) => <Input id={i} required value={instrumento} onChange={(e) => setInstrumento(e.target.value)} placeholder="Resolución N.º …" />}</Campo>
      <Campo etiqueta="Motivo">{(i) => <Textarea id={i} required value={motivo} onChange={(e) => setMotivo(e.target.value)} />}</Campo>
      <p className="text-xs text-slate-500">Queda registrada en la auditoría con su usuario.</p>
      <div className="flex justify-end"><Boton type="submit" cargando={ocupado}>Conceder excepción</Boton></div>
    </form>
  );
}

function InterrupcionForm({ ocupado, onEnviar }: { ocupado: boolean; onEnviar: (fecha: string, causa: string, obs: string) => void }) {
  const [f, setF] = useState(hoyISO());
  const [causa, setCausa] = useState('ENFERMEDAD');
  const [obs, setObs] = useState('');
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onEnviar(f, causa, obs); }}>
      <Campo etiqueta="Interrumpida desde">{(i) => <Input id={i} type="date" required value={f} onChange={(e) => setF(e.target.value)} />}</Campo>
      <Campo etiqueta="Causa">{(i) => (
        <Select id={i} value={causa} onChange={(e) => setCausa(e.target.value)}>
          <option value="ENFERMEDAD">Enfermedad</option><option value="MATERNIDAD">Maternidad</option><option value="RAZONES_DE_SERVICIO">Razones de servicio</option>
        </Select>
      )}</Campo>
      <Campo etiqueta="Observaciones">{(i) => <Textarea id={i} value={obs} onChange={(e) => setObs(e.target.value)} />}</Campo>
      <p className="text-xs text-slate-500">El resto de los días queda en una solicitud en borrador para retomarlos más adelante.</p>
      <div className="flex justify-end"><Boton type="submit" cargando={ocupado}>Interrumpir</Boton></div>
    </form>
  );
}
