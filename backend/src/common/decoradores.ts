import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO = 'esPublico';
export const Publico = () => SetMetadata(ES_PUBLICO, true);

export const PERMISOS_REQUERIDOS = 'permisosRequeridos';
/** Requiere AL MENOS UNO de los permisos indicados. */
export const PERMITE_CAMBIO_PENDIENTE = 'permiteCambioPendiente';
/**
 * Ruta disponible para un usuario que todavía debe cambiar su contraseña temporal (perfil, cambio de contraseña,
 * cierre de sesión). El resto de la API responde 403 hasta que la cambie.
 */
export const PermiteCambioPendiente = () => SetMetadata(PERMITE_CAMBIO_PENDIENTE, true);

export const MENSAJE_CAMBIO_PENDIENTE = 'Debe cambiar su contraseña antes de continuar';
export const MENSAJE_2FA_PENDIENTE = 'Debe configurar la verificación en dos pasos antes de continuar';

export const RequierePermisos = (...permisos: string[]) => SetMetadata(PERMISOS_REQUERIDOS, permisos);
