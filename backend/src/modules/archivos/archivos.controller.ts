import { Controller, Get, Param, ParseUUIDPipe, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { ArchivosService } from './archivos.service';
import { Actor, ActorActual } from '../../common/actor';

@Controller('archivos')
export class ArchivosController {
  constructor(private svc: ArchivosService) {}

  @Get(':id')
  async descargar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { archivo, contenido } = await this.svc.abrir(a, id);
    // Hallazgo 24: siempre como descarga y en un sandbox, aunque el navegador intente mostrarlo.
    res.set({
      'Content-Type': archivo.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombreOriginal)}`,
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(contenido);
  }
}
