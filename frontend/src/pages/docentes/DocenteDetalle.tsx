import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Lock, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api, descargar, mensajesError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Designacion, DocenteDetalle, Nomenclador, SolicitudResumen } from '@/types';
import { Alerta, Boton, Campo, Cargando, Dato, Encabezado, Input, Insignia, Modal, Select, Tabla, Tarjeta, Vacio } from '@/components/ui';
import { EstadoSolicitudBadge } from '@/components/Estados';
import { CATEGORIA, DIAS, ESTADO_LABORAL, fecha, hoyISO, REVISTA, tamanio, TURNO } from '@/utils/formato';
import { P } from '@/utils/permisos';
import DesignacionModal from './DesignacionModal';

const PESTANAS = ['Datos', 'Designaciones', 'Documentación', 'Licencias'] as const;

export function FichaDocente({ id }: { id: string }) {
  const { puede, usuario } = useAuth();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]>('Datos');
  const [modalDesig, setModalDesig] = useState<{ abierta: boolean; d?: Designacion }>({ abierta: false });
  const [modalDoc, setModalDoc] = useState(false);
  const [automatica, setAutomatica] = useState<Designacion>();
  const [novedad, setNovedad] = useState(false);
  const [error, setError] = useState<string[]>();
  const { data: d, isLoading, error: errCarga } = useQuery({ queryKey: ['docente', id], queryFn: async () => (await api.get<DocenteDetalle>(`/docentes/${id}`)).data });
  const licencias = useQuery({
    queryKey: ['docente', id, 'licencias'],
    queryFn: async () => (await api.get<SolicitudResumen[]>(`/docentes/${id}/licencias`)).data,
    enabled: pestana === 'Licencias',
  });
  const gestiona = puede(P.CARGOS_GESTIONAR);
  const propio = usuario?.docenteId === id;

  const baja = useMutation({
    mutationFn: ({ desigId, motivoCese }: { desigId: string; motivoCese?: string }) => api.post(`/designaciones/${desigId}/baja`, { fechaHasta: hoyISO(), motivoCese }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docente', id] }),
    onError: (e) => setError(mensajesError(e)),
  });
  const borrarDoc = useMutation({
    mutationFn: (docId: string) => api.delete(`/docentes/${id}/documentos/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docente', id] }),
  });

  if (isLoading) return <Cargando />;
  if (!d) return <Alerta mensajes={mensajesError(errCarga)} />;

  return (
    <>
      <Encabezado
        titulo={`${d.apellido}, ${d.nombre}`}
        subtitulo={<span className="flex flex-wrap items-center gap-2">Legajo {d.legajo} · DNI {d.dni} <Insignia>{ESTADO_LABORAL[d.estadoLaboral]}</Insignia></span>}
        acciones={puede(P.DOCENTES_GESTIONAR) && <Link to={`/docentes/${id}/editar`}><Boton variante="secundario"><Pencil className="size-4" /> Editar</Boton></Link>}
      />
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {PESTANAS.map((p) => (
          <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${pestana === p ? 'border-marca-600 text-marca-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{p}</button>
        ))}
      </div>
      <Alerta mensajes={error} />

      {pestana === 'Datos' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Tarjeta titulo="Datos personales">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Dato etiqueta="CUIL">{d.cuil}</Dato>
              <Dato etiqueta="Fecha de nacimiento">{fecha(d.fechaNacimiento)}</Dato>
              <Dato etiqueta="Correo">{d.email}</Dato>
              <Dato etiqueta="Teléfono">{d.telefono}</Dato>
              <Dato etiqueta="Domicilio">{d.domicilio && `${d.domicilio.calle} ${d.domicilio.numero ?? ''}${d.domicilio.piso ? `, ${d.domicilio.piso}` : ''} — ${d.domicilio.localidad}, ${d.domicilio.provincia}`}</Dato>
              <Dato etiqueta="Usuario del sistema">{d.usuario ? d.usuario.email : 'Sin usuario'}</Dato>
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Datos laborales">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Dato etiqueta="Legajo">{d.legajo}</Dato>
              <Dato etiqueta="Fecha de ingreso">{fecha(d.fechaIngreso)}</Dato>
              <Dato etiqueta="Estado laboral">{ESTADO_LABORAL[d.estadoLaboral]}</Dato>
              <Dato etiqueta="Designaciones activas">{d.designaciones.filter((x) => x.activa).length}</Dato>
              <div className="sm:col-span-2"><Dato etiqueta="Observaciones">{d.observaciones}</Dato></div>
            </dl>
          </Tarjeta>
        </div>
      )}

      {pestana === 'Designaciones' && (
        <Tarjeta sinPadding titulo="Cargos y designaciones" acciones={<>
          {puede(P.DOCENTES_GESTIONAR) && <Boton variante="secundario" onClick={() => setNovedad(true)}>Novedad de RR.HH.</Boton>}
          {gestiona && <Boton onClick={() => setModalDesig({ abierta: true })}><Plus className="size-4" /> Nueva designación</Boton>}
        </>}>
          <Tabla
            filas={d.designaciones}
            clave={(x) => x.id}
            vacio="Sin designaciones registradas"
            columnas={[
              { titulo: 'Cargo', celda: (x) => <div><p className="font-medium text-slate-900">{x.cargo.nombre}</p>{x.espacio && <p className="text-xs text-slate-500">{x.espacio.nombre}</p>}</div> },
              { titulo: 'Curso / turno', celda: (x) => <>{x.curso?.nombre ?? '—'} · {TURNO[x.turno]}</> },
              { titulo: 'Revista', celda: (x) => <>{REVISTA[x.situacionRevista]}{x.horasCatedra ? ` · ${x.horasCatedra} hs` : ''}</> },
              { titulo: 'Horarios', celda: (x) => x.horarios.length ? <ul className="text-xs">{x.horarios.map((h) => <li key={h.id}>{DIAS[h.diaSemana]} {h.horaDesde}–{h.horaHasta}</li>)}</ul> : '—' },
              { titulo: 'Vigencia', celda: (x) => <>{fecha(x.fechaDesde)} → {x.fechaHasta ? fecha(x.fechaHasta) : 'actual'}{!x.activa && <div><Insignia>Cesada</Insignia></div>}</> },
              ...(gestiona ? [{
                titulo: '', celda: (x: Designacion) => x.activa && (
                  <div className="flex gap-1">
                    <Boton variante="fantasma" onClick={() => setModalDesig({ abierta: true, d: x })} aria-label="Editar"><Pencil className="size-4" /></Boton>
                    {d.designaciones.some((o) => o.id !== x.id && o.activa) && <Boton variante="fantasma" title="Licencia automática 2.11 sobre otra designación (arts. 319, 333 e y 342 e)" onClick={() => setAutomatica(x)}>2.11</Boton>}
                    <Boton variante="fantasma" onClick={() => {
                      if (!confirm('¿Dar de baja esta designación con fecha de hoy?')) return;
                      // Interinos y suplentes: el cese cancela sus licencias en curso, salvo maternidad y adopción (art. 350).
                      const motivoCese = x.situacionRevista !== 'TITULAR' ? prompt('Motivo del cese (p. ej. Presentación del titular)') ?? undefined : undefined;
                      baja.mutate({ desigId: x.id, motivoCese: motivoCese || undefined });
                    }}>Baja</Boton>
                  </div>
                ),
              }] : []),
            ]}
          />
        </Tarjeta>
      )}

      {pestana === 'Documentación' && (
        <Tarjeta sinPadding titulo="Documentación personal" acciones={(puede(P.DOCENTES_GESTIONAR) || propio) && <Boton onClick={() => setModalDoc(true)}><Upload className="size-4" /> Adjuntar</Boton>}>
          {d.documentos.length ? (
            <ul className="divide-y divide-slate-100">
              {d.documentos.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="size-5 text-slate-400" aria-hidden />
                  <button className="flex-1 text-left" onClick={() => descargar(`/archivos/${doc.archivo.id}`, doc.archivo.nombreOriginal)}>
                    <p className="text-sm font-medium text-marca-700 hover:underline">{doc.tipo}{doc.archivo.confidencial && <Lock className="ml-1 inline size-3.5 text-slate-500" aria-label="Confidencial" />}</p>
                    <p className="text-xs text-slate-500">{doc.archivo.nombreOriginal} · {tamanio(doc.archivo.tamanio)} · {fecha(doc.createdAt)}</p>
                  </button>
                  {puede(P.DATOS_SENSIBLES_VER) && (
                    <Boton variante="fantasma" onClick={async () => {
                      if (doc.archivo.confidencial && !confirm('¿Quitar la confidencialidad? El documento quedará visible para quien consulta legajos. El cambio queda auditado.')) return;
                      await api.patch(`/docentes/${id}/documentos/${doc.id}/confidencial`, { confidencial: !doc.archivo.confidencial });
                      await qc.invalidateQueries({ queryKey: ['docente', id] });
                    }}>{doc.archivo.confidencial ? 'Quitar reserva' : 'Marcar confidencial'}</Boton>
                  )}
                  {puede(P.DOCENTES_GESTIONAR) && <Boton variante="fantasma" aria-label="Eliminar" onClick={() => confirm('¿Eliminar el documento?') && borrarDoc.mutate(doc.id)}><Trash2 className="size-4" /></Boton>}
                </li>
              ))}
            </ul>
          ) : <Vacio texto="Sin documentación cargada" />}
        </Tarjeta>
      )}

      {pestana === 'Licencias' && (
        <Tarjeta sinPadding titulo="Historial de licencias">
          {licencias.isLoading ? <Cargando /> : (
            <Tabla
              filas={licencias.data ?? []}
              clave={(s) => s.id}
              alClick={(s) => navegar(`/solicitudes/${s.id}`)}
              vacio="Sin licencias registradas"
              columnas={[
                { titulo: 'Número', celda: (s) => <span className="whitespace-nowrap font-mono text-xs">{s.numero}</span> },
                { titulo: 'Tipo', celda: (s) => <>{s.tipoLicencia.nombre}<p className="text-xs text-slate-500">{CATEGORIA[s.tipoLicencia.categoria]}</p></> },
                { titulo: 'Período', celda: (s) => `${fecha(s.fechaDesde)} – ${fecha(s.fechaHasta)}` },
                { titulo: 'Días', celda: (s) => s.diasComputados, className: 'text-center' },
                { titulo: 'Estado', celda: (s) => <EstadoSolicitudBadge estado={s.estado} /> },
              ]}
            />
          )}
        </Tarjeta>
      )}

      <DesignacionModal docenteId={id} designacion={modalDesig.d} abierto={modalDesig.abierta} onCerrar={() => setModalDesig({ abierta: false })} />
      {automatica && <LicenciaAutomaticaModal nueva={automatica} otras={d.designaciones.filter((o) => o.id !== automatica.id && o.activa)} onCerrar={() => setAutomatica(undefined)} docenteId={id} />}
      {novedad && <NovedadModal docenteId={id} designaciones={d.designaciones.filter((o) => o.activa)} onCerrar={() => setNovedad(false)} />}
      <DocumentoPersonalModal docenteId={id} abierto={modalDoc} onCerrar={() => setModalDoc(false)} />
    </>
  );
}

function DocumentoPersonalModal({ docenteId, abierto, onCerrar }: { docenteId: string; abierto: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const archivo = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState('DNI');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string[]>();
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = archivo.current?.files?.[0];
    if (!f) return setError(['Seleccione un archivo']);
    const fd = new FormData();
    fd.append('tipo', tipo); fd.append('descripcion', descripcion); fd.append('archivo', f);
    setEnviando(true); setError(undefined);
    try {
      await api.post(`/docentes/${docenteId}/documentos`, fd);
      await qc.invalidateQueries({ queryKey: ['docente', docenteId] });
      onCerrar();
    } catch (err) { setError(mensajesError(err)); } finally { setEnviando(false); }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Adjuntar documentación">
      <form onSubmit={enviar} className="space-y-4">
        <Alerta mensajes={error} />
        <Campo etiqueta="Tipo de documento">{(i) => (
          <Select id={i} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {['DNI', 'Título', 'Certificado de antecedentes', 'Apto psicofísico', 'Declaración jurada', 'Otro'].map((t) => <option key={t}>{t}</option>)}
          </Select>
        )}</Campo>
        <Campo etiqueta="Descripción (opcional)">{(i) => <Input id={i} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}</Campo>
        <Campo etiqueta="Archivo" ayuda="PDF, PNG o JPG — máximo 10 MB">{(i) => <Input id={i} ref={archivo} type="file" accept=".pdf,.png,.jpg,.jpeg" />}</Campo>
        <p className="text-xs text-slate-500">La documentación personal se guarda como confidencial (acceso restringido).</p>
        <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={enviando}>Subir</Boton></div>
      </form>
    </Modal>
  );
}

export default function DocenteDetallePage() {
  const { id } = useParams();
  return <FichaDocente id={id!} />;
}

/** Licencia automática 2.11: la designación nueva (ascenso o subrogancia) deja en licencia sin goce a otra del docente. */
function LicenciaAutomaticaModal({ nueva, otras, docenteId, onCerrar }: { nueva: Designacion; otras: Designacion[]; docenteId: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [afectada, setAfectada] = useState(otras[0]?.id ?? '');
  const [error, setError] = useState<string[]>();
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal abierto titulo="Licencia automática (2.11)" onCerrar={onCerrar}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setOcupado(true); setError(undefined);
        try {
          const r = await api.post(`/designaciones/${nueva.id}/licencia-automatica`, { designacionAfectadaId: afectada });
          await qc.invalidateQueries({ queryKey: ['docente', docenteId] });
          navegar(`/solicitudes/${r.data.id}`);
        } catch (err) { setError(mensajesError(err)); } finally { setOcupado(false); }
      }}>
        <Alerta mensajes={error} />
        <p className="text-sm text-slate-600">Por la designación en <strong>{nueva.cargo.nombre}</strong> desde el {fecha(nueva.fechaDesde)} queda en licencia sin goce (ascenso de jerarquía o incompatibilidad por subrogancia):</p>
        <Campo etiqueta="Designación que queda en licencia">{(i) => (
          <Select id={i} value={afectada} onChange={(e) => setAfectada(e.target.value)}>
            {otras.map((o) => <option key={o.id} value={o.id}>{o.cargo.nombre}{o.espacio ? ` – ${o.espacio.nombre}` : ''} · {REVISTA[o.situacionRevista]}</option>)}
          </Select>
        )}</Campo>
        <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={ocupado}>Generar licencia</Boton></div>
      </form>
    </Modal>
  );
}

/** Sanciones y movimientos provisorios: los registra RR.HH. con su instrumento legal (no consumen topes). */
function NovedadModal({ docenteId, designaciones, onCerrar }: { docenteId: string; designaciones: Designacion[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const nom = useQuery({ queryKey: ['nomenclador'], queryFn: async () => (await api.get<Nomenclador>('/nomenclador')).data });
  const motivos = (nom.data?.motivos ?? []).filter((m) => m.agrupacion >= 4);
  const [v, setV] = useState({ motivoId: '', designacionIds: designaciones.map((x) => x.id), fechaDesde: hoyISO(), fechaHasta: hoyISO(), instrumentoNumero: '', instrumentoFecha: hoyISO(), instrumentoEmisor: '', observaciones: '' });
  const [error, setError] = useState<string[]>();
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal abierto titulo="Novedad de RR.HH." onCerrar={onCerrar} ancho="max-w-2xl">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setOcupado(true); setError(undefined);
        try {
          const r = await api.post('/solicitudes/novedades-rrhh', { ...v, docenteId, observaciones: v.observaciones || undefined });
          await qc.invalidateQueries({ queryKey: ['docente', docenteId] });
          navegar(`/solicitudes/${r.data.id}`);
        } catch (err) { setError(mensajesError(err)); } finally { setOcupado(false); }
      }}>
        <Alerta mensajes={error} />
        <Campo etiqueta="Sanción o movimiento provisorio">{(i) => (
          <Select id={i} required value={v.motivoId} onChange={(e) => setV({ ...v, motivoId: e.target.value })}>
            <option value="">Seleccione…</option>
            {motivos.map((m) => <option key={m.id} value={m.id}>{m.codigo} – {m.nombre}</option>)}
          </Select>
        )}</Campo>
        <fieldset className="space-y-1"><legend className="text-sm font-medium text-slate-700">Designaciones</legend>
          {designaciones.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.designacionIds.includes(x.id)} onChange={(e) => setV({ ...v, designacionIds: e.target.checked ? [...v.designacionIds, x.id] : v.designacionIds.filter((y) => y !== x.id) })} />
              {x.cargo.nombre}{x.espacio ? ` – ${x.espacio.nombre}` : ''} · {REVISTA[x.situacionRevista]}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Desde">{(i) => <Input id={i} type="date" required value={v.fechaDesde} onChange={(e) => setV({ ...v, fechaDesde: e.target.value })} />}</Campo>
          <Campo etiqueta="Hasta">{(i) => <Input id={i} type="date" required value={v.fechaHasta} onChange={(e) => setV({ ...v, fechaHasta: e.target.value })} />}</Campo>
          <Campo etiqueta="Instrumento legal N.º">{(i) => <Input id={i} required value={v.instrumentoNumero} onChange={(e) => setV({ ...v, instrumentoNumero: e.target.value })} />}</Campo>
          <Campo etiqueta="Fecha del instrumento">{(i) => <Input id={i} type="date" required value={v.instrumentoFecha} onChange={(e) => setV({ ...v, instrumentoFecha: e.target.value })} />}</Campo>
        </div>
        <Campo etiqueta="Emitido por">{(i) => <Input id={i} required value={v.instrumentoEmisor} onChange={(e) => setV({ ...v, instrumentoEmisor: e.target.value })} />}</Campo>
        <Campo etiqueta="Observaciones">{(i) => <Input id={i} value={v.observaciones} onChange={(e) => setV({ ...v, observaciones: e.target.value })} />}</Campo>
        <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={ocupado}>Registrar</Boton></div>
      </form>
    </Modal>
  );
}
