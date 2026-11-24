/**
 * Utilidades de fechas. Las fechas "de calendario" (sin hora) se manejan
 * como Date a medianoche UTC para evitar corrimientos por zona horaria.
 */
export const DIA_MS = 86_400_000;

export function parseFecha(valor: string | Date): Date {
  if (valor instanceof Date) return new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!m) throw new Error(`Fecha inválida: ${valor}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export const hoy = () => parseFecha(new Date(Date.now() - 3 * 3600_000)); // hora Argentina (UTC-3)
export const sumarDias = (f: Date, n: number) => new Date(f.getTime() + n * DIA_MS);
export const formatoISO = (f: Date) => f.toISOString().slice(0, 10);

/** Cantidad de días entre dos fechas, ambos extremos incluidos. */
export const diasCorridos = (desde: Date, hasta: Date) => Math.round((hasta.getTime() - desde.getTime()) / DIA_MS) + 1;

/** Días hábiles (lunes a viernes, excluyendo feriados) entre dos fechas inclusive. */
export function diasHabiles(desde: Date, hasta: Date, feriados: Date[] = []): number {
  const excluidos = new Set(feriados.map((f) => formatoISO(f)));
  let total = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const dia = f.getUTCDay();
    if (dia !== 0 && dia !== 6 && !excluidos.has(formatoISO(f))) total++;
  }
  return total;
}

export const seSuperponen = (aDesde: Date, aHasta: Date, bDesde: Date, bHasta: Date) => aDesde <= bHasta && bDesde <= aHasta;

export function mesesEntre(desde: Date, hasta: Date): number {
  let meses = (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - desde.getUTCMonth());
  if (hasta.getUTCDate() < desde.getUTCDate()) meses--;
  return meses;
}
