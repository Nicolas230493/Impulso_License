import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { EstadoLaboral } from '@prisma/client';
import { EsCuil } from '../../common/validadores';
import { PaginacionDto } from '../../common/paginacion.dto';

export class DomicilioDto {
  @IsString() @MaxLength(150) calle: string;
  @IsOptional() @IsString() @MaxLength(20) numero?: string;
  @IsOptional() @IsString() @MaxLength(20) piso?: string;
  @IsString() @MaxLength(100) localidad: string;
  @IsString() @MaxLength(100) provincia: string;
  @IsOptional() @IsString() @MaxLength(10) codigoPostal?: string;
}

export class ContactoDto {
  @IsIn(['TELEFONO', 'EMAIL', 'EMERGENCIA']) tipo: string;
  @IsString() @MaxLength(150) valor: string;
  @IsOptional() @IsString() @MaxLength(150) referencia?: string;
  @IsOptional() @IsBoolean() principal?: boolean;
}

export class CrearDocenteDto {
  @IsString() @MaxLength(20) legajo: string;
  @Matches(/^\d{7,8}$/, { message: 'El DNI debe tener 7 u 8 dígitos sin puntos' }) dni: string;
  @EsCuil() cuil: string;
  @IsString() @MaxLength(100) apellido: string;
  @IsString() @MaxLength(100) nombre: string;
  @IsOptional() @IsDateString() fechaNacimiento?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @IsDateString() fechaIngreso: string;
  @IsOptional() @IsEnum(EstadoLaboral) estadoLaboral?: EstadoLaboral;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
  @IsOptional() @ValidateNested() @Type(() => DomicilioDto) domicilio?: DomicilioDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ContactoDto) contactos?: ContactoDto[];
}

export class ActualizarDocenteDto {
  @IsOptional() @IsString() @MaxLength(20) legajo?: string;
  @IsOptional() @Matches(/^\d{7,8}$/, { message: 'El DNI debe tener 7 u 8 dígitos sin puntos' }) dni?: string;
  @IsOptional() @EsCuil() cuil?: string;
  @IsOptional() @IsString() @MaxLength(100) apellido?: string;
  @IsOptional() @IsString() @MaxLength(100) nombre?: string;
  @IsOptional() @IsDateString() fechaNacimiento?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @IsOptional() @IsDateString() fechaIngreso?: string;
  @IsOptional() @IsEnum(EstadoLaboral) estadoLaboral?: EstadoLaboral;
  @IsOptional() @IsString() @MaxLength(2000) observaciones?: string;
  @IsOptional() @ValidateNested() @Type(() => DomicilioDto) domicilio?: DomicilioDto;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ContactoDto) contactos?: ContactoDto[];
}

export class FiltroDocentesDto extends PaginacionDto {
  @IsOptional() @IsEnum(EstadoLaboral) estadoLaboral?: EstadoLaboral;
}

export class DocumentoPersonalDto {
  @IsString() @MaxLength(50) tipo: string;
  @IsOptional() @IsString() @MaxLength(300) descripcion?: string;
  // Sin campo `confidencial`: lo decide el servidor (hallazgo 12). El ValidationPipe rechaza el campo por whitelist.
}

export class ConfidencialidadDto {
  @IsBoolean() confidencial: boolean;
}
