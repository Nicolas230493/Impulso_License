import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { MAX_BYTES_PASSWORD, MaxBytes, MENSAJE_PASSWORD, REGLA_PASSWORD } from '../auth/auth.dto';

export class CrearUsuarioDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(100) nombre: string;
  @IsString() @MaxLength(100) apellido: string;
  @IsString() @MaxBytes(MAX_BYTES_PASSWORD) @Matches(REGLA_PASSWORD, { message: MENSAJE_PASSWORD }) password: string;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) rolIds: string[];
  @IsOptional() @IsUUID() docenteId?: string;
}

export class ActualizarUsuarioDto {
  @IsOptional() @IsString() @MaxLength(100) nombre?: string;
  @IsOptional() @IsString() @MaxLength(100) apellido?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) rolIds?: string[];
  @IsOptional() @IsUUID() docenteId?: string | null;
}

export class ResetPasswordDto {
  @IsString() @MaxBytes(MAX_BYTES_PASSWORD) @Matches(REGLA_PASSWORD, { message: MENSAJE_PASSWORD }) password: string;
}

export class RolDto {
  @IsString() @MaxLength(50) @Matches(/^[A-Z_]+$/, { message: 'El código debe estar en mayúsculas (A-Z, _)' }) codigo: string;
  @IsString() @MaxLength(100) nombre: string;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) permisos: string[];
}
