import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { api, mensajesError } from '@/services/api';
import type { Docente, Paginado, Permiso, Rol, Usuario } from '@/types';
import { Alerta, Boton, Campo, Cargando, Encabezado, Input, Insignia, Modal, Paginacion, Select, Tabla, Tarjeta } from '@/components/ui';
import { fechaHora } from '@/utils/formato';
import { useAuth } from '@/hooks/useAuth';
import { P } from '@/utils/permisos';

export default function Usuarios() {
  const [pestana, setPestana] = useState<'usuarios' | 'roles'>('usuarios');
  return (
    <>
      <Encabezado titulo="Usuarios, roles y permisos" subtitulo="Los permisos se aplican tanto en la interfaz como en el servidor." />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
        {(['usuarios', 'roles'] as const).map((p) => (
          <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${pestana === p ? 'border-marca-600 text-marca-700' : 'border-transparent text-slate-500'}`}>{p}</button>
        ))}
      </div>
      {pestana === 'usuarios' ? <ListaUsuarios /> : <Roles />}
    </>
  );
}

function ListaUsuarios() {
  const [pagina, setPagina] = useState(1);
  const [buscar, setBuscar] = useState('');
  const [edicion, setEdicion] = useState<{ abierto: boolean; u?: Usuario }>({ abierto: false });
  const [reset, setReset] = useState<Usuario>();
  const { data, isLoading } = useQuery({ queryKey: ['usuarios', pagina, buscar], queryFn: async () => (await api.get<Paginado<Usuario>>('/usuarios', { params: { pagina, buscar: buscar || undefined } })).data });
  return (
    <Tarjeta sinPadding acciones={<Boton onClick={() => setEdicion({ abierto: true })}><Plus className="size-4" /> Nuevo usuario</Boton>} titulo={<Input placeholder="Buscar…" aria-label="Buscar usuarios" value={buscar} onChange={(e) => { setBuscar(e.target.value); setPagina(1); }} className="w-64" />}>
      {isLoading || !data ? <Cargando /> : (
        <>
          <Tabla filas={data.items} clave={(u) => u.id} alClick={(u) => setEdicion({ abierto: true, u })}
            columnas={[
              { titulo: 'Usuario', celda: (u) => <><p className="font-medium text-slate-900">{u.apellido}, {u.nombre}</p><p className="text-xs text-slate-500">{u.email}</p></> },
              { titulo: 'Roles', celda: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Insignia key={r.id}>{r.nombre}</Insignia>)}</div> },
              { titulo: 'Legajo vinculado', celda: (u) => (u.docente ? `${u.docente.legajo} – ${u.docente.apellido}` : '—') },
              { titulo: 'Último acceso', celda: (u) => fechaHora(u.ultimoAcceso) },
              { titulo: 'Estado', celda: (u) => (u.activo ? <Insignia color="bg-emerald-50 text-emerald-700 ring-emerald-300">Activo</Insignia> : <Insignia>Inactivo</Insignia>) },
              { titulo: '', celda: (u) => <Boton variante="fantasma" onClick={(e) => { e.stopPropagation(); setReset(u); }} aria-label="Restablecer contraseña"><KeyRound className="size-4" /></Boton> },
            ]} />
          <Paginacion pagina={data.pagina} porPagina={data.porPagina} total={data.total} onCambiar={setPagina} />
        </>
      )}
      {edicion.abierto && <UsuarioModal u={edicion.u} onCerrar={() => setEdicion({ abierto: false })} />}
      {reset && <ResetModal u={reset} onCerrar={() => setReset(undefined)} />}
    </Tarjeta>
  );
}

function UsuarioModal({ u, onCerrar }: { u?: Usuario; onCerrar: () => void }) {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<Rol[]>('/roles')).data });
  const docentes = useQuery({ queryKey: ['docentes', 'todos'], queryFn: async () => (await api.get<Paginado<Docente>>('/docentes', { params: { porPagina: 200 } })).data.items });
  const [d, setD] = useState({ email: u?.email ?? '', nombre: u?.nombre ?? '', apellido: u?.apellido ?? '', password: '', rolIds: u?.roles.map((r) => r.id) ?? [], docenteId: u?.docenteId ?? '', activo: u?.activo ?? true });
  const [error, setError] = useState<string[]>();
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setError(undefined);
    try {
      if (u) await api.patch(`/usuarios/${u.id}`, { nombre: d.nombre, apellido: d.apellido, rolIds: d.rolIds, docenteId: d.docenteId || null, activo: d.activo });
      else await api.post('/usuarios', { email: d.email, nombre: d.nombre, apellido: d.apellido, password: d.password, rolIds: d.rolIds, docenteId: d.docenteId || undefined });
      await qc.invalidateQueries({ queryKey: ['usuarios'] });
      onCerrar();
    } catch (err) { setError(mensajesError(err)); } finally { setEnviando(false); }
  };
  return (
    <Modal abierto titulo={u ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Alerta mensajes={error} /></div>
        <Campo className="sm:col-span-2" etiqueta="Correo electrónico">{(i) => <Input id={i} type="email" required disabled={!!u} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />}</Campo>
        <Campo etiqueta="Nombre">{(i) => <Input id={i} required value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />}</Campo>
        <Campo etiqueta="Apellido">{(i) => <Input id={i} required value={d.apellido} onChange={(e) => setD({ ...d, apellido: e.target.value })} />}</Campo>
        {!u && <Campo className="sm:col-span-2" etiqueta="Contraseña inicial" ayuda="Mínimo 10 caracteres, con mayúsculas, minúsculas y números">{(i) => <Input id={i} type="password" autoComplete="new-password" required value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} />}</Campo>}
        <Campo className="sm:col-span-2" etiqueta="Legajo docente vinculado">{(i) => (
          <Select id={i} value={d.docenteId} onChange={(e) => setD({ ...d, docenteId: e.target.value })}>
            <option value="">— Ninguno —</option>
            {docentes.data?.map((x) => <option key={x.id} value={x.id}>{x.legajo} – {x.apellido}, {x.nombre}</option>)}
          </Select>
        )}</Campo>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">Roles</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {roles.data?.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.rolIds.includes(r.id)} onChange={(e) => setD({ ...d, rolIds: e.target.checked ? [...d.rolIds, r.id] : d.rolIds.filter((x) => x !== r.id) })} /> {r.nombre}
              </label>
            ))}
          </div>
        </fieldset>
        {u && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} /> Usuario activo</label>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={enviando}>Guardar</Boton></div>
      </form>
    </Modal>
  );
}

function ResetModal({ u, onCerrar }: { u: Usuario; onCerrar: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string[]>();
  const [ok, setOk] = useState(false);
  return (
    <Modal abierto titulo={`Restablecer contraseña: ${u.email}`} onCerrar={onCerrar}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setError(undefined);
        try { await api.post(`/usuarios/${u.id}/reset-password`, { password }); setOk(true); } catch (err) { setError(mensajesError(err)); }
      }}>
        <Alerta mensajes={error} />
        {ok ? <Alerta tipo="exito" mensajes={['Contraseña restablecida. Se cerraron las sesiones abiertas del usuario.']} /> : (
          <>
            <Campo etiqueta="Nueva contraseña" ayuda="Comuníquela al usuario por un canal seguro.">{(i) => <Input id={i} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Campo>
            <div className="flex justify-end"><Boton type="submit">Restablecer</Boton></div>
          </>
        )}
      </form>
    </Modal>
  );
}

function Roles() {
  const qc = useQueryClient();
  const { puede } = useAuth();
  // La matriz solo se edita con roles.gestionar; los roles del sistema son de solo lectura (el servidor lo exige igual).
  const editable = puede(P.ROLES_GESTIONAR);
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<Rol[]>('/roles')).data });
  const permisos = useQuery({ queryKey: ['permisos'], queryFn: async () => (await api.get<Permiso[]>('/permisos')).data });
  const [cambios, setCambios] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<{ tipo: 'error' | 'exito'; t: string[] }>();
  const [nuevo, setNuevo] = useState(false);
  if (roles.isLoading || permisos.isLoading) return <Cargando />;
  const de = (r: Rol) => cambios[r.id] ?? r.permisos;
  const alternar = (r: Rol, p: string) => setCambios({ ...cambios, [r.id]: de(r).includes(p) ? de(r).filter((x) => x !== p) : [...de(r), p] });
  const guardar = async () => {
    setMsg(undefined);
    try {
      for (const [id, ps] of Object.entries(cambios)) {
        const r = roles.data!.find((x) => x.id === id)!;
        await api.put(`/roles/${id}`, { codigo: r.codigo, nombre: r.nombre, descripcion: r.descripcion ?? undefined, permisos: ps });
      }
      setCambios({}); await qc.invalidateQueries({ queryKey: ['roles'] });
      setMsg({ tipo: 'exito', t: ['Permisos actualizados. Los cambios aplican de inmediato.'] });
    } catch (e) { setMsg({ tipo: 'error', t: mensajesError(e) }); }
  };
  const modulos = [...new Set(permisos.data?.map((p) => p.modulo))];
  return (
    <>
      {msg && <div className="mb-4"><Alerta tipo={msg.tipo} mensajes={msg.t} /></div>}
      <Tarjeta sinPadding titulo="Matriz de permisos" acciones={editable && <>
        <Boton variante="secundario" onClick={() => setNuevo(true)}><Plus className="size-4" /> Nuevo rol</Boton>
        <Boton onClick={guardar} disabled={!Object.keys(cambios).length}>Guardar cambios</Boton>
      </>}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Permiso</th>
                {roles.data?.map((r) => <th key={r.id} className="px-2 py-2 text-center text-xs font-semibold text-slate-600"><span className="block max-w-24">{r.nombre}</span><span className="font-normal text-slate-400">{r.usuarios} usr.</span></th>)}
              </tr>
            </thead>
            <tbody>
              {modulos.map((m) => (
                <Fragment key={m}>
                  <tr><td colSpan={(roles.data?.length ?? 0) + 1} className="bg-slate-100/60 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{m}</td></tr>
                  {permisos.data?.filter((p) => p.modulo === m).map((p) => (
                    <tr key={p.codigo} className="border-t border-slate-100">
                      <td className="sticky left-0 bg-white px-4 py-2"><p className="text-slate-800">{p.descripcion}</p><p className="font-mono text-[11px] text-slate-400">{p.codigo}</p></td>
                      {roles.data?.map((r) => (
                        <td key={r.id} className="px-2 py-2 text-center">
                          <input type="checkbox" aria-label={`${p.descripcion} – ${r.nombre}`} checked={de(r).includes(p.codigo)} disabled={!editable || r.sistema} title={r.sistema ? 'Rol del sistema: no se puede modificar' : undefined} onChange={() => alternar(r, p.codigo)} className="size-4 rounded border-slate-300 disabled:opacity-60" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      {nuevo && <NuevoRol onCerrar={() => setNuevo(false)} />}
    </>
  );
}

function NuevoRol({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState({ codigo: '', nombre: '', descripcion: '' });
  const [error, setError] = useState<string[]>();
  return (
    <Modal abierto titulo="Nuevo rol" onCerrar={onCerrar}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.post('/roles', { ...d, codigo: d.codigo.toUpperCase(), descripcion: d.descripcion || undefined, permisos: [] }); await qc.invalidateQueries({ queryKey: ['roles'] }); onCerrar(); }
        catch (err) { setError(mensajesError(err)); }
      }}>
        <Alerta mensajes={error} />
        <Campo etiqueta="Código" ayuda="Mayúsculas y guion bajo, p. ej. VICEDIRECTOR">{(i) => <Input id={i} required value={d.codigo} onChange={(e) => setD({ ...d, codigo: e.target.value })} />}</Campo>
        <Campo etiqueta="Nombre">{(i) => <Input id={i} required value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />}</Campo>
        <Campo etiqueta="Descripción">{(i) => <Input id={i} value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} />}</Campo>
        <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit">Crear</Boton></div>
      </form>
    </Modal>
  );
}
