import { Injectable } from '@nestjs/common';
import { Actor, tienePermiso } from '../actor';
import { P } from '../permisos';

/**
 * Política única de datos sensibles (hallazgos 1, 2, 3, 11 y 12).
 *
 * Todo punto de salida (API, auditoría, informes, archivos) pasa por acá. La clasificación es declarativa:
 * para cada entidad se listan los campos sensibles, y el tipo de licencia se considera sensible según
 * `TipoLicencia.sensible`. Si ese dato no está disponible en el objeto, se asume sensible (falla cerrada).
 */

export const ETIQUETA_TIPO_RESERVADO = 'Licencia con reserva';
export const CODIGO_TIPO_RESERVADO = 'RESERVADO';
export const VALOR_AUDITORIA_SENSIBLE = '[modificado]';
export const NOMBRE_ARCHIVO_RESERVADO = 'Documento confidencial';

/** Campos sensibles por entidad. */
export const CAMPOS_SENSIBLES = {
  solicitud: ['motivo', 'observaciones'],
  /** Del tipo de licencia se reservan estos campos cuando `sensible = true`. */
  tipoLicencia: ['nombre', 'codigo', 'categoria', 'articulo', 'descripcion', 'documentacionRequerida', 'reglas'],
} as const;

/** Entidades que la auditoría registra con campos sensibles. */
const AUDITORIA_SENSIBLE: Record<string, readonly string[]> = {
  solicitud: CAMPOS_SENSIBLES.solicitud,
};

export type EntidadSensible = 'solicitud' | 'auditoria';

type ActorPolitica = Pick<Actor, 'permisos' | 'docenteId'>;
type Obj = Record<string, unknown>;

export interface TipoClasificable {
  sensible?: boolean | null;
  nombre?: string;
  codigo?: string;
}

const esObjeto = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);

export const puedeVerSensibles = (actor: ActorPolitica | null | undefined) => !!actor && tienePermiso(actor as Actor, P.DATOS_SENSIBLES_VER);

/** El titular de la licencia (el propio docente) y quien tiene `datos_sensibles.ver` ven todo. */
export function accesoCompleto(actor: ActorPolitica | null | undefined, docenteTitularId?: string | null) {
  if (puedeVerSensibles(actor)) return true;
  return !!actor?.docenteId && !!docenteTitularId && actor.docenteId === docenteTitularId;
}

/** Falla cerrada: si no se cargó `sensible`, se trata como sensible. */
export const tipoEsSensible = (tipo: TipoClasificable | null | undefined) => !tipo || tipo.sensible !== false;

/** Nombre del tipo de licencia a mostrar a este actor. */
export function nombreTipo(tipo: TipoClasificable & { nombre: string }, actor: ActorPolitica | null | undefined, docenteTitularId?: string | null) {
  if (!tipoEsSensible(tipo) || accesoCompleto(actor, docenteTitularId)) return tipo.nombre;
  return ETIQUETA_TIPO_RESERVADO;
}

/** Código + nombre (p. ej. "ENF-CORTA – Enfermedad…") o la etiqueta genérica. */
export function codigoYNombreTipo(tipo: TipoClasificable & { nombre: string; codigo: string }, actor: ActorPolitica | null | undefined, docenteTitularId?: string | null) {
  if (!tipoEsSensible(tipo) || accesoCompleto(actor, docenteTitularId)) return `${tipo.codigo} – ${tipo.nombre}`;
  return ETIQUETA_TIPO_RESERVADO;
}

function redactarTipo(tipo: Obj): Obj {
  const r: Obj = { ...tipo };
  for (const campo of CAMPOS_SENSIBLES.tipoLicencia) {
    if (!(campo in r)) continue;
    if (campo === 'nombre') r.nombre = ETIQUETA_TIPO_RESERVADO;
    else if (campo === 'codigo') r.codigo = CODIGO_TIPO_RESERVADO;
    else if (campo === 'documentacionRequerida' || campo === 'reglas') r[campo] = [];
    else r[campo] = null;
  }
  r.reservado = true;
  return r;
}

function redactarDocumentos(docs: unknown): unknown {
  if (!Array.isArray(docs)) return docs;
  return docs.map((d) => {
    if (!esObjeto(d) || !esObjeto(d.archivo) || d.archivo.confidencial === false) return d;
    return { ...d, archivo: { ...d.archivo, nombreOriginal: NOMBRE_ARCHIVO_RESERVADO } };
  });
}

/** ¿El objeto es una solicitud de licencia (fila o proyección)? */
export const pareceSolicitud = (o: Obj) => 'docenteId' in o && ('motivo' in o || 'tipoLicencia' in o || 'tipoLicenciaId' in o);

function redactarSolicitud(s: Obj, actor: ActorPolitica | null | undefined): Obj {
  if (accesoCompleto(actor, s.docenteId as string | undefined)) return s;
  const r: Obj = { ...s };
  for (const campo of CAMPOS_SENSIBLES.solicitud) if (campo in r) r[campo] = null;
  const tipoSensible = 'tipoLicencia' in r && esObjeto(r.tipoLicencia) && tipoEsSensible(r.tipoLicencia as TipoClasificable);
  const reservada = r.reservada === true;
  if (tipoSensible || (reservada && 'tipoLicencia' in r && esObjeto(r.tipoLicencia))) r.tipoLicencia = redactarTipo(r.tipoLicencia as Obj);
  if ('documentos' in r) r.documentos = redactarDocumentos(r.documentos);
  // Nomenclador (Ley 647-E): el motivo, las variantes (código y encuadre) y la evaluación revelan el tipo.
  if (tipoSensible || reservada || !('tipoLicencia' in r)) {
    if ('motivoNomenclador' in r && esObjeto(r.motivoNomenclador)) r.motivoNomenclador = { ...r.motivoNomenclador, codigo: CODIGO_TIPO_RESERVADO, nombre: ETIQUETA_TIPO_RESERVADO };
    if ('variantes' in r && Array.isArray(r.variantes))
      r.variantes = r.variantes.map((v) => (esObjeto(v) ? { ...v, codigo: CODIGO_TIPO_RESERVADO, encuadreLegal: null, denominacion: null } : v));
    if ('evaluacion' in r) r.evaluacion = null;
    if ('tramosHaberes' in r) r.tramosHaberes = null;
  }
  return r;
}

/** Reemplaza los valores sensibles de un registro de auditoría por "[modificado]". */
export function sanearValoresAuditoria(entidad: string, valores: unknown): unknown {
  const campos = AUDITORIA_SENSIBLE[entidad];
  if (!campos || !esObjeto(valores)) return valores;
  const r: Obj = { ...valores };
  for (const c of campos) if (c in r && r[c] !== null && r[c] !== undefined) r[c] = VALOR_AUDITORIA_SENSIBLE;
  return r;
}

function redactarAuditoria(fila: Obj, actor: ActorPolitica | null | undefined): Obj {
  if (puedeVerSensibles(actor)) return fila;
  const entidad = String(fila.entidad ?? '');
  return {
    ...fila,
    valoresAnteriores: sanearValoresAuditoria(entidad, fila.valoresAnteriores),
    valoresNuevos: sanearValoresAuditoria(entidad, fila.valoresNuevos),
  };
}

/**
 * Devuelve una copia del objeto con los campos sensibles reemplazados según el actor.
 * Recorre estructuras anidadas (listas, paginados, includes) y aplica la regla a cada nodo de la entidad.
 */
export function redact<T>(entidad: EntidadSensible, objeto: T, actor: ActorPolitica | null | undefined): T {
  const visitar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visitar);
    if (!esObjeto(v)) return v;
    let nodo: Obj = v;
    if (entidad === 'solicitud' && pareceSolicitud(nodo)) nodo = redactarSolicitud(nodo, actor);
    if (entidad === 'auditoria' && 'entidad' in nodo && ('valoresNuevos' in nodo || 'valoresAnteriores' in nodo)) nodo = redactarAuditoria(nodo, actor);
    const salida: Obj = {};
    for (const [k, val] of Object.entries(nodo)) salida[k] = visitar(val);
    return salida;
  };
  return visitar(objeto) as T;
}

/** Sensibilidad por defecto de un tipo de licencia nuevo: salud, maternidad o que exija certificado médico. */
export function sensibilidadPorDefecto(categoria: string, documentacionRequerida: string[]) {
  if (categoria === 'SALUD' || categoria === 'MATERNIDAD') return true;
  return documentacionRequerida.some((d) => /certificado m[eé]dico/i.test(d));
}

@Injectable()
export class SensitiveDataPolicy {
  readonly etiquetaReservada = ETIQUETA_TIPO_RESERVADO;
  redact = redact;
  nombreTipo = nombreTipo;
  codigoYNombreTipo = codigoYNombreTipo;
  tipoEsSensible = tipoEsSensible;
  accesoCompleto = accesoCompleto;
  puedeVerSensibles = puedeVerSensibles;
  sanearValoresAuditoria = sanearValoresAuditoria;
}
