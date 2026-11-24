import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UploadedFile } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsDefined, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Actor, ActorActual } from '../../common/actor';
import { RequierePermisos } from '../../common/decoradores';
import { P } from '../../common/permisos';
import { SubirArchivo } from '../archivos/upload';
import { ArchivoSubido } from '../archivos/archivos.service';
import { NomencladorService } from './nomenclador.service';
import { ReglasLicenciaService } from './reglas-licencia.service';

class ImportarDto {
  @IsOptional() @IsUUID() regimenId?: string;
}

class NuevaReglaDto {
  @IsDateString() vigenciaDesde: string;
  @IsDefined() @IsObject() definicion: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2000) nota?: string;
}

class VarianteDesignacion {
  @IsUUID() designacionId: string;
  @IsUUID() varianteId: string;
}

class SimularDto {
  /** Misma variante para todas las designaciones, o `variantes` con una por designación. */
  @IsOptional() @IsUUID() varianteId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VarianteDesignacion) variantes?: VarianteDesignacion[];
  @IsUUID() docenteId: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('4', { each: true }) designacionIds: string[];
  @IsDateString() desde: string;
  @IsDateString() hasta: string;
  @IsOptional() @IsDateString() fechaEvento?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @Type(() => String) ampliaciones?: string[];
  @IsOptional() @IsUUID() excluirSolicitudId?: string;
}

/** Nomenclador de licencias (Ley 647-E): importación, consulta, reglas versionadas, simulación y saldos. */
@Controller('nomenclador')
export class NomencladorController {
  constructor(private svc: NomencladorService, private reglas: ReglasLicenciaService) {}

  @Get()
  listar(@ActorActual() a: Actor, @Query('regimenId') regimenId?: string) { return this.svc.listar(a, regimenId); }

  @Post('importar/vista-previa') @HttpCode(200) @RequierePermisos(P.NOMENCLADOR_GESTIONAR) @SubirArchivo()
  vistaPrevia(@ActorActual() a: Actor, @Body() dto: ImportarDto, @UploadedFile() file?: ArchivoSubido) { return this.svc.vistaPrevia(a, file, dto.regimenId); }

  @Post('importar') @HttpCode(200) @RequierePermisos(P.NOMENCLADOR_GESTIONAR) @SubirArchivo()
  importar(@ActorActual() a: Actor, @Body() dto: ImportarDto, @UploadedFile() file?: ArchivoSubido) { return this.svc.aplicar(a, file, dto.regimenId); }

  @Get('variantes/:id/reglas') @RequierePermisos(P.NOMENCLADOR_GESTIONAR, P.CATALOGO_GESTIONAR)
  reglasDeVariante(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.svc.reglas(a, id); }

  @Post('variantes/:id/reglas') @RequierePermisos(P.NOMENCLADOR_GESTIONAR)
  nuevaRegla(@ActorActual() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NuevaReglaDto) { return this.svc.nuevaVersion(a, id, dto); }

  /** Evalúa una variante para un docente sin crear nada (el permiso se controla en el servicio: propio o gestión). */
  @Post('simular') @HttpCode(200)
  simular(@ActorActual() a: Actor, @Body() dto: SimularDto) { return this.reglas.evaluar(a, dto); }

  @Get('saldos/:docenteId')
  saldos(@ActorActual() a: Actor, @Param('docenteId', ParseUUIDPipe) docenteId: string) { return this.reglas.recalcularSaldos(a, docenteId); }
}
