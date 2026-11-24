import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { api, mensajesError } from '@/services/api';
import { Alerta, Boton, Campo, Dato, Encabezado, Input, Tarjeta } from '@/components/ui';

const esquema = z.object({
  actual: z.string().min(1, 'Requerido'),
  nueva: z.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/, 'Mínimo 10 caracteres, con mayúsculas, minúsculas y números')
    // bcrypt solo usa los primeros 72 bytes (el servidor rechaza contraseñas más largas).
    .refine((v) => new TextEncoder().encode(v).length <= 72, 'Máximo 72 bytes (unos 72 caracteres sin acentos)'),
  repetir: z.string(),
}).refine((d) => d.nueva === d.repetir, { path: ['repetir'], message: 'Las contraseñas no coinciden' });

export default function Perfil() {
  const { usuario, logout } = useAuth();
  const [error, setError] = useState<string[]>();
  const [ok, setOk] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof esquema>>({ resolver: zodResolver(esquema) });

  const enviar = async (d: z.infer<typeof esquema>) => {
    setError(undefined);
    try {
      await api.post('/auth/cambiar-password', { actual: d.actual, nueva: d.nueva });
      reset(); setOk(true);
      setTimeout(logout, 2500); // se revocaron todas las sesiones
    } catch (e) { setError(mensajesError(e)); }
  };

  return (
    <>
      <Encabezado titulo="Mi perfil" />
      {usuario?.debeCambiarPassword && <div className="mb-6"><Alerta tipo="info" mensajes={['Por seguridad, debe cambiar su contraseña antes de continuar.']} /></div>}
      {!usuario?.debeCambiarPassword && usuario?.debeConfigurar2fa && (
        <div className="mb-6"><Alerta tipo="info" mensajes={['Su rol requiere verificación en dos pasos. Configúrela abajo para continuar.']} /></div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta titulo="Datos de la cuenta">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dato etiqueta="Nombre">{usuario?.nombre} {usuario?.apellido}</Dato>
            <Dato etiqueta="Correo">{usuario?.email}</Dato>
            <Dato etiqueta="Institución">{usuario?.institucion.nombre}</Dato>
            <Dato etiqueta="Roles">{usuario?.roles.map((r) => r.nombre).join(', ')}</Dato>
          </dl>
          <div className="mt-4">
            <Boton variante="secundario" onClick={async () => { await api.post('/auth/logout-global').catch(() => undefined); await logout(); }}>
              Cerrar sesión en todos los dispositivos
            </Boton>
          </div>
        </Tarjeta>
        <SegundoFactor />
        <Tarjeta titulo="Cambiar contraseña">
          <form onSubmit={handleSubmit(enviar)} className="space-y-4" noValidate>
            <Alerta mensajes={error} />
            {ok && <Alerta tipo="exito" mensajes={['Contraseña actualizada. Por seguridad, deberá ingresar nuevamente.']} />}
            <Campo etiqueta="Contraseña actual" error={errors.actual?.message}>{(id) => <Input id={id} type="password" autoComplete="current-password" {...register('actual')} />}</Campo>
            <Campo etiqueta="Nueva contraseña" error={errors.nueva?.message}>{(id) => <Input id={id} type="password" autoComplete="new-password" {...register('nueva')} />}</Campo>
            <Campo etiqueta="Repetir nueva contraseña" error={errors.repetir?.message}>{(id) => <Input id={id} type="password" autoComplete="new-password" {...register('repetir')} />}</Campo>
            <Boton type="submit" cargando={isSubmitting}>Actualizar contraseña</Boton>
          </form>
        </Tarjeta>
      </div>
    </>
  );
}

/** Verificación en dos pasos (TOTP): configuración con una app autenticadora y desactivación. */
function SegundoFactor() {
  const { usuario, recargar } = useAuth();
  const [config, setConfig] = useState<{ secreto: string; uri: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string[]>();
  const [ok, setOk] = useState<string>();
  const [cargando, setCargando] = useState(false);

  const ejecutar = async (fn: () => Promise<void>) => {
    setError(undefined); setOk(undefined); setCargando(true);
    try { await fn(); } catch (e) { setError(mensajesError(e)); } finally { setCargando(false); }
  };
  const iniciar = () => ejecutar(async () => { setConfig((await api.post<{ secreto: string; uri: string }>('/auth/2fa/iniciar')).data); });
  const activar = () => ejecutar(async () => {
    await api.post('/auth/2fa/activar', { codigo });
    setConfig(null); setCodigo(''); setOk('Verificación en dos pasos activada.');
    await recargar();
  });
  const desactivar = () => ejecutar(async () => {
    await api.post('/auth/2fa/desactivar', { password, codigo });
    setOk('Verificación en dos pasos desactivada. Por seguridad, deberá ingresar nuevamente.');
    setTimeout(() => window.location.assign('/login'), 2500);
  });
  const soloDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  return (
    <Tarjeta titulo="Verificación en dos pasos">
      <div className="space-y-4 text-sm">
        <Alerta mensajes={error} />
        {ok && <Alerta tipo="exito" mensajes={[ok]} />}
        {usuario?.totpActivo ? (
          <>
            <p className="text-slate-600">Activada. Al ingresar se le pide el código de su app autenticadora.</p>
            {usuario.segundoFactorObligatorio ? (
              <p className="text-slate-500">Su rol la requiere: no se puede desactivar. Si pierde el teléfono, pida a un administrador que blanquee su contraseña.</p>
            ) : (
              <div className="space-y-3">
                <Campo etiqueta="Contraseña">{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Campo>
                <Campo etiqueta="Código actual">{(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(soloDigitos(e.target.value))} />}</Campo>
                <Boton variante="secundario" cargando={cargando} disabled={!password || codigo.length !== 6} onClick={desactivar}>Desactivar</Boton>
              </div>
            )}
          </>
        ) : config ? (
          <>
            <ol className="list-decimal space-y-2 pl-5 text-slate-600">
              <li>Abra una app autenticadora (Google Authenticator, Microsoft Authenticator, Authy…) y elija agregar una cuenta con clave manual.</li>
              <li>Cuenta: <strong>{usuario?.email}</strong>. Clave (basada en tiempo):</li>
            </ol>
            <code className="block select-all break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-base tracking-wider text-slate-900">
              {config.secreto.match(/.{1,4}/g)?.join(' ')}
            </code>
            <p className="text-xs text-slate-500">
              Si la app admite enlaces, también puede usar: <span className="select-all break-all font-mono">{config.uri}</span>
            </p>
            <Campo etiqueta="Código de 6 dígitos que muestra la app">
              {(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" autoFocus value={codigo} onChange={(e) => setCodigo(soloDigitos(e.target.value))} />}
            </Campo>
            <Boton cargando={cargando} disabled={codigo.length !== 6} onClick={activar}>Activar</Boton>
          </>
        ) : (
          <>
            <p className="text-slate-600">
              Agrega un código de su teléfono al ingreso, además de la contraseña.
              {usuario?.segundoFactorObligatorio ? ' Su rol la requiere.' : ' Es opcional para su rol, pero recomendable.'}
            </p>
            <Boton cargando={cargando} onClick={iniciar}>Configurar</Boton>
          </>
        )}
      </div>
    </Tarjeta>
  );
}
