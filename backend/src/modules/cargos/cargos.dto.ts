import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SituacionRevista, TipoCargo, Turno } from '@prisma/client';

/** Situaciones de revista de la Ley 647-E. "Provisional" quedó del régimen anterior: no tiene licencias en el nomenclador. */
export const REVISTAS_647E: SituacionRevista[] = ['TITULAR', 'INTERINO', 'TRANSITORIO', 'SUPLENTE'];

export class CargoDto {
  @IsString() @MaxLength(20) codigo: string;
  @IsString() @MaxLength(150) nombre: string;
  @IsEnum(TipoCargo) tipo: TipoCargo;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CursoDto {
  @IsInt() @Min(1) @Max(7) anio: number;
  @IsString() @MaxLength(5) division: string;
  @IsEnum(Turno) turno: Turno;
  @IsInt() @Min(2000) @Max(2100) cicloLectivo: number;
}

export class EspacioDto {
  @IsString() @MaxLength(20) codigo: string;
  @IsString() @MaxLength(150) nombre: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export class HorarioDto {
  @IsInt() @Min(1) @Max(7) diaSemana: number;
  @Matches(HORA, { message: 'Hora inválida (HH:mm)' }) horaDesde: string;
  @Matches(HORA, { message: 'Hora inválida (HH:mm)' }) horaHasta: string;
}

export class DesignacionDto {
  @IsUUID() docenteId: string;
  @IsUUID() cargoId: string;
  @IsOptional() @IsUUID() cursoId?: string;
  @IsOptional() @IsUUID() espacioCurricularId?: string;
  @IsEnum(Turno) turno: Turno;
  @IsIn(REVISTAS_647E, { message: 'Situación de revista inválida: use titular, interino, transitorio o suplente (Ley 647-E). "Provisional" no tiene licencias en el nomenclador.' })
  situacionRevista: SituacionRevista;
  @IsOptional() @IsInt() @Min(1) @Max(60) horasCatedra?: number;
  @IsDateString() fechaDesde: string;
  @IsOptional() @IsDateString() fechaHasta?: string;
  @IsOptional() @IsString() @MaxLength(100) resolucion?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => HorarioDto) horarios?: HorarioDto[];
}

export class BajaDesignacionDto {
  @IsDateString() fechaHasta: string;
  /** Motivo del cese (p. ej. "Presentación del titular"). Interinos y suplentes: cancela sus licencias (art. 350). */
  @IsOptional() @IsString() @MaxLength(200) motivoCese?: string;
}

export class LicenciaAutomaticaDto {
  /** Designación del mismo docente que queda en licencia (2.11: ascenso de jerarquía o incompatibilidad por subrogancia). */
  @IsUUID() designacionAfectadaId: string;
}
