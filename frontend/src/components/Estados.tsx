import type { EstadoReemplazo, EstadoSolicitud } from '@/types';
import { ESTADO_REEMPLAZO, ESTADO_SOLICITUD } from '@/utils/formato';
import { Insignia } from './ui';

export const EstadoSolicitudBadge = ({ estado }: { estado: EstadoSolicitud }) => <Insignia color={ESTADO_SOLICITUD[estado].color}>{ESTADO_SOLICITUD[estado].texto}</Insignia>;
export const EstadoReemplazoBadge = ({ estado }: { estado: EstadoReemplazo }) => <Insignia color={ESTADO_REEMPLAZO[estado].color}>{ESTADO_REEMPLAZO[estado].texto}</Insignia>;
