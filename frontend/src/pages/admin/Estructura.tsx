import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, mensajesError } from '@/services/api';
import type { Cargo, Curso, Espacio } from '@/types';
import { Alerta, Boton, Campo, Cargando, Encabezado, Input, Insignia, Modal, Select, Tabla, Tarjeta } from '@/components/ui';
import { TURNO } from '@/utils/formato';

type Entidad = 'cargos' | 'cursos' | 'espacios-curriculares';
type Edicion = { entidad: Entidad; valor?: Cargo | Curso | Espacio } | null;

export default function Estructura() {
  const [edicion, setEdicion] = useState<Edicion>(null);
  const cargos = useQuery({ queryKey: ['cargos'], queryFn: async () => (await api.get<Cargo[]>('/cargos')).data });
  const cursos = useQuery({ queryKey: ['cursos'], queryFn: async () => (await api.get<Curso[]>('/cursos')).data });
  const espacios = useQuery({ queryKey: ['espacios'], queryFn: async () => (await api.get<Espacio[]>('/espacios-curriculares')).data });
  const activo = (v: boolean) => (v ? <Insignia color="bg-emerald-50 text-emerald-700 ring-emerald-300">Activo</Insignia> : <Insignia>Inactivo</Insignia>);

  return (
    <>
      <Encabezado titulo="Cargos y estructura académica" subtitulo="Catálogos utilizados en las designaciones docentes" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Tarjeta sinPadding titulo="Cargos" acciones={<Boton onClick={() => setEdicion({ entidad: 'cargos' })}><Plus className="size-4" /> Nuevo</Boton>}>
          {cargos.isLoading ? <Cargando /> : <Tabla filas={cargos.data ?? []} clave={(c) => c.id} alClick={(c) => setEdicion({ entidad: 'cargos', valor: c })}
            columnas={[{ titulo: 'Código', celda: (c) => <span className="font-mono text-xs">{c.codigo}</span> }, { titulo: 'Nombre', celda: (c) => c.nombre }, { titulo: 'Tipo', celda: (c) => (c.tipo === 'CARGO' ? 'Cargo' : 'Horas cát.') }, { titulo: '', celda: (c) => activo(c.activo) }]} />}
        </Tarjeta>
        <Tarjeta sinPadding titulo="Cursos" acciones={<Boton onClick={() => setEdicion({ entidad: 'cursos' })}><Plus className="size-4" /> Nuevo</Boton>}>
          {cursos.isLoading ? <Cargando /> : <Tabla filas={cursos.data ?? []} clave={(c) => c.id} alClick={(c) => setEdicion({ entidad: 'cursos', valor: c })}
            columnas={[{ titulo: 'Curso', celda: (c) => c.nombre }, { titulo: 'Turno', celda: (c) => TURNO[c.turno] }, { titulo: 'Ciclo', celda: (c) => c.cicloLectivo }]} />}
        </Tarjeta>
        <Tarjeta sinPadding titulo="Espacios curriculares" acciones={<Boton onClick={() => setEdicion({ entidad: 'espacios-curriculares' })}><Plus className="size-4" /> Nuevo</Boton>}>
          {espacios.isLoading ? <Cargando /> : <Tabla filas={espacios.data ?? []} clave={(c) => c.id} alClick={(c) => setEdicion({ entidad: 'espacios-curriculares', valor: c })}
            columnas={[{ titulo: 'Código', celda: (c) => <span className="font-mono text-xs">{c.codigo}</span> }, { titulo: 'Materia', celda: (c) => c.nombre }, { titulo: '', celda: (c) => activo(c.activo) }]} />}
        </Tarjeta>
      </div>
      {edicion && <EdicionModal edicion={edicion} onCerrar={() => setEdicion(null)} />}
    </>
  );
}

function EdicionModal({ edicion, onCerrar }: { edicion: NonNullable<Edicion>; onCerrar: () => void }) {
  const qc = useQueryClient();
  const v = (edicion.valor ?? {}) as Partial<Cargo & Curso & Espacio>;
  const [d, setD] = useState({ codigo: v.codigo ?? '', nombre: v.nombre ?? '', tipo: v.tipo ?? 'HORAS_CATEDRA', activo: v.activo ?? true, anio: String(v.anio ?? 1), division: v.division ?? 'A', turno: v.turno ?? 'MANANA', cicloLectivo: String(v.cicloLectivo ?? new Date().getFullYear()) });
  const [error, setError] = useState<string[]>();
  const [enviando, setEnviando] = useState(false);
  const cuerpo = edicion.entidad === 'cursos'
    ? { anio: Number(d.anio), division: d.division, turno: d.turno, cicloLectivo: Number(d.cicloLectivo) }
    : edicion.entidad === 'cargos' ? { codigo: d.codigo, nombre: d.nombre, tipo: d.tipo, activo: d.activo } : { codigo: d.codigo, nombre: d.nombre, activo: d.activo };
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setError(undefined);
    try {
      if (edicion.valor) await api.put(`/${edicion.entidad}/${edicion.valor.id}`, cuerpo); else await api.post(`/${edicion.entidad}`, cuerpo);
      await qc.invalidateQueries({ queryKey: [edicion.entidad === 'espacios-curriculares' ? 'espacios' : edicion.entidad] });
      onCerrar();
    } catch (err) { setError(mensajesError(err)); } finally { setEnviando(false); }
  };
  const titulo = { cargos: 'cargo', cursos: 'curso', 'espacios-curriculares': 'espacio curricular' }[edicion.entidad];
  return (
    <Modal abierto titulo={`${edicion.valor ? 'Editar' : 'Nuevo'} ${titulo}`} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alerta mensajes={error} /></div>
        {edicion.entidad === 'cursos' ? (
          <>
            <Campo etiqueta="Año">{(i) => <Input id={i} type="number" min={1} max={7} required value={d.anio} onChange={(e) => setD({ ...d, anio: e.target.value })} />}</Campo>
            <Campo etiqueta="División">{(i) => <Input id={i} required maxLength={5} value={d.division} onChange={(e) => setD({ ...d, division: e.target.value })} />}</Campo>
            <Campo etiqueta="Turno">{(i) => <Select id={i} value={d.turno} onChange={(e) => setD({ ...d, turno: e.target.value as Curso['turno'] })}>{Object.entries(TURNO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>}</Campo>
            <Campo etiqueta="Ciclo lectivo">{(i) => <Input id={i} type="number" required value={d.cicloLectivo} onChange={(e) => setD({ ...d, cicloLectivo: e.target.value })} />}</Campo>
          </>
        ) : (
          <>
            <Campo etiqueta="Código">{(i) => <Input id={i} required value={d.codigo} onChange={(e) => setD({ ...d, codigo: e.target.value })} />}</Campo>
            {edicion.entidad === 'cargos' && <Campo etiqueta="Tipo">{(i) => <Select id={i} value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as Cargo['tipo'] })}><option value="HORAS_CATEDRA">Horas cátedra</option><option value="CARGO">Cargo</option></Select>}</Campo>}
            <Campo className="sm:col-span-2" etiqueta="Nombre">{(i) => <Input id={i} required value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />}</Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} /> Activo</label>
          </>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={enviando}>Guardar</Boton></div>
      </form>
    </Modal>
  );
}
