/** Nombre de la aplicación y pie de página, compartidos por todas las pantallas. */
export const NOMBRE_APP = 'Impulso License';

export function PiePagina({ className = '' }: { className?: string }) {
  return (
    <footer className={`px-4 py-4 text-center text-xs text-slate-500 ${className}`}>
      &copy; 2026 - Impulso Digital Sgo - Todos los Derechos Reservados
    </footer>
  );
}
