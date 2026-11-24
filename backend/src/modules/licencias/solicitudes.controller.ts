import { Body, Controller, Delete, Get, HttpCode, Param, ParseBoolPipe, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile } from '@nestjs/common';
import { Response } from 'express';
import { SolicitudesService } from './solicitudes.service';
import {
  ActualizarSolicitudDto, ComentarioDto, CrearSolicitudDto, DocumentoLicenciaDto, ExcepcionDto, FiltroSolicitudesDto, InstrumentoDto, InterrupcionDto,
  NovedadRrhhDto, ReencuadreDto, ReincorporacionDto, VersionDto,
} from './solicitudes.dto';
import { CircuitoService } from './circuito.service';
import { DisposicionesService } from './disposiciones.service';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { ExponeEntidad } from '../../common/sensitive/sensitive.module';
import { SubirArchivo } from '../archivos/upload';
import { ArchivoSubido } from '../archivos/archivos.service';

@Controller('solicitudes')
@ExponeEntidad('solicitud')
export class SolicitudesController {
  constructor(private svc: SolicitudesService, private circuito: CircuitoService, private disposiciones: DisposicionesService) {}

  @Get() listar(@ActorActual() a: Actor, @Query() f: FiltroSolicitudesDto) { return this.svc.listar(a, f); }
  @Get(':id') obtener(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.svc.obtener(a, id); }

  @Post()
  @RequierePermisos(P.LICENCIAS_SOLICITAR, P.LICENCIAS_CARGAR)
  crear(@ActorActual() a: Actor, @Body() dto: CrearSolicitudDto) { return this.svc.crear(a, dto); }

  @Patch(':id')
  actualizar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarSolicitudDto) { return this.svc.actualizar(a, id, dto); }

  @Post(':id/presentar') @HttpCode(200)
  presentar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) { return this.svc.presentar(a, id, dto.version); }

  @Post(':id/anular') @HttpCode(200)
  anular(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ComentarioDto) { return this.svc.anular(a, id, dto.comentario, dto.version); }

  @Post(':id/documentos')
  @SubirArchivo()
  adjuntar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DocumentoLicenciaDto, @UploadedFile() file?: ArchivoSubido) {
    return this.svc.adjuntar(a, id, dto.tipoDocumento, file, dto.version);
  }

  @Delete(':id/documentos/:docId') @HttpCode(204)
  quitar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    return this.svc.quitarDocumento(a, id, docId);
  }

  @Post(':id/documentos/:docId/verificar') @HttpCode(200)
  @RequierePermisos(P.LICENCIAS_REVISAR)
  verificar(
    @ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string,
    @Query('valor', new ParseBoolPipe({ optional: true })) valor?: boolean, @Body() dto?: VersionDto,
  ) {
    return this.svc.verificarDocumento(a, id, docId, valor ?? true, dto?.version);
  }

  /** Novedad de RR.HH. (sanciones y movimientos provisorios), con su instrumento legal. */
  @Post('novedades-rrhh')
  @RequierePermisos(P.DOCENTES_GESTIONAR)
  novedad(@ActorActual() a: Actor, @Body() dto: NovedadRrhhDto) { return this.circuito.registrarNovedad(a, dto); }

  @Post(':id/excepcion') @HttpCode(200)
  @RequierePermisos(P.LICENCIAS_EXCEPCION)
  excepcion(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExcepcionDto) { return this.svc.excepcion(a, id, dto); }

  @Post(':id/partir') @HttpCode(200)
  partir(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) { return this.svc.partir(a, id, dto.version); }

  /** Dictamen de Reconocimientos Médicos o resolución de la autoridad externa (archivo opcional). */
  @Post(':id/instrumentos')
  @RequierePermisos(P.LICENCIAS_REVISAR, P.AUTORIZACIONES_DECIDIR)
  @SubirArchivo()
  instrumento(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InstrumentoDto, @UploadedFile() file?: ArchivoSubido) {
    return this.circuito.registrarInstrumento(a, id, dto, file);
  }

  @Post(':id/interrumpir') @HttpCode(200)
  @RequierePermisos(P.REINCORPORACIONES_REGISTRAR, P.LICENCIAS_REVISAR)
  interrumpir(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InterrupcionDto) { return this.circuito.interrumpir(a, id, dto); }

  @Post(':id/reencuadrar') @HttpCode(200)
  @RequierePermisos(P.LICENCIAS_REVISAR)
  reencuadrar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReencuadreDto) { return this.circuito.reencuadrar(a, id, dto); }

  /** PDF de la disposición (se genera a pedido; con datos sensibles, solo el titular y datos_sensibles.ver). */
  @Get(':id/disposicion.pdf')
  async disposicion(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { nombre, buffer } = await this.disposiciones.pdf(a, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    res.send(buffer);
  }

  @Post(':id/reincorporacion') @HttpCode(200)
  @RequierePermisos(P.REINCORPORACIONES_REGISTRAR)
  reincorporar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReincorporacionDto) { return this.svc.reincorporar(a, id, dto); }
}
