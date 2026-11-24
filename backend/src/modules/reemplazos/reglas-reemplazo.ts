import { seSuperponen } from '../../common/fechas';

export interface TramoCobertura { suplenteId: string; desde: Date; hasta: Date; horarioIds: string[] }

/**
 * Valida un reemplazo: los tramos deben estar dentro del período, el suplente no puede ser el titular,
 * y una misma franja horaria no puede quedar cubierta por dos suplentes a la vez.
 * `todosLosHorarios` se usa cuando un tramo no especifica franjas (cobertura total).
 */
export function validarCoberturas(titularId: string, desde: Date, hasta: Date, tramos: TramoCobertura[], todosLosHorarios: string[]): string[] {
  const errores: string[] = [];
  if (hasta < desde) errores.push('La fecha final no puede ser anterior a la inicial');
  const efectivos = tramos.map((t) => ({ ...t, horarioIds: t.horarioIds.length ? t.horarioIds : todosLosHorarios }));
  efectivos.forEach((t, i) => {
    if (t.suplenteId === titularId) errores.push('El suplente no puede ser el mismo docente titular');
    if (t.hasta < t.desde) errores.push(`Tramo ${i + 1}: fechas invertidas`);
    if (t.desde < desde || t.hasta > hasta) errores.push(`Tramo ${i + 1}: debe estar comprendido en el período del reemplazo`);
    const ajenos = t.horarioIds.filter((h) => !todosLosHorarios.includes(h));
    if (ajenos.length) errores.push(`Tramo ${i + 1}: incluye franjas que no pertenecen a la designación`);
  });
  for (let i = 0; i < efectivos.length; i++)
    for (let j = i + 1; j < efectivos.length; j++) {
      const a = efectivos[i], b = efectivos[j];
      const franjaComun = a.horarioIds.some((h) => b.horarioIds.includes(h)) || (!todosLosHorarios.length);
      if (franjaComun && seSuperponen(a.desde, a.hasta, b.desde, b.hasta))
        errores.push(`Los tramos ${i + 1} y ${j + 1} cubren la misma franja en fechas superpuestas`);
    }
  return [...new Set(errores)];
}
