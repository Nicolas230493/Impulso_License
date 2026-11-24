import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Actor } from '../../common/actor';
import { sanearValoresAuditoria } from '../../common/sensitive/sensitive-data.policy';

const CAMPOS_OCULTOS = ['passwordHash', 'tokenHash'];

function limpiar(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (k, val) => (CAMPOS_OCULTOS.includes(k) ? '[oculto]' : val)),
  );
}

@Injectable()
export class AuditoriaService {
  private log = new Logger('Auditoria');
  constructor(private prisma: PrismaService) {}

  /** Registra una acción. Nunca interrumpe la operación de negocio si falla. */
  async registrar(
    actor: Partial<Actor> | null,
    accion: string,
    entidad: string,
    entidadId?: string | null,
    antes?: unknown,
    despues?: unknown,
    tx?: Prisma.TransactionClient,
  ) {
    try {
      await (tx ?? this.prisma).auditoria.create({
        data: {
          institucionId: actor?.institucionId,
          usuarioId: actor?.usuarioId,
          accion,
          entidad,
          entidadId: entidadId ?? undefined,
          // Los campos sensibles (p. ej. el motivo de una licencia) se guardan como "[modificado]".
          valoresAnteriores: limpiar(sanearValoresAuditoria(entidad, antes)),
          valoresNuevos: limpiar(sanearValoresAuditoria(entidad, despues)),
          ip: actor?.ip,
          userAgent: actor?.userAgent?.slice(0, 300),
        },
      });
    } catch (e) {
      if (tx) throw e; // dentro de una transacción, la auditoría es obligatoria
      this.log.error(`No se pudo registrar auditoría ${accion} ${entidad}: ${(e as Error).message}`);
    }
  }
}
