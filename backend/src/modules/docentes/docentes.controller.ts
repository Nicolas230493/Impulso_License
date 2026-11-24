import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile } from '@nestjs/common';
import { DocentesService } from './docentes.service';
import { ActualizarDocenteDto, ConfidencialidadDto, CrearDocenteDto, DocumentoPersonalDto, FiltroDocentesDto } from './docentes.dto';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { SubirArchivo } from '../archivos/upload';
import { ArchivoSubido } from '../archivos/archivos.service';
import { ExponeEntidad } from '../../common/sensitive/sensitive.module';

@Controller('docentes')
@ExponeEntidad('solicitud')
export class DocentesController {
  constructor(private svc: DocentesService) {}

  @Get()
  @RequierePermisos(P.DOCENTES_VER, P.LICENCIAS_CARGAR, P.REEMPLAZOS_GESTIONAR, P.ASISTENCIA_REGISTRAR)
  listar(@ActorActual() a: Actor, @Query() f: FiltroDocentesDto) {
    return this.svc.listar(a, f);
  }

  @Get('yo')
  yo(@ActorActual() a: Actor) {
    if (!a.docenteId) throw new NotFoundException('Su usuario no está vinculado a un legajo docente');
    return this.svc.obtener(a, a.docenteId);
  }

  @Get(':id')
  obtener(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.obtener(a, id);
  }

  @Get(':id/licencias')
  licencias(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.historialLicencias(a, id);
  }

  @Post()
  @RequierePermisos(P.DOCENTES_GESTIONAR)
  crear(@ActorActual() a: Actor, @Body() dto: CrearDocenteDto) {
    return this.svc.crear(a, dto);
  }

  @Patch(':id')
  @RequierePermisos(P.DOCENTES_GESTIONAR)
  actualizar(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarDocenteDto) {
    return this.svc.actualizar(a, id, dto);
  }

  @Post(':id/documentos')
  @SubirArchivo()
  agregarDocumento(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DocumentoPersonalDto, @UploadedFile() file?: ArchivoSubido) {
    return this.svc.agregarDocumento(a, id, dto, file);
  }

  @Patch(':id/documentos/:docId/confidencial')
  @RequierePermisos(P.DATOS_SENSIBLES_VER)
  cambiarConfidencialidad(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string, @Body() dto: ConfidencialidadDto) {
    return this.svc.cambiarConfidencialidad(a, id, docId, dto.confidencial);
  }

  @Delete(':id/documentos/:docId')
  @HttpCode(204)
  @RequierePermisos(P.DOCENTES_GESTIONAR)
  eliminarDocumento(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    return this.svc.eliminarDocumento(a, id, docId);
  }
}
