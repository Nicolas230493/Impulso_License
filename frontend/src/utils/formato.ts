import type { CategoriaLicencia, EstadoAsistencia, EstadoLaboral, EstadoReemplazo, EstadoSolicitud, SituacionRevista, Turno } from '@/types';

/** Las fechas de calendario llegan como ISO a medianoche UTC: se formatean sin conversión de zona. */
export function fecha(v?: string | null) {
  if (!v) return '—';
  const [a, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export const fechaHora = (v?: string | null) => (v ? new Date(v).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isoInput = (v?: string | null) => (v ? v.slice(0, 10) : '');
export const tamanio = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export const ESTADO_SOLICITUD: Record<EstadoSolicitud, { texto: string; color: string }> = {
  BORRADOR: { texto: 'Borrador', color: 'bg-slate-100 text-slate-700 ring-slate-300' },
  PENDIENTE: { texto: 'Pendiente', color: 'bg-amber-50 text-amber-800 ring-amber-300' },
  EN_REVISION: { texto: 'En revisión', color: 'bg-sky-50 text-sky-800 ring-sky-300' },
  OBSERVADA: { texto: 'Observada', color: 'bg-orange-50 text-orange-800 ring-orange-300' },
  AUTORIZADA: { texto: 'Autorizada', color: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  RECHAZADA: { texto: 'Rechazada', color: 'bg-red-50 text-red-800 ring-red-300' },
  FINALIZADA: { texto: 'Finalizada', color: 'bg-indigo-50 text-indigo-800 ring-indigo-300' },
  ANULADA: { texto: 'Anulada', color: 'bg-slate-100 text-slate-500 ring-slate-300 line-through' },
  PENDIENTE_DICTAMEN: { texto: 'Pendiente de dictamen', color: 'bg-purple-50 text-purple-800 ring-purple-300' },
  ELEVADA: { texto: 'Elevada', color: 'bg-cyan-50 text-cyan-800 ring-cyan-300' },
  INTERRUMPIDA: { texto: 'Interrumpida', color: 'bg-slate-100 text-slate-700 ring-slate-300' },
  CANCELADA_CESE: { texto: 'Cancelada por cese', color: 'bg-slate-100 text-slate-600 ring-slate-300' },
  REENCUADRADA: { texto: 'Reencuadrada', color: 'bg-slate-100 text-slate-600 ring-slate-300' },
};

export const AGRUPACION: Record<number, string> = { 1: 'Salud', 2: 'Otras licencias', 3: 'Permisos', 4: 'Sanciones', 5: 'Movimientos provisorios' };
export const UNIDAD: Record<string, string> = { CORRIDOS: 'días corridos', HABILES: 'días hábiles', LABORABLES: 'días laborables', MINUTOS_JORNADA: 'jornadas', SIN_TOPE: 'días' };
export const CANAL: Record<string, string> = { SISTEMA: 'Sistema', MAIL: 'Correo electrónico', CUADERNO: 'Cuaderno de inasistencias', WHATSAPP: 'WhatsApp', ORAL: 'En forma oral' };
export const AUTORIDAD: Record<string, string> = {
  DIRECTOR: 'Director', SUPERVISOR: 'Supervisor', SUPERIOR_INMEDIATO: 'Superior inmediato', DIRECTOR_REGIONAL: 'Director Regional', SUBSECRETARIO: 'Subsecretario',
  MINISTRO: 'Ministro', BIENESTAR: 'Dirección de Bienestar Educativo', JUNTA: 'Junta de Clasificación',
};

/** Variantes que corresponden a una revista (sin revista = cualquiera). Mismo criterio que el backend. */
export function variantesPara<T extends { revistas: string[]; activa: boolean; pctHaberes: number | null; denominacion: string | null }>(variantes: T[], revista: string) {
  const cand = variantes.filter((v) => v.activa && (!v.revistas.length || v.revistas.includes(revista)));
  const soloPago = cand.length > 1 && new Set(cand.map((c) => c.denominacion ?? '')).size === 1 && cand.every((c) => c.pctHaberes !== null) && new Set(cand.map((c) => c.pctHaberes)).size === cand.length;
  return { candidatas: cand, hayQueElegir: cand.length > 1 && !soloPago };
}

export const ESTADO_REEMPLAZO: Record<EstadoReemplazo, { texto: string; color: string }> = {
  PROPUESTO: { texto: 'Propuesto', color: 'bg-amber-50 text-amber-800 ring-amber-300' },
  ACTIVO: { texto: 'Activo', color: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  FINALIZADO: { texto: 'Finalizado', color: 'bg-indigo-50 text-indigo-800 ring-indigo-300' },
  ANULADO: { texto: 'Anulado', color: 'bg-slate-100 text-slate-500 ring-slate-300' },
};

export const ESTADO_LABORAL: Record<EstadoLaboral, string> = { ACTIVO: 'Activo', INACTIVO: 'Inactivo', BAJA: 'Baja', JUBILADO: 'Jubilado' };
export const TURNO: Record<Turno, string> = { MANANA: 'Mañana', TARDE: 'Tarde', VESPERTINO: 'Vespertino', NOCHE: 'Noche' };
export const REVISTA: Record<SituacionRevista, string> = { TITULAR: 'Titular', INTERINO: 'Interino', TRANSITORIO: 'Transitorio', SUPLENTE: 'Suplente', PROVISIONAL: 'Provisional' };
export const CATEGORIA: Record<CategoriaLicencia, string> = {
  SALUD: 'Salud', FAMILIAR: 'Familiar', ESTUDIO: 'Estudio', GREMIAL: 'Gremial', ADMINISTRATIVA: 'Administrativa', MATERNIDAD: 'Maternidad', OTRA: 'Otra',
};
export const ASISTENCIA: Record<EstadoAsistencia, string> = { PRESENTE: 'Presente', AUSENTE: 'Ausente', TARDANZA: 'Tardanza', LICENCIA: 'Licencia' };
export const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const REGLA: Record<string, string> = {
  MAX_DIAS_POR_SOLICITUD: 'Máx. días por solicitud',
  MAX_DIAS_POR_ANIO: 'Máx. días por año',
  MAX_SOLICITUDES_POR_ANIO: 'Máx. solicitudes por año',
  MIN_ANTIGUEDAD_MESES: 'Antigüedad mínima (meses)',
  ANTICIPACION_MIN_DIAS: 'Anticipación mínima (días)',
};

export function descripcionDesignacion(d: { cargo: { nombre: string }; espacio?: { nombre: string } | null; curso?: { nombre: string } | null; turno: Turno }) {
  return [d.espacio?.nombre ?? d.cargo.nombre, d.curso?.nombre, TURNO[d.turno]].filter(Boolean).join(' · ');
}
