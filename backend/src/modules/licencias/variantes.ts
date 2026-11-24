/**
 * Elección de la variante del nomenclador para cada designación afectada (spec, fase 3).
 * La revista de cada designación determina qué variantes corresponden.
 */
export interface VarianteCandidata {
  id: string;
  codigo: string;
  numero: number;
  revistas: string[];
  pctHaberes: number | null;
  denominacion: string | null;
  observaciones?: string | null;
  activa: boolean;
}
export interface DesignacionParaVariante { id: string; situacionRevista: string }
export interface Asignacion { designacionId: string; varianteId: string; revista: string }
export interface Opcion { designacionId: string; variantes: { id: string; codigo: string; descripcion: string }[] }

/** Variantes activas que corresponden a una revista (sin revista en el nomenclador = cualquiera). */
export const candidatasPara = (variantes: VarianteCandidata[], revista: string) =>
  variantes.filter((v) => v.activa && (!v.revistas.length || v.revistas.includes(revista))).sort((a, b) => a.numero - b.numero);

export function resolverVariantes(
  variantes: VarianteCandidata[],
  designaciones: DesignacionParaVariante[],
  elegidas: { designacionId: string; varianteId: string }[] = [],
): { asignadas: Asignacion[]; errores: string[]; opciones: Opcion[] } {
  const asignadas: Asignacion[] = [];
  const errores: string[] = [];
  const opciones: Opcion[] = [];
  for (const d of designaciones) {
    const cand = candidatasPara(variantes, d.situacionRevista);
    const elegida = elegidas.find((e) => e.designacionId === d.id);
    if (!cand.length) {
      errores.push(`El motivo no tiene variante para la situación de revista ${d.situacionRevista.toLowerCase()} de una de las designaciones`);
      continue;
    }
    if (elegida) {
      if (cand.some((c) => c.id === elegida.varianteId)) asignadas.push({ designacionId: d.id, varianteId: elegida.varianteId, revista: d.situacionRevista });
      else errores.push('La variante elegida no corresponde a la situación de revista de la designación');
      continue;
    }
    // Si solo cambian en la forma de pago (p. ej. largo tratamiento 100 % / 50 %), se toma la de mayor goce:
    // el tramo real lo determina el motor según lo acumulado.
    const soloPago = cand.length > 1 && new Set(cand.map((c) => c.denominacion ?? '')).size === 1 && cand.every((c) => c.pctHaberes !== null) && new Set(cand.map((c) => c.pctHaberes)).size === cand.length;
    if (cand.length === 1 || soloPago) {
      const v = [...cand].sort((a, b) => (b.pctHaberes ?? 0) - (a.pctHaberes ?? 0))[0];
      asignadas.push({ designacionId: d.id, varianteId: v.id, revista: d.situacionRevista });
      continue;
    }
    opciones.push({
      designacionId: d.id,
      variantes: cand.map((c) => ({ id: c.id, codigo: c.codigo, descripcion: c.denominacion ?? c.observaciones ?? `${c.pctHaberes ?? '?'} % de haberes` })),
    });
  }
  if (opciones.length) errores.push('Elija la variante del nomenclador que corresponde (hay más de una posible para la situación de revista)');
  return { asignadas, errores, opciones };
}
