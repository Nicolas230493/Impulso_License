import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { mensajesError } from '@/services/api';
import { Alerta, Boton, Campo, Input } from '@/components/ui';
import { NOMBRE_APP, PiePagina } from '@/components/Marca';

const esquema = z.object({ email: z.string().email('Ingrese un correo válido'), password: z.string().min(1, 'Ingrese su contraseña') });
type Datos = z.infer<typeof esquema>;

export default function Login() {
  const { login, loginSegundoFactor, usuario } = useAuth();
  const navegar = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<string[]>();
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Datos>({ resolver: zodResolver(esquema) });

  if (usuario) return <Navigate to="/" replace />;

  const continuar = () => navegar((loc.state as { desde?: string })?.desde ?? '/', { replace: true });

  const enviar = async (d: Datos) => {
    setError(undefined);
    try {
      const r = await login(d.email, d.password);
      if (r) { setDesafio(r.desafio); return; }
      continuar();
    } catch (e) {
      setError(mensajesError(e));
    }
  };

  const enviarCodigo = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!desafio) return;
    setError(undefined);
    setVerificando(true);
    try {
      await loginSegundoFactor(desafio, codigo);
      continuar();
    } catch (e) {
      setError(mensajesError(e));
      // El desafío dura 5 minutos: si venció, se vuelve a pedir la contraseña.
      if ((e as { response?: { data?: { message?: string } } }).response?.data?.message?.includes('expiró')) setDesafio(null);
    } finally {
      setVerificando(false);
      setCodigo('');
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-marca-800 to-indigo-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-white/15"><Settings2 className="size-5" /></div>
          <span className="text-lg font-semibold">{NOMBRE_APP}</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Gestión integral de personal y licencias docentes</h1>
          <p className="mt-4 max-w-md text-indigo-200">Solicitudes, autorizaciones, reemplazos y legajos en un único circuito digital, trazable y seguro.</p>
        </div>
        <div aria-hidden />
      </div>
      <div className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-6">
        {desafio ? (
        <form onSubmit={enviarCodigo} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Verificación en dos pasos</h2>
            <p className="mt-1 text-sm text-slate-500">Ingrese el código de 6 dígitos que muestra su app autenticadora.</p>
          </div>
          <Alerta mensajes={error} />
          <Campo etiqueta="Código de verificación">
            {(id) => (
              <Input id={id} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} pattern="\d{6}"
                value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            )}
          </Campo>
          <Boton type="submit" className="w-full" cargando={verificando} disabled={codigo.length !== 6}>Verificar</Boton>
          <Boton type="button" variante="secundario" className="w-full" onClick={() => { setDesafio(null); setError(undefined); }}>Volver</Boton>
        </form>
        ) : (
        <form onSubmit={handleSubmit(enviar)} className="w-full max-w-sm space-y-5" noValidate>
          {/* En pantallas chicas el panel de marca está oculto: el nombre se muestra acá. */}
          <div className="flex items-center gap-2 text-marca-800 lg:hidden">
            <Settings2 className="size-5" aria-hidden />
            <span className="text-lg font-semibold">{NOMBRE_APP}</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Ingresar</h2>
            <p className="mt-1 text-sm text-slate-500">Use las credenciales provistas por su institución.</p>
          </div>
          <Alerta mensajes={error} />
          <Campo etiqueta="Correo electrónico" error={errors.email?.message}>
            {(id) => <Input id={id} type="email" autoComplete="username" autoFocus aria-invalid={!!errors.email} {...register('email')} />}
          </Campo>
          <Campo etiqueta="Contraseña" error={errors.password?.message}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />}
          </Campo>
          <Boton type="submit" className="w-full" cargando={isSubmitting}>Ingresar</Boton>
        </form>
        )}
        </div>
        <PiePagina />
      </div>
    </div>
  );
}
