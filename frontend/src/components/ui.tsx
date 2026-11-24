import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variante = 'primario' | 'secundario' | 'peligro' | 'exito' | 'fantasma';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 shadow-sm',
  secundario: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 shadow-sm',
  peligro: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  exito: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  fantasma: 'text-slate-600 hover:bg-slate-100',
};

export function Boton({ variante = 'primario', cargando, className, children, disabled, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button
      {...p}
      disabled={disabled || cargando}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', VARIANTES[variante], className)}
    >
      {cargando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const CAMPO = 'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-marca-600 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:ring-red-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cx(CAMPO, className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} {...p} className={cx(CAMPO, 'pr-8', className)} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} rows={3} {...p} className={cx(CAMPO, className)} />);

/** Etiqueta + control + error, asociados para lectores de pantalla. */
export function Campo({ etiqueta, error, ayuda, children, className }: { etiqueta: string; error?: string; ayuda?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{etiqueta}</label>
      {children(id)}
      {ayuda && !error && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Tarjeta({ titulo, acciones, children, className, sinPadding }: { titulo?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string; sinPadding?: boolean }) {
  return (
    <section className={cx('rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          {titulo && <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>}
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </header>
      )}
      <div className={sinPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Insignia({ children, color = 'bg-slate-100 text-slate-700 ring-slate-300' }: { children: ReactNode; color?: string }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', color)}>{children}</span>;
}

export function Encabezado({ titulo, subtitulo, acciones }: { titulo: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

export function Alerta({ tipo = 'error', mensajes, children }: { tipo?: 'error' | 'exito' | 'info'; mensajes?: string[]; children?: ReactNode }) {
  if (!mensajes?.length && !children) return null;
  const estilos = { error: 'bg-red-50 text-red-800 ring-red-200', exito: 'bg-emerald-50 text-emerald-800 ring-emerald-200', info: 'bg-sky-50 text-sky-800 ring-sky-200' }[tipo];
  const Icono = tipo === 'exito' ? CheckCircle2 : AlertCircle;
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-lg p-3 text-sm ring-1', estilos)}>
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {mensajes && (mensajes.length === 1 ? <p>{mensajes[0]}</p> : <ul className="list-disc space-y-0.5 pl-4">{mensajes.map((m) => <li key={m}>{m}</li>)}</ul>)}
        {children}
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {texto}
    </div>
  );
}

export function Vacio({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
      <Inbox className="size-8 text-slate-300" aria-hidden />
      <p>{texto}</p>
      {children}
    </div>
  );
}

export interface Columna<T> { titulo: string; celda: (f: T) => ReactNode; className?: string }
export function Tabla<T>({ columnas, filas, clave, alClick, vacio = 'Sin resultados' }: { columnas: Columna<T>[]; filas: T[]; clave: (f: T) => string; alClick?: (f: T) => void; vacio?: string }) {
  if (!filas.length) return <Vacio texto={vacio} />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>{columnas.map((c) => <th key={c.titulo} scope="col" className={cx('px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', c.className)}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {filas.map((f) => (
            <tr
              key={clave(f)}
              onClick={alClick ? () => alClick(f) : undefined}
              onKeyDown={alClick ? (e) => e.key === 'Enter' && alClick(f) : undefined}
              tabIndex={alClick ? 0 : undefined}
              className={cx(alClick && 'cursor-pointer hover:bg-marca-50/50 focus:bg-marca-50')}
            >
              {columnas.map((c) => <td key={c.titulo} className={cx('px-4 py-3 align-top text-slate-700', c.className)}>{c.celda(f)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Paginacion({ pagina, porPagina, total, onCambiar }: { pagina: number; porPagina: number; total: number; onCambiar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600" aria-label="Paginación">
      <span>{total} registro{total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <Boton variante="secundario" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>Anterior</Boton>
        <span>Página {pagina} de {paginas}</span>
        <Boton variante="secundario" disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)}>Siguiente</Boton>
      </div>
    </nav>
  );
}

export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-lg' }: { abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode; ancho?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog ref={ref} onClose={onCerrar} className={cx('m-auto w-[calc(100%-2rem)] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40', ancho)} aria-labelledby="modal-titulo">
      {abierto && (
        <div>
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 id="modal-titulo" className="font-semibold text-slate-900">{titulo}</h2>
            <button onClick={onCerrar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar"><X className="size-5" /></button>
          </header>
          <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children || '—'}</dd>
    </div>
  );
}
