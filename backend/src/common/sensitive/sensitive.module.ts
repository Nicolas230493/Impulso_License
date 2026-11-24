import { CallHandler, ExecutionContext, Global, Injectable, Module, NestInterceptor, SetMetadata } from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { EntidadSensible, SensitiveDataPolicy } from './sensitive-data.policy';

export const EXPONE_ENTIDAD = 'exponeEntidad';

/**
 * Marca un controlador (o un handler) que devuelve entidades con datos sensibles.
 * Toda respuesta pasa por `SensitiveDataPolicy.redact` antes de serializarse.
 */
export const ExponeEntidad = (...entidades: EntidadSensible[]) => SetMetadata(EXPONE_ENTIDAD, entidades);

@Injectable()
export class SensitiveSerializationInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private policy: SensitiveDataPolicy) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entidades = this.reflector.getAllAndOverride<EntidadSensible[] | undefined>(EXPONE_ENTIDAD, [ctx.getHandler(), ctx.getClass()]);
    if (!entidades?.length || ctx.getType() !== 'http') return next.handle();
    const actor = ctx.switchToHttp().getRequest().user;
    return next.handle().pipe(map((body) => entidades.reduce((acc, e) => this.policy.redact(e, acc, actor), body)));
  }
}

@Global()
@Module({
  providers: [SensitiveDataPolicy, { provide: APP_INTERCEPTOR, useClass: SensitiveSerializationInterceptor }],
  exports: [SensitiveDataPolicy],
})
export class SensitiveModule {}
