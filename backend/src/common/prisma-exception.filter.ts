import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Traduce errores conocidos de Prisma a respuestas HTTP sin revelar el esquema (hallazgo 20):
 * nombres de columnas, índices o restricciones van solo al log.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private log = new Logger('Prisma');

  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'El registro ya existe'],
      P2025: [HttpStatus.NOT_FOUND, 'Registro no encontrado'],
      P2003: [HttpStatus.CONFLICT, 'El registro está referenciado por otros datos'],
    };
    const [status, message] = map[e.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Error de base de datos'];
    this.log.warn(`${e.code} ${JSON.stringify(e.meta ?? {})}`);
    res.status(status).json({ statusCode: status, message });
  }
}
