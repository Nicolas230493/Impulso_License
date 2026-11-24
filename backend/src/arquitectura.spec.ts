/**
 * Tests de arquitectura y contrato.
 * - Fase 1: todo controlador que expone entidades de licencia está marcado con @ExponeEntidad.
 * - Hallazgo 26: cada ruta protegida del frontend tiene su guard de permisos en el backend.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { PERMISOS_REQUERIDOS } from './common/decoradores';
import { EXPONE_ENTIDAD } from './common/sensitive/sensitive.module';
import { P } from './common/permisos';
import { AuditoriaController } from './modules/auditoria/auditoria.controller';
import { AsistenciasController } from './modules/asistencias/asistencias.controller';
import { AutorizacionesController } from './modules/autorizaciones/autorizaciones.controller';
import { CargosController } from './modules/cargos/cargos.controller';
import { DocentesController } from './modules/docentes/docentes.controller';
import { CatalogoController } from './modules/licencias/catalogo.controller';
import { SolicitudesController } from './modules/licencias/solicitudes.controller';
import { ReemplazosController } from './modules/reemplazos/reemplazos.controller';
import { ReportesController } from './modules/reportes/reportes.controller';
import { UsuariosController } from './modules/usuarios/usuarios.controller';
import { NomencladorController } from './modules/nomenclador/nomenclador.controller';

process.env.JWT_ACCESS_SECRET ??= 'f3a9c1e7b2d84f6a0c5e9d17b4f8a63c5e0d2b9f7a1c4e8d';
process.env.DATABASE_URL ??= 'postgresql://x';

const archivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? archivos(join(dir, f)) : [join(dir, f)]));

/** Lee solicitudes de licencia o incluye su tipo (consultas Prisma) en un archivo fuente. */
const LEE_LICENCIAS = /solicitudLicencia\.(findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow)|tipoLicencia\s*:\s*(true|\{)/;

/** Controladores que leen solicitudes pero no las devuelven, con la justificación. */
const EXCEPCIONES: Record<string, string> = {
  'notificaciones.controller.ts': 'solo el cron de alertas lee solicitudes; las notificaciones no incluyen tipo ni motivo',
};

describe('arquitectura: @ExponeEntidad obligatorio (Fase 1)', () => {
  const controladores = archivos(join(__dirname, 'modules')).filter((f) => f.endsWith('.controller.ts'));

  it.each(controladores.map((c) => [c.split(/[\\/]/).pop()!, c]))('%s', async (nombre, ruta) => {
    // Fuentes alcanzadas: el controlador y los archivos locales que importa (servicios, informes).
    const fuente = readFileSync(ruta, 'utf8');
    const locales = [...fuente.matchAll(/from '(\.[^']+)'/g)].map((m) => resolve(dirname(ruta), `${m[1]}.ts`));
    const alcanzados = [ruta, ...locales].flatMap((f) => {
      try {
        const s = readFileSync(f, 'utf8');
        const nietos = [...s.matchAll(/from '(\.\/[^']+)'/g)].map((m) => resolve(dirname(f), `${m[1]}.ts`));
        return [s, ...nietos.map((n) => { try { return readFileSync(n, 'utf8'); } catch { return ''; } })];
      } catch { return []; }
    });
    const expone = alcanzados.some((s) => LEE_LICENCIAS.test(s));
    if (!expone || EXCEPCIONES[nombre]) return;
    const mod = await import(ruta);
    const clases = Object.values(mod).filter((v): v is new (...a: never[]) => unknown => typeof v === 'function' && /Controller$/.test((v as { name: string }).name));
    expect(clases.length).toBeGreaterThan(0);
    for (const c of clases) {
      const marcado = Reflect.getMetadata(EXPONE_ENTIDAD, c) ??
        Object.getOwnPropertyNames(c.prototype).every((m) => m === 'constructor' || Reflect.getMetadata(EXPONE_ENTIDAD, c.prototype[m]));
      expect({ controlador: c.name, marcado: !!marcado }).toEqual({ controlador: c.name, marcado: true });
    }
  });
});

// ─────────── Hallazgo 26: contrato frontend ↔ backend ───────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctrl = { prototype: any };
/** Para cada ruta protegida del frontend, los endpoints que usa. */
const CONTRATO: Record<string, [Ctrl, string][]> = {
  'solicitudes/nueva': [[SolicitudesController, 'crear']],
  bandeja: [[AutorizacionesController, 'bandeja']],
  docentes: [[DocentesController, 'listar']],
  'docentes/nuevo': [[DocentesController, 'crear']],
  'docentes/:id/editar': [[DocentesController, 'actualizar']],
  reemplazos: [[ReemplazosController, 'listar']],
  'reemplazos/nuevo': [[ReemplazosController, 'crear']],
  asistencia: [[AsistenciasController, 'planilla'], [AsistenciasController, 'registrar']],
  informes: [[ReportesController, 'informes'], [ReportesController, 'informe']],
  'config/catalogo': [[CatalogoController, 'crearTipo'], [CatalogoController, 'editarTipo'], [AutorizacionesController, 'circuitos']],
  'config/estructura': [[CargosController, 'crearCargo'], [CargosController, 'editarCargo']],
  'config/usuarios': [[UsuariosController, 'listar'], [UsuariosController, 'crear'], [UsuariosController, 'crearRol'], [UsuariosController, 'actualizarRol']],
  'config/auditoria': [[AuditoriaController, 'listar']],
  'config/nomenclador': [[NomencladorController, 'importar'], [NomencladorController, 'nuevaRegla']],
};

const rutasFrontend = () => {
  const fuente = readFileSync(join(__dirname, '../../frontend/src/routes/index.tsx'), 'utf8');
  return [...fuente.matchAll(/path: '([^']+)', element: s\(<Con permisos=\{\[([^\]]+)\]\}>/g)].map((m) => ({
    ruta: m[1],
    permisos: m[2].split(',').map((x) => P[x.trim().replace(/^P\./, '') as keyof typeof P]),
  }));
};

describe('contrato de rutas protegidas (hallazgo 26)', () => {
  const rutas = rutasFrontend();

  it('se encontraron las rutas protegidas del frontend', () => {
    expect(rutas.length).toBeGreaterThanOrEqual(10);
  });

  it.each(rutas.map((r) => [r.ruta, r]))('%s tiene guard en el backend', (_, { ruta, permisos }) => {
    const endpoints = CONTRATO[ruta];
    expect({ ruta, mapeada: !!endpoints }).toEqual({ ruta, mapeada: true });
    for (const [ctrl, metodo] of endpoints) {
      const handler = ctrl.prototype[metodo] as object;
      expect(handler).toBeDefined();
      const requeridos: string[] = Reflect.getMetadata(PERMISOS_REQUERIDOS, handler) ?? Reflect.getMetadata(PERMISOS_REQUERIDOS, ctrl) ?? [];
      expect({ ruta, metodo, conGuard: requeridos.length > 0 }).toEqual({ ruta, metodo, conGuard: true });
      // El frontend oculta la ruta con permisos que el backend realmente exige para alguno de sus endpoints.
      expect({ ruta, metodo, coincide: requeridos.some((p) => (permisos as string[]).includes(p)) }).toEqual({ ruta, metodo, coincide: true });
    }
  });
});
