import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { AvisoAusencia, EstadoAsistencia } from '@prisma/client';

export class RegistroAsistenciaDto {
  @IsUUID() designacionId: string;
  @IsEnum(EstadoAsistencia) estado: EstadoAsistencia;
  @IsOptional() @IsBoolean() justificada?: boolean;
  @IsOptional() @IsString() @MaxLength(500) justificacion?: string;
  /** Ausente con o sin aviso (arts. 313 d, 326 y 328). */
  @IsOptional() @IsEnum(AvisoAusencia) aviso?: AvisoAusencia;
  @IsOptional() @IsDateString() avisoEn?: string;
}

export class PlanillaAsistenciaDto {
  @IsDateString() fecha: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RegistroAsistenciaDto) registros: RegistroAsistenciaDto[];
}

export class NovedadDto {
  @IsUUID() docenteId: string;
  @IsDateString() fecha: string;
  @IsString() @MaxLength(50) tipo: string;
  @IsString() @MaxLength(2000) descripcion: string;
}
