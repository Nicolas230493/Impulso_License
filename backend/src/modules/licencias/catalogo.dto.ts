import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { CategoriaLicencia, FormaComputo, TipoGestion, TipoRegla } from '@prisma/client';

export class RegimenDto {
  @IsString() @MaxLength(30) codigo: string;
  @IsString() @MaxLength(200) nombre: string;
  @IsEnum(TipoGestion) tipoGestion: TipoGestion;
  @IsOptional() @IsString() @MaxLength(300) normativa?: string;
  @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;
  @IsDateString() vigenteDesde: string;
  @IsOptional() @IsDateString() vigenteHasta?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class ReglaDto {
  @IsEnum(TipoRegla) tipo: TipoRegla;
  @IsInt() @Min(0) valor: number;
  @IsOptional() @IsString() @MaxLength(300) descripcion?: string;
}

export class TipoLicenciaDto {
  @IsUUID() regimenId: string;
  @IsOptional() @IsUUID() circuitoId?: string | null;
  @IsString() @MaxLength(30) codigo: string;
  @IsString() @MaxLength(200) nombre: string;
  @IsEnum(CategoriaLicencia) categoria: CategoriaLicencia;
  @IsOptional() @IsString() @MaxLength(50) articulo?: string;
  @IsOptional() @IsString() @MaxLength(2000) descripcion?: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) documentacionRequerida: string[];
  @IsEnum(FormaComputo) formaComputo: FormaComputo;
  @IsOptional() @IsBoolean() conGoceHaberes?: boolean;
  @IsOptional() @IsString() @MaxLength(200) autoridadCompetente?: string;
  /** Datos de salud. Salud, maternidad y tipos con certificado médico son sensibles siempre (no se puede bajar). */
  @IsOptional() @IsBoolean() sensible?: boolean;
  @IsDateString() vigenteDesde: string;
  @IsOptional() @IsDateString() vigenteHasta?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReglaDto) reglas: ReglaDto[];
}
