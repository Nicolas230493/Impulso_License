import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Docente, EstadoLaboral, Paginado } from '@/types';
import { Boton, Cargando, Encabezado, Input, Insignia, Paginacion, Select, Tabla, Tarjeta } from '@/components/ui';
import { ESTADO_LABORAL, fecha } from '@/utils/formato';
import { P } from '@/utils/permisos';

export default function DocentesLista() {
  const { puede } = useAuth();
  const navegar = useNavigate();
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState<EstadoLaboral | ''>('');
  const [pagina, setPagina] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['docentes', buscar, estado, pagina],
    queryFn: async () => (await api.get<Paginado<Docente>>('/docentes', { params: { buscar: buscar || undefined, estadoLaboral: estado || undefined, pagina } })).data,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <Encabezado titulo="Personal docente" subtitulo="Legajos, designaciones y situación de revista"
        acciones={puede(P.DOCENTES_GESTIONAR) && <Link to="/docentes/nuevo"><Boton><Plus className="size-4" /> Registrar docente</Boton></Link>} />
      <Tarjeta sinPadding>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
            <Input className="pl-9" placeholder="Buscar por apellido, nombre, DNI o legajo" aria-label="Buscar docentes" value={buscar} onChange={(e) => { setBuscar(e.target.value); setPagina(1); }} />
          </div>
          <Select className="w-44" aria-label="Estado laboral" value={estado} onChange={(e) => { setEstado(e.target.value as EstadoLaboral | ''); setPagina(1); }}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_LABORAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {isLoading || !data ? <Cargando /> : (
          <>
            <Tabla
              filas={data.items}
              clave={(d) => d.id}
              alClick={(d) => navegar(`/docentes/${d.id}`)}
              columnas={[
                { titulo: 'Legajo', celda: (d) => <span className="font-mono text-xs">{d.legajo}</span> },
                { titulo: 'Docente', celda: (d) => <span className="font-medium text-slate-900">{d.apellido}, {d.nombre}</span> },
                { titulo: 'DNI', celda: (d) => d.dni },
                { titulo: 'Ingreso', celda: (d) => fecha(d.fechaIngreso) },
                { titulo: 'Designaciones', celda: (d) => d.designacionesActivas, className: 'text-center' },
                {
                  titulo: 'Situación',
                  celda: (d) => (
                    <div className="flex flex-wrap gap-1">
                      <Insignia color={d.estadoLaboral === 'ACTIVO' ? 'bg-emerald-50 text-emerald-700 ring-emerald-300' : undefined}>{ESTADO_LABORAL[d.estadoLaboral]}</Insignia>
                      {d.enLicencia && <Insignia color="bg-orange-50 text-orange-700 ring-orange-300">En licencia</Insignia>}
                    </div>
                  ),
                },
              ]}
            />
            <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambiar={setPagina} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
