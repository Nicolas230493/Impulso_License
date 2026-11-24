import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PaginacionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) porPagina = 25;
  @IsOptional() @IsString() @MaxLength(100) buscar?: string;
}

export const paginar = (p: PaginacionDto) => ({ skip: (p.pagina - 1) * p.porPagina, take: p.porPagina });
export const resultadoPaginado = <T>(items: T[], total: number, p: PaginacionDto) => ({
  items,
  total,
  pagina: p.pagina,
  porPagina: p.porPagina,
});
