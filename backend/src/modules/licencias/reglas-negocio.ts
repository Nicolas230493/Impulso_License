/**
 * Reglas de negocio de licencias (SPEC 01 §9) como funciones puras,
 * independientes de la base de datos, para poder probarlas de forma aislada.
 */
import { EstadoSolicitud, FormaComputo, TipoRegla } from '@prisma/client';
import { diasCorridos, diasHabiles, formatoISO, seSuperponen } from '../../common/fechas';

export const TRANSICIONES: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  BORRADOR: ['PENDIENTE', 'ANULADA'],
  PENDIENTE: ['EN_REVISION', 'ANULADA', 'CANCELADA_CESE'],
  EN_REVISION: ['OBSERVADA', 'AUTORIZADA', 'RECHAZADA', 'ANULADA', 'PENDIENTE_DICTAMEN', 'ELEVADA', 'CANCELADA_CESE', 'REENCUADRADA'],
  OBSERVADA: ['PENDIENTE', 'ANULADA', 'CANCELADA_CESE'],
  // Con el dictamen de Reconocimientos Médicos: autoriza el Director o se eleva; desfavorable, se rechaza.
  PENDIENTE_DICTAMEN: ['AUTORIZADA', 'ELEVADA', 'RECHAZADA', 'ANULADA', 'CANCELADA_CESE', 'REENCUADRADA'],
  // Elevada a una autoridad externa: se resuelve al cargar su instrumento legal.
  ELEVADA: ['AUTORIZADA', 'RECHAZADA', 'ANULADA', 'CANCELADA_CESE'],
  AUTORIZADA: ['FINALIZADA', 'ANULADA', 'INTERRUMPIDA', 'CANCELADA_CESE', 'REENCUADRADA'],
  RECHAZADA: [],
  FINALIZADA: [],
  ANULADA: [],
  INTERRUMPIDA: [],
  CANCELADA_CESE: [],
  REENCUADRADA: [],
};

export const puedeTransicionar = (desde: EstadoSolicitud, hacia: EstadoSolicitud) => TRANSICIONES[desde].includes(hacia);

/** Estados que "ocupan" el período del docente a efectos de superposición. */
export const ESTADOS_VIGENTES: EstadoSolicitud[] = ['PENDIENTE', 'EN_REVISION', 'OBSERVADA', 'PENDIENTE_DICTAMEN', 'ELEVADA', 'AUTORIZADA', 'FINALIZADA', 'INTERRUMPIDA', 'CANCELADA_CESE'];
/** Estados cuyos días se imputan al cupo anual. */
/** Interrumpidas y canceladas por cese computan lo usado (su fecha final se recorta); las reencuadradas pasan a la nueva. */
export const ESTADOS_COMPUTABLES: EstadoSolicitud[] = ['PENDIENTE', 'EN_REVISION', 'OBSERVADA', 'PENDIENTE_DICTAMEN', 'ELEVADA', 'AUTORIZADA', 'FINALIZADA', 'INTERRUMPIDA', 'CANCELADA_CESE'];
/** Estados en los que el solicitante puede editar. */
export const ESTADOS_EDITABLES: EstadoSolicitud[] = ['BORRADOR', 'OBSERVADA'];

export function computarDias(forma: FormaComputo, desde: Date, hasta: Date, feriados: Date[] = []) {
  return forma === 'DIAS_HABILES' ? diasHabiles(desde, hasta, feriados) : diasCorridos(desde, hasta);
}

export function validarPeriodo(desde: Date, hasta: Date): string[] {
  return hasta < desde ? ['La fecha final no puede ser anterior a la fecha inicial'] : [];
}

export interface SolicitudExistente {
  numero: string;
  fechaDesde: Date;
  fechaHasta: Date;
  designacionIds: string[];
}

/** Superposición: mismo docente, períodos que se cruzan y al menos un cargo afectado en común. */
export function detectarSuperposiciones(desde: Date, hasta: Date, designacionIds: string[], otras: SolicitudExistente[]): string[] {
  return otras
    .filter((o) => seSuperponen(desde, hasta, o.fechaDesde, o.fechaHasta) && o.designacionIds.some((d) => designacionIds.includes(d)))
    .map((o) => `Se superpone con la solicitud ${o.numero} (${formatoISO(o.fechaDesde)} al ${formatoISO(o.fechaHasta)}) en un cargo afectado`);
}

export function documentosFaltantes(requeridos: string[], presentes: string[]): string[] {
  const set = new Set(presentes.map((p) => p.trim().toLowerCase()));
  return requeridos.filter((r) => !set.has(r.trim().toLowerCase()));
}

export interface ContextoReglas {
  dias: number;
  diasUsadosEnAnio: number;
  solicitudesEnAnio: number;
  antiguedadMeses: number;
  anticipacionDias: number;
}

export function evaluarReglas(reglas: { tipo: TipoRegla; valor: number }[], c: ContextoReglas): string[] {
  const errores: string[] = [];
  for (const r of reglas) {
    switch (r.tipo) {
      case 'MAX_DIAS_POR_SOLICITUD':
        if (c.dias > r.valor) errores.push(`Supera el máximo de ${r.valor} días por solicitud (solicitados: ${c.dias})`);
        break;
      case 'MAX_DIAS_POR_ANIO':
        if (c.diasUsadosEnAnio + c.dias > r.valor)
          errores.push(`Supera el máximo anual de ${r.valor} días (utilizados: ${c.diasUsadosEnAnio}, solicitados: ${c.dias})`);
        break;
      case 'MAX_SOLICITUDES_POR_ANIO':
        if (c.solicitudesEnAnio + 1 > r.valor) errores.push(`Supera el máximo de ${r.valor} solicitudes anuales para este tipo de licencia`);
        break;
      case 'MIN_ANTIGUEDAD_MESES':
        if (c.antiguedadMeses < r.valor) errores.push(`Requiere una antigüedad mínima de ${r.valor} meses (actual: ${c.antiguedadMeses})`);
        break;
      case 'ANTICIPACION_MIN_DIAS':
        if (c.anticipacionDias < r.valor) errores.push(`Debe solicitarse con al menos ${r.valor} días de anticipación`);
        break;
    }
  }
  return errores;
}

// ───────────── Separación de funciones (hallazgo 13) ─────────────

export interface ParticipantesSolicitud {
  docenteId: string;
  solicitanteId: string;
  /** Usuario que la recibió para revisión (PENDIENTE → EN_REVISION), si ya fue recibida. */
  receptorId?: string | null;
}

/**
 * Quien es titular, quien la cargó y quien la recibió no pueden decidirla (autorizar, observar ni rechazar).
 * Devuelve el motivo del impedimento o null.
 */
export function impedimentoParaDecidir(actor: { usuarioId: string; docenteId: string | null }, s: ParticipantesSolicitud): string | null {
  if (actor.docenteId && s.docenteId === actor.docenteId) return 'No puede intervenir en su propia solicitud';
  if (s.solicitanteId === actor.usuarioId) return 'No puede decidir una solicitud que usted cargó';
  if (s.receptorId && s.receptorId === actor.usuarioId) return 'No puede decidir una solicitud que usted recibió para revisión';
  return null;
}

/** Estados en los que se puede adjuntar o quitar documentación y editar (hallazgo 16). */
export const ESTADOS_DOCUMENTACION: EstadoSolicitud[] = ['BORRADOR', 'OBSERVADA'];
/** Estados en los que se verifica documentación (hallazgo 14). */
export const ESTADOS_VERIFICACION: EstadoSolicitud[] = ['PENDIENTE', 'EN_REVISION'];

/** Número de solicitud por institución: LIC-<COD_INST>-AAAA-NNNNNN (hallazgo 22). */
export const formatoNumero = (codigoInstitucion: string, anio: number, n: number) => `LIC-${codigoInstitucion}-${anio}-${String(n).padStart(6, '0')}`;
