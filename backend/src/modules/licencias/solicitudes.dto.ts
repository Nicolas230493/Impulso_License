import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { CanalIngreso, EstadoSolicitud, TipoInstrumento } from '@prisma/client';
import { PaginacionDto } from '../../common/paginacion.dto';

/** Versión leída por el cliente (control de concurrencia optimista). Si no coincide con la actual → 409. */
export class VersionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) version?: number;
}

export class VarianteDesignacionDto {
  @IsUUID() designacionId: string;
  @IsUUID() varianteId: string;
}

/** Datos del nomenclador (Ley 647-E) comunes a alta y edición. */
class DatosNomencladorDto extends VersionDto {
  /** Motivo del nomenclador. Si se indica, la variante de cada designación sale de su revista. */
  @IsOptional() @IsUUID() motivoId?: string;
  /** Variante elegida por designación, cuando el motivo tiene más de una para la misma revista. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VarianteDesignacionDto) variantes?: VarianteDesignacionDto[];
  @IsOptional() @IsDateString() fechaEvento?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) @MaxLength(50, { each: true }) ampliaciones?: string[];
  /** Por dónde llegó el pedido cuando lo carga Secretaría (arts. 313 d y 326). */
  @IsOptional() @IsEnum(CanalIngreso) canalIngreso?: CanalIngreso;
  @IsOptional() @IsDateString() avisoEn?: string;
}

export class CrearSolicitudDto extends DatosNomencladorDto {
  /** Si se omite, la solicitud es para el docente vinculado al usuario. */
  @IsOptional() @IsUUID() docenteId?: string;
  /** Régimen anterior (tipos sin nomenclador). Con el nomenclador se usa motivoId. */
  @IsOptional() @IsUUID() tipoLicenciaId?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Seleccione al menos una designación afectada' }) @ArrayUnique() @IsUUID('4', { each: true })
  designacionIds: string[];
  @IsDateString() fechaDesde: string;
  @IsDateString() fechaHasta: string;
  @IsOptional() @IsString() @MaxLength(3000) motivo?: string;
}

/** Novedad de RR.HH. (sanciones, movimientos provisorios): entra con su instrumento legal, sin circuito. */
export class NovedadRrhhDto {
  @IsUUID() docenteId: string;
  @IsUUID() motivoId: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VarianteDesignacionDto) variantes?: VarianteDesignacionDto[];
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('4', { each: true }) designacionIds: string[];
  @IsDateString() fechaDesde: string;
  @IsDateString() fechaHasta: string;
  @IsString() @MaxLength(100) instrumentoNumero: string;
  @IsDateString() instrumentoFecha: string;
  @IsString() @MaxLength(200) instrumentoEmisor: string;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}

export class ExcepcionDto extends VersionDto {
  @IsString() @MaxLength(2000) motivo: string;
  @IsString() @MaxLength(200) instrumentoLegal: string;
}

/** Instrumento legal de una solicitud: dictamen de Reconocimientos Médicos o resolución de una autoridad externa. */
export class InstrumentoDto extends VersionDto {
  @IsEnum(TipoInstrumento) tipo: TipoInstrumento;
  @IsString() @MaxLength(100) numero: string;
  @IsDateString() fecha: string;
  @IsString() @MaxLength(200) emisor: string;
  /** Dictamen o resolución favorable (por defecto sí). */
  // En multipart llega como texto: "false" debe ser false (con @Type(() => Boolean) sería true).
  @IsOptional() @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value)) @IsBoolean() favorable?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}

export class InterrupcionDto extends VersionDto {
  @IsDateString() fecha: string;
  @IsEnum(['ENFERMEDAD', 'MATERNIDAD', 'RAZONES_DE_SERVICIO']) causa: 'ENFERMEDAD' | 'MATERNIDAD' | 'RAZONES_DE_SERVICIO';
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}

export class ReencuadreDto extends VersionDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VarianteDesignacionDto) variantes?: VarianteDesignacionDto[];
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}

export class ActualizarSolicitudDto extends DatosNomencladorDto {
  @IsOptional() @IsUUID() tipoLicenciaId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('4', { each: true }) designacionIds?: string[];
  @IsOptional() @IsDateString() fechaDesde?: string;
  @IsOptional() @IsDateString() fechaHasta?: string;
  @IsOptional() @IsString() @MaxLength(3000) motivo?: string;
}

export class FiltroSolicitudesDto extends PaginacionDto {
  @IsOptional() @IsEnum(EstadoSolicitud, { each: true }) estado?: EstadoSolicitud | EstadoSolicitud[];
  @IsOptional() @IsUUID() docenteId?: string;
  @IsOptional() @IsUUID() tipoLicenciaId?: string;
  @IsOptional() @IsDateString() desde?: string;
  @IsOptional() @IsDateString() hasta?: string;
}

export class ComentarioDto extends VersionDto {
  @IsOptional() @IsString() @MaxLength(2000) comentario?: string;
}

export class DocumentoLicenciaDto extends VersionDto {
  @IsString() @MaxLength(100) tipoDocumento: string;
}

export class ReincorporacionDto extends VersionDto {
  @IsDateString() fechaEfectiva: string;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}
