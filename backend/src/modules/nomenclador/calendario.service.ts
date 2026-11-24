import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { formatoISO, sumarDias } from '../../common/fechas';
import { Calendario, InicioAntiguedad } from './calculo';

type Cliente = PrismaService | Prisma.TransactionClient;

/** Días sin actividad de la institución (feriados nacionales y provinciales cargados, recesos y asuetos). */
export async function noLaborables(db: Cliente, institucionId: string, desde: Date, hasta: Date): Promise<Set<string>> {
  const filas = await db.feriado.findMany({
    where: { institucionId, fecha: { lte: hasta }, OR: [{ fechaHasta: null, fecha: { gte: desde } }, { fechaHasta: { gte: desde } }] },
  });
  const dias = new Set<string>();
  for (const f of filas) {
    const fin = f.fechaHasta ?? f.fecha;
    for (let d = f.fecha; d <= fin; d = sumarDias(d, 1)) dias.add(formatoISO(d));
  }
  return dias;
}

/** Días de la semana con horario en las designaciones indicadas (base de los días laborables del docente). */
export function diasConHorario(designaciones: { horarios: { diaSemana: number }[] }[]): Set<number> | undefined {
  const dias = new Set(designaciones.flatMap((d) => d.horarios.map((h) => h.diaSemana)));
  return dias.size ? dias : undefined; // sin horarios cargados se cuentan los días hábiles
}

/**
 * Antigüedad en los tres ámbitos de la ley (spec, "Antigüedad"):
 * - cargo y establecimiento: desde la toma de posesión de la designación (arts. 331 a y 340 a);
 * - sistema: ingreso al sistema educativo (art. 331 b), o ingreso a la institución si falta el dato;
 * - titular: primera designación como titular (arts. 318 a y 7 k).
 */
export function iniciosAntiguedad(
  docente: { fechaIngreso: Date; fechaIngresoSistema: Date | null },
  designacion: { fechaDesde: Date },
  todas: { situacionRevista: string; fechaDesde: Date }[],
): InicioAntiguedad {
  const titulares = todas.filter((d) => d.situacionRevista === 'TITULAR').map((d) => d.fechaDesde.getTime());
  return {
    CARGO_ESTABLECIMIENTO: designacion.fechaDesde,
    SISTEMA: docente.fechaIngresoSistema ?? docente.fechaIngreso,
    TITULAR: titulares.length ? new Date(Math.min(...titulares)) : null,
  };
}

@Injectable()
export class CalendarioService {
  constructor(private prisma: PrismaService) {}

  async calendario(institucionId: string, desde: Date, hasta: Date, designaciones: { horarios: { diaSemana: number }[] }[] = []): Promise<Calendario> {
    return { noLaborables: await noLaborables(this.prisma, institucionId, desde, hasta), diasConHorario: diasConHorario(designaciones) };
  }
}
