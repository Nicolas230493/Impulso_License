import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { EstadoReemplazo } from '@prisma/client';
import { PaginacionDto } from '../../common/paginacion.dto';

export class SuplenteDto {
  @IsUUID() suplenteId: string;
  @IsDateString() fechaDesde: string;
  @IsDateString() fechaHasta: string;
  /** Franjas de la designación que cubre. Vacío = cobertura total. */
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) horarioIds?: string[];
}

export class CrearReemplazoDto {
  @IsOptional() @IsUUID() solicitudId?: string;
  @IsUUID() designacionId: string;
  @IsDateString() fechaDesde: string;
  @IsDateString() fechaHasta: string;
  @IsOptional() @IsString() @MaxLength(100) instrumentoLegal?: string;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Indique al menos un suplente' }) @ValidateNested({ each: true }) @Type(() => SuplenteDto) suplentes: SuplenteDto[];
}

export class FiltroReemplazosDto extends PaginacionDto {
  @IsOptional() @IsEnum(EstadoReemplazo) estado?: EstadoReemplazo;
  @IsOptional() @IsUUID() docenteId?: string;
}

export class CambioEstadoReemplazoDto {
  @IsEnum(EstadoReemplazo) estado: EstadoReemplazo;
  /** Versión leída por el cliente; si no coincide con la actual → 409. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) version?: number;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
}
