import { registerDecorator, ValidationOptions } from 'class-validator';

/** Valida CUIL/CUIT argentino (11 dígitos con dígito verificador). Acepta guiones. */
export function cuilValido(valor: string): boolean {
  const d = (valor ?? '').replace(/-/g, '');
  if (!/^\d{11}$/.test(d)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * +d[i], 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9; // casos especiales con prefijo 23/33
  return dv === +d[10];
}

export function EsCuil(opts?: ValidationOptions) {
  return (obj: object, prop: string) =>
    registerDecorator({
      name: 'esCuil',
      target: obj.constructor,
      propertyName: prop,
      options: { message: 'CUIL inválido', ...opts },
      validator: { validate: (v: unknown) => typeof v === 'string' && cuilValido(v) },
    });
}

export const normalizarCuil = (v: string) => {
  const d = v.replace(/-/g, '');
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
};
