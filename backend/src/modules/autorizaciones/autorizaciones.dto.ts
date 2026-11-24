import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { DecisionAutorizacion } from '@prisma/client';

export class PasoDto {
  @IsInt() @Min(1) orden: number;
  @IsString() @MaxLength(100) nombre: string;
  @IsUUID() rolId: string;
}

export class CircuitoDto {
  @IsString() @MaxLength(150) nombre: string;
  @IsOptional() @IsString() @MaxLength(1000) descripcion?: string;
  @IsOptional() @IsBoolean() predeterminado?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsArray() @ArrayMinSize(1, { message: 'El circuito necesita al menos un paso' }) @ValidateNested({ each: true }) @Type(() => PasoDto) pasos: PasoDto[];
}

export class DecisionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) version?: number;
  @IsEnum(DecisionAutorizacion) decision: DecisionAutorizacion;
  @ValidateIf((o) => o.decision !== 'APROBADA')
  @IsString({ message: 'Las observaciones y rechazos deben fundamentarse' })
  @MaxLength(3000)
  observacion?: string;
}
