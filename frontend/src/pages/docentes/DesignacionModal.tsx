import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, mensajesError } from '@/services/api';
import type { Cargo, Curso, Designacion, Espacio, SituacionRevista, Turno } from '@/types';
import { Alerta, Boton, Campo, Input, Modal, Select } from '@/components/ui';
import { DIAS, isoInput, REVISTA, TURNO } from '@/utils/formato';

interface Datos {
  cargoId: string; espacioCurricularId: string; cursoId: string; turno: Turno; situacionRevista: SituacionRevista;
  horasCatedra: string; fechaDesde: string; fechaHasta: string; resolucion: string;
  horarios: { diaSemana: string; horaDesde: string; horaHasta: string }[];
}

export default function DesignacionModal({ docenteId, designacion, abierto, onCerrar }: { docenteId: string; designacion?: Designacion; abierto: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string[]>();
  const cargos = useQuery({ queryKey: ['cargos'], queryFn: async () => (await api.get<Cargo[]>('/cargos')).data });
  const espacios = useQuery({ queryKey: ['espacios'], queryFn: async () => (await api.get<Espacio[]>('/espacios-curriculares')).data });
  const cursos = useQuery({ queryKey: ['cursos'], queryFn: async () => (await api.get<Curso[]>('/cursos')).data });
  const { register, control, handleSubmit, watch, formState: { isSubmitting } } = useForm<Datos>({
    values: designacion
      ? {
          cargoId: designacion.cargoId, espacioCurricularId: designacion.espacioCurricularId ?? '', cursoId: designacion.cursoId ?? '',
          turno: designacion.turno, situacionRevista: designacion.situacionRevista, horasCatedra: String(designacion.horasCatedra ?? ''),
          fechaDesde: isoInput(designacion.fechaDesde), fechaHasta: isoInput(designacion.fechaHasta), resolucion: designacion.resolucion ?? '',
          horarios: designacion.horarios.map((h) => ({ diaSemana: String(h.diaSemana), horaDesde: h.horaDesde, horaHasta: h.horaHasta })),
        }
      : { cargoId: '', espacioCurricularId: '', cursoId: '', turno: 'MANANA', situacionRevista: 'TITULAR', horasCatedra: '', fechaDesde: '', fechaHasta: '', resolucion: '', horarios: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'horarios' });
  const cargo = cargos.data?.find((c) => c.id === watch('cargoId'));

  const enviar = async (d: Datos) => {
    setError(undefined);
    const cuerpo = {
      docenteId, cargoId: d.cargoId, turno: d.turno, situacionRevista: d.situacionRevista, fechaDesde: d.fechaDesde,
      espacioCurricularId: d.espacioCurricularId || undefined, cursoId: d.cursoId || undefined,
      horasCatedra: d.horasCatedra ? Number(d.horasCatedra) : undefined, fechaHasta: d.fechaHasta || undefined, resolucion: d.resolucion || undefined,
      horarios: d.horarios.map((h) => ({ diaSemana: Number(h.diaSemana), horaDesde: h.horaDesde, horaHasta: h.horaHasta })),
    };
    try {
      if (designacion) await api.put(`/designaciones/${designacion.id}`, cuerpo);
      else await api.post('/designaciones', cuerpo);
      await qc.invalidateQueries({ queryKey: ['docente', docenteId] });
      onCerrar();
    } catch (e) { setError(mensajesError(e)); }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={designacion ? 'Editar designación' : 'Nueva designación'} ancho="max-w-2xl">
      <form onSubmit={handleSubmit(enviar)} className="space-y-4">
        <Alerta mensajes={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Cargo">{(i) => <Select id={i} required {...register('cargoId')}><option value="">Seleccione…</option>{cargos.data?.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>}</Campo>
          <Campo etiqueta="Espacio curricular / materia">{(i) => <Select id={i} {...register('espacioCurricularId')}><option value="">— Ninguno —</option>{espacios.data?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select>}</Campo>
          <Campo etiqueta="Curso">{(i) => <Select id={i} {...register('cursoId')}><option value="">— Ninguno —</option>{cursos.data?.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({TURNO[c.turno]}, {c.cicloLectivo})</option>)}</Select>}</Campo>
          <Campo etiqueta="Turno">{(i) => <Select id={i} {...register('turno')}>{Object.entries(TURNO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Campo>
          <Campo etiqueta="Situación de revista">{(i) => <Select id={i} {...register('situacionRevista')}>{Object.entries(REVISTA).filter(([k]) => k !== 'PROVISIONAL' || designacion?.situacionRevista === 'PROVISIONAL').map(([k, v]) => <option key={k} value={k} disabled={k === 'PROVISIONAL'}>{k === 'PROVISIONAL' ? `${v} (régimen anterior: elija otra)` : v}</option>)}</Select>}</Campo>
          <Campo etiqueta="Horas cátedra" ayuda={cargo?.tipo === 'HORAS_CATEDRA' ? 'Obligatorio para este cargo' : undefined}>{(i) => <Input id={i} type="number" min={1} max={60} required={cargo?.tipo === 'HORAS_CATEDRA'} {...register('horasCatedra')} />}</Campo>
          <Campo etiqueta="Fecha de designación">{(i) => <Input id={i} type="date" required {...register('fechaDesde')} />}</Campo>
          <Campo etiqueta="Fecha de cese (opcional)">{(i) => <Input id={i} type="date" {...register('fechaHasta')} />}</Campo>
          <Campo className="sm:col-span-2" etiqueta="Instrumento legal / resolución">{(i) => <Input id={i} {...register('resolucion')} />}</Campo>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Horarios</legend>
          <div className="space-y-2">
            {fields.map((f, idx) => (
              <div key={f.id} className="flex items-center gap-2">
                <Select aria-label="Día" className="w-28" {...register(`horarios.${idx}.diaSemana`)}>{DIAS.slice(1).map((d, n) => <option key={d} value={n + 1}>{d}</option>)}</Select>
                <Input aria-label="Desde" type="time" className="w-32" required {...register(`horarios.${idx}.horaDesde`)} />
                <span className="text-slate-400">a</span>
                <Input aria-label="Hasta" type="time" className="w-32" required {...register(`horarios.${idx}.horaHasta`)} />
                <Boton type="button" variante="fantasma" onClick={() => remove(idx)} aria-label="Quitar horario"><Trash2 className="size-4" /></Boton>
              </div>
            ))}
            <Boton type="button" variante="secundario" onClick={() => append({ diaSemana: '1', horaDesde: '07:30', horaHasta: '09:00' })}><Plus className="size-4" /> Agregar franja</Boton>
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={isSubmitting}>Guardar</Boton>
        </div>
      </form>
    </Modal>
  );
}
