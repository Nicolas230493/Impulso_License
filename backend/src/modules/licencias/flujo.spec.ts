import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Actor } from '../../common/actor';
import { P } from '../../common/permisos';
import { ReemplazosService } from '../reemplazos/reemplazos.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { formatoNumero, impedimentoParaDecidir } from './reglas-negocio';
import { SolicitudesService } from './solicitudes.service';

const actor = (over: Partial<Actor> = {}): Actor => ({
  usuarioId: 'u-rev', institucionId: 'inst', docenteId: null, email: 'x', permisos: [P.LICENCIAS_REVISAR, P.LICENCIAS_CARGAR, P.REEMPLAZOS_GESTIONAR], roles: [], ...over,
});
const tick = () => new Promise((r) => setImmediate(r));

/** Fila en memoria con escritura condicionada como la de PostgreSQL (WHERE evaluado al escribir). */
function almacen<T extends { id: string; version: number; estado: string }>(fila: T) {
  const coincide = (where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const actual = (fila as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && 'in' in v) return (v as { in: unknown[] }).in.includes(actual);
      return actual === v;
    });
  return {
    fila,
    findFirst: jest.fn(async () => { await tick(); return { ...fila }; }),
    findUniqueOrThrow: jest.fn(async () => ({ ...fila })),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      await tick();
      if (!coincide(where)) return { count: 0 };
      for (const [k, v] of Object.entries(data)) (fila as Record<string, unknown>)[k] = v && typeof v === 'object' && 'increment' in v ? fila.version + 1 : v;
      return { count: 1 };
    }),
  };
}

describe('separación de funciones (hallazgo 13)', () => {
  const s = { docenteId: 'doc-1', solicitanteId: 'u-sec', receptorId: 'u-rrhh' };
  it('titular, quien la cargó y quien la recibió no deciden', () => {
    expect(impedimentoParaDecidir({ usuarioId: 'x', docenteId: 'doc-1' }, s)).toMatch(/propia/);
    expect(impedimentoParaDecidir({ usuarioId: 'u-sec', docenteId: null }, s)).toMatch(/cargó/);
    expect(impedimentoParaDecidir({ usuarioId: 'u-rrhh', docenteId: null }, s)).toMatch(/recibió/);
    expect(impedimentoParaDecidir({ usuarioId: 'u-dir', docenteId: null }, s)).toBeNull();
  });
});

describe('numeración por institución (hallazgo 22)', () => {
  it('LIC-<COD_INST>-AAAA-NNNNNN', () => {
    expect(formatoNumero('DEMO', 2026, 42)).toBe('LIC-DEMO-2026-000042');
  });
});

describe('verificación de documentos (hallazgo 14)', () => {
  const crear = (estado: string, extra: object = {}) => {
    const sol = almacen({ id: 's1', version: 0, estado, docenteId: 'doc-1', solicitanteId: 'u-doc', institucionId: 'inst', designaciones: [], ...extra });
    const documentoLicencia = { findFirst: jest.fn().mockResolvedValue({ id: 'd1', verificado: false }), update: jest.fn() };
    const tx = { solicitudLicencia: sol, documentoLicencia };
    const prisma = { $transaction: (fn: (t: unknown) => unknown) => fn(tx) };
    const svc = new SolicitudesService(prisma as never, { registrar: jest.fn() } as never, {} as never, {} as never, {} as never);
    return { svc, documentoLicencia };
  };
  it('en BORRADOR → 409 y no escribe', async () => {
    const { svc, documentoLicencia } = crear('BORRADOR');
    await expect(svc.verificarDocumento(actor(), 's1', 'd1', true)).rejects.toBeInstanceOf(ConflictException);
    expect(documentoLicencia.update).not.toHaveBeenCalled();
  });
  it('nunca sobre una solicitud propia (titular o cargada por el actor)', async () => {
    await expect(crear('PENDIENTE').svc.verificarDocumento(actor({ docenteId: 'doc-1' }), 's1', 'd1', true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(crear('PENDIENTE', { solicitanteId: 'u-rev' }).svc.verificarDocumento(actor(), 's1', 'd1', true)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('en PENDIENTE verifica con escritura condicionada', async () => {
    const { svc, documentoLicencia } = crear('PENDIENTE');
    await svc.verificarDocumento(actor(), 's1', 'd1', true);
    expect(documentoLicencia.update).toHaveBeenCalled();
  });
});

describe('edición condicionada (hallazgo 16)', () => {
  it('si otra petición cambió el estado entre la lectura y la escritura, no modifica los datos (409)', async () => {
    const sol = almacen({ id: 's1', version: 0, estado: 'BORRADOR', docenteId: 'doc-1', solicitanteId: 'u-doc', institucionId: 'inst', designaciones: [], tipoLicenciaId: 't', fechaDesde: new Date('2026-12-01'), fechaHasta: new Date('2026-12-02'), motivo: 'original' });
    const tx = {
      solicitudLicencia: sol,
      tipoLicencia: { findFirst: jest.fn().mockResolvedValue({ formaComputo: 'DIAS_CORRIDOS' }) },
      designacion: { findMany: jest.fn().mockResolvedValue([]) },
      solicitudDesignacion: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = { $transaction: (fn: (t: unknown) => unknown) => fn(tx) };
    const svc = new SolicitudesService(prisma as never, { registrar: jest.fn() } as never, {} as never, {} as never, {} as never);
    // Otra petición la presenta y la recibe mientras esta edición está en curso.
    tx.tipoLicencia.findFirst.mockImplementation(async () => { sol.fila.estado = 'EN_REVISION'; sol.fila.version = 2; return { formaComputo: 'DIAS_CORRIDOS' }; });
    await expect(svc.actualizar(actor({ docenteId: 'doc-1' }), 's1', { motivo: 'pisado' })).rejects.toBeInstanceOf(ConflictException);
    expect(sol.fila.motivo).toBe('original');
  });

  it('el archivo adjunto no se escribe en disco si la base rechaza la operación', async () => {
    const sol = almacen({ id: 's1', version: 0, estado: 'PENDIENTE', docenteId: 'doc-1', solicitanteId: 'u-doc', institucionId: 'inst', designaciones: [] });
    const archivos = { preparar: jest.fn().mockReturnValue({}), registrar: jest.fn(), persistir: jest.fn() };
    const prisma = { solicitudLicencia: sol, $transaction: (fn: (t: unknown) => unknown) => fn({ solicitudLicencia: sol }) };
    const svc = new SolicitudesService(prisma as never, { registrar: jest.fn() } as never, archivos as never, {} as never, {} as never);
    await expect(svc.adjuntar(actor({ docenteId: 'doc-1' }), 's1', 'Certificado', {} as never)).rejects.toBeInstanceOf(ConflictException);
    expect(archivos.persistir).not.toHaveBeenCalled();
  });
});

describe('reemplazos atómicos (hallazgo 15)', () => {
  it('dos cambios concurrentes del mismo reemplazo: uno gana, el otro 409', async () => {
    const rem = almacen({ id: 'r1', version: 0, estado: 'PROPUESTO', observaciones: null, suplentes: [], titular: {}, designacion: { cargo: {} } });
    const tx = { reemplazo: rem };
    const prisma = { $transaction: (fn: (t: unknown) => unknown) => fn(tx) };
    const svc = new ReemplazosService(prisma as never, { registrar: jest.fn() } as never, { notificar: jest.fn(), usuarioDeDocente: jest.fn() } as never);
    const resultados = await Promise.allSettled([
      svc.cambiarEstado(actor(), 'r1', { estado: 'ACTIVO' }),
      svc.cambiarEstado(actor(), 'r1', { estado: 'ANULADO' }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ConflictException);
    expect(rem.fila.version).toBe(1);
  });
});

describe('aislamiento entre instituciones (hallazgos 21 y 23)', () => {
  it('circuitoDe busca el circuito dentro de la institución', async () => {
    const findFirst = jest.fn();
    const svc = new SolicitudesService({} as never, {} as never, {} as never, {} as never, {} as never);
    await svc.circuitoDe({ circuitoAutorizacion: { findFirst } } as never, 'inst-A', 'circ-de-B');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'circ-de-B', institucionId: 'inst-A' } }));
  });
  it('usuariosConRol filtra por institución', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await new NotificacionesService({} as never).usuariosConRol('inst-A', 'rol-1', { usuario: { findMany } } as never);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ institucionId: 'inst-A', roles: { some: { rolId: 'rol-1', rol: { institucionId: 'inst-A' } } } });
  });
});
