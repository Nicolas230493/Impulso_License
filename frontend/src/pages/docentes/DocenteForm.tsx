import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, mensajesError } from '@/services/api';
import type { DocenteDetalle } from '@/types';
import { Alerta, Boton, Campo, Cargando, Encabezado, Input, Select, Tarjeta, Textarea } from '@/components/ui';
import { ESTADO_LABORAL, isoInput } from '@/utils/formato';

function cuilValido(v: string) {
  const d = v.replace(/-/g, '');
  if (!/^\d{11}$/.test(d)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let dv = 11 - (pesos.reduce((s, p, i) => s + p * +d[i], 0) % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === +d[10];
}

const opcional = z.string().trim().optional().transform((v) => v || undefined);
const esquema = z.object({
  legajo: z.string().trim().min(1, 'Requerido').max(20),
  dni: z.string().regex(/^\d{7,8}$/, '7 u 8 dígitos, sin puntos'),
  cuil: z.string().refine(cuilValido, 'CUIL inválido'),
  apellido: z.string().trim().min(1, 'Requerido'),
  nombre: z.string().trim().min(1, 'Requerido'),
  fechaNacimiento: opcional,
  email: z.string().trim().email('Correo inválido').optional().or(z.literal('')).transform((v) => v || undefined),
  telefono: opcional,
  fechaIngreso: z.string().min(1, 'Requerido'),
  estadoLaboral: z.enum(['ACTIVO', 'INACTIVO', 'BAJA', 'JUBILADO']),
  observaciones: opcional,
  domicilio: z.object({ calle: z.string().trim(), numero: opcional, piso: opcional, localidad: z.string().trim(), provincia: z.string().trim(), codigoPostal: opcional }),
});
type Datos = z.input<typeof esquema>;

export default function DocenteForm() {
  const { id } = useParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string[]>();
  const { data: docente, isLoading } = useQuery({ queryKey: ['docente', id], queryFn: async () => (await api.get<DocenteDetalle>(`/docentes/${id}`)).data, enabled: !!id });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: { estadoLaboral: 'ACTIVO', domicilio: { calle: '', localidad: '', provincia: 'Buenos Aires' } },
  });

  useEffect(() => {
    if (docente) reset({
      ...docente,
      fechaNacimiento: isoInput(docente.fechaNacimiento), fechaIngreso: isoInput(docente.fechaIngreso),
      email: docente.email ?? '', telefono: docente.telefono ?? '', observaciones: docente.observaciones ?? '',
      domicilio: { calle: docente.domicilio?.calle ?? '', numero: docente.domicilio?.numero ?? '', piso: docente.domicilio?.piso ?? '', localidad: docente.domicilio?.localidad ?? '', provincia: docente.domicilio?.provincia ?? '', codigoPostal: docente.domicilio?.codigoPostal ?? '' },
    });
  }, [docente, reset]);

  const enviar = async (crudo: Datos) => {
    setError(undefined);
    const d = esquema.parse(crudo);
    const domicilio = d.domicilio.calle && d.domicilio.localidad ? d.domicilio : undefined;
    try {
      const r = id ? await api.patch(`/docentes/${id}`, { ...d, domicilio }) : await api.post('/docentes', { ...d, domicilio });
      await qc.invalidateQueries({ queryKey: ['docentes'] });
      await qc.invalidateQueries({ queryKey: ['docente', id] });
      navegar(`/docentes/${r.data.id}`);
    } catch (e) { setError(mensajesError(e)); }
  };

  if (id && isLoading) return <Cargando />;
  const err = (c: keyof Datos) => errors[c]?.message as string | undefined;

  return (
    <>
      <Encabezado titulo={id ? `Editar legajo ${docente?.legajo ?? ''}` : 'Registrar docente'} />
      <form onSubmit={handleSubmit(enviar)} className="space-y-6" noValidate>
        <Alerta mensajes={error} />
        <Tarjeta titulo="Datos personales">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo etiqueta="Apellido" error={err('apellido')}>{(i) => <Input id={i} {...register('apellido')} aria-invalid={!!errors.apellido} />}</Campo>
            <Campo etiqueta="Nombre" error={err('nombre')}>{(i) => <Input id={i} {...register('nombre')} aria-invalid={!!errors.nombre} />}</Campo>
            <Campo etiqueta="Fecha de nacimiento">{(i) => <Input id={i} type="date" {...register('fechaNacimiento')} />}</Campo>
            <Campo etiqueta="DNI" error={err('dni')}>{(i) => <Input id={i} inputMode="numeric" {...register('dni')} aria-invalid={!!errors.dni} />}</Campo>
            <Campo etiqueta="CUIL" error={err('cuil')} ayuda="Formato 20-12345678-9">{(i) => <Input id={i} {...register('cuil')} aria-invalid={!!errors.cuil} />}</Campo>
            <Campo etiqueta="Correo electrónico" error={err('email')}>{(i) => <Input id={i} type="email" {...register('email')} />}</Campo>
            <Campo etiqueta="Teléfono">{(i) => <Input id={i} type="tel" {...register('telefono')} />}</Campo>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Domicilio">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Campo className="lg:col-span-3" etiqueta="Calle">{(i) => <Input id={i} {...register('domicilio.calle')} />}</Campo>
            <Campo etiqueta="Número">{(i) => <Input id={i} {...register('domicilio.numero')} />}</Campo>
            <Campo etiqueta="Piso / Dto.">{(i) => <Input id={i} {...register('domicilio.piso')} />}</Campo>
            <Campo etiqueta="C.P.">{(i) => <Input id={i} {...register('domicilio.codigoPostal')} />}</Campo>
            <Campo className="lg:col-span-3" etiqueta="Localidad">{(i) => <Input id={i} {...register('domicilio.localidad')} />}</Campo>
            <Campo className="lg:col-span-3" etiqueta="Provincia">{(i) => <Input id={i} {...register('domicilio.provincia')} />}</Campo>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Datos laborales">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Número de legajo" error={err('legajo')}>{(i) => <Input id={i} {...register('legajo')} aria-invalid={!!errors.legajo} />}</Campo>
            <Campo etiqueta="Fecha de ingreso" error={err('fechaIngreso')}>{(i) => <Input id={i} type="date" {...register('fechaIngreso')} aria-invalid={!!errors.fechaIngreso} />}</Campo>
            <Campo etiqueta="Estado laboral">{(i) => <Select id={i} {...register('estadoLaboral')}>{Object.entries(ESTADO_LABORAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Campo>
            <Campo className="sm:col-span-3" etiqueta="Observaciones">{(i) => <Textarea id={i} {...register('observaciones')} />}</Campo>
          </div>
        </Tarjeta>
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="secundario" onClick={() => navegar(-1)}>Cancelar</Boton>
          <Boton type="submit" cargando={isSubmitting}>Guardar</Boton>
        </div>
      </form>
    </>
  );
}
