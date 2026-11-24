import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportesService } from './reportes.service';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { ExponeEntidad } from '../../common/sensitive/sensitive.module';

const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };

@Controller('reportes')
@ExponeEntidad('solicitud') // los tipos sensibles ya salen con nombreTipo(); el interceptor es una segunda barrera
export class ReportesController {
  constructor(private svc: ReportesService) {}

  @Get('panel') panel(@ActorActual() a: Actor) { return this.svc.panel(a); }

  @Get('calendario')
  calendario(@ActorActual() a: Actor, @Query('desde') desde?: string, @Query('hasta') hasta?: string) { return this.svc.calendario(a, desde, hasta); }

  @Get('informes') @RequierePermisos(P.REPORTES_VER)
  informes() { return this.svc.catalogoInformes(); }

  @Get('informes/:clave') @RequierePermisos(P.REPORTES_VER)
  async informe(
    @ActorActual() a: Actor,
    @Param('clave') clave: string,
    @Res({ passthrough: true }) res: Response,
    @Query('formato') formato = 'json',
    @Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('anio') anio?: string, @Query('mes') mes?: string,
    @Query('docenteId', new ParseUUIDPipe({ optional: true })) docenteId?: string,
  ) {
    const f = (['json', 'xlsx', 'pdf'].includes(formato) ? formato : 'json') as 'json' | 'xlsx' | 'pdf';
    const r = await this.svc.informe(a, clave, { desde, hasta, anio, mes, docenteId }, f);
    if (r.formato === 'json' || !('buffer' in r) || !r.buffer) return r.inf;
    res.set({ 'Content-Type': MIME[r.formato], 'Content-Disposition': `attachment; filename="${encodeURIComponent(clave)}.${r.formato}"`, 'Cache-Control': 'no-store' });
    res.send(r.buffer);
  }
}
