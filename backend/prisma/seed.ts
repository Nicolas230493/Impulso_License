/**
 * Datos iniciales de EduLicencias — SOLO PARA DESARROLLO Y PRUEBAS.
 * - Catálogo de permisos (siempre se sincroniza).
 * - Una institución de demostración con roles, circuito, regímenes, cargos, docentes y usuarios.
 *
 * Seguridad (hallazgo 5):
 * - Aborta si NODE_ENV no es `development` ni `test`. En producción se usa `npm run bootstrap:admin`.
 * - Las contraseñas se toman de SEED_ADMIN_PASSWORD o se generan al azar por usuario; nunca se imprimen.
 * - Todos los usuarios quedan con `debeCambiarPassword = true`.
 *
 * IMPORTANTE: los regímenes y tipos de licencia cargados son EJEMPLOS ILUSTRATIVOS.
 * La normativa aplicable debe configurarse y validarse por la autoridad competente de cada jurisdicción.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PERMISOS, P } from '../src/common/permisos';
import { MENSAJE_PASSWORD, passwordValida } from '../src/modules/auth/auth.dto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { aplicarNomenclador, parsearNomenclador } from '../src/modules/nomenclador/importador';

const ENTORNOS_PERMITIDOS = ['development', 'test'];
if (!ENTORNOS_PERMITIDOS.includes(process.env.NODE_ENV ?? '')) {
  console.error(
    `El seed de datos de demostración solo corre con NODE_ENV=development o test (actual: ${process.env.NODE_ENV ?? 'sin definir'}).
` +
      'Para crear el primer administrador en producción use: npm run bootstrap:admin',
  );
  process.exit(1);
}

const passwordSemilla = process.env.SEED_ADMIN_PASSWORD;
if (passwordSemilla && !passwordValida(passwordSemilla)) {
  console.error(`SEED_ADMIN_PASSWORD no cumple la política: ${MENSAJE_PASSWORD}`);
  process.exit(1);
}
/** Contraseña de SEED_ADMIN_PASSWORD o una aleatoria distinta por usuario (que cumple la política). */
const passwordDemo = () => passwordSemilla ?? `${randomBytes(18).toString('base64url')}aA1`;

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00Z`);

function cuil(prefijo: string, dni: string) {
  const base = `${prefijo}${dni.padStart(8, '0')}`;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let dv = 11 - (pesos.reduce((s, p, i) => s + p * +base[i], 0) % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return `${base.slice(0, 2)}-${base.slice(2)}-${dv}`;
}

const ROLES: Record<string, { nombre: string; descripcion: string; permisos: string[] }> = {
  ADMIN: { nombre: 'Administrador del sistema', descripcion: 'Acceso total a la configuración', permisos: Object.values(P) },
  DOCENTE: { nombre: 'Docente', descripcion: 'Consulta su legajo y presenta solicitudes', permisos: [P.LICENCIAS_SOLICITAR] },
  SECRETARIA: {
    nombre: 'Secretaría',
    descripcion: 'Registra docentes y cargos, recibe y verifica solicitudes y emite los informes de la ley',
    permisos: [P.DOCENTES_VER, P.DOCENTES_GESTIONAR, P.CARGOS_GESTIONAR, P.LICENCIAS_CARGAR, P.LICENCIAS_VER_TODAS, P.LICENCIAS_REVISAR,
      P.AUTORIZACIONES_DECIDIR, P.ASISTENCIA_REGISTRAR, P.ASISTENCIA_VER, P.REEMPLAZOS_VER, P.REPORTES_VER],
  },
  DIRECTIVO: {
    nombre: 'Directivo',
    descripcion: 'Autoriza o rechaza licencias y supervisa reemplazos',
    permisos: [P.DOCENTES_VER, P.LICENCIAS_VER_TODAS, P.AUTORIZACIONES_DECIDIR, P.REEMPLAZOS_VER, P.REEMPLAZOS_GESTIONAR, P.ASISTENCIA_VER, P.REPORTES_VER],
  },
  RRHH: {
    nombre: 'Administración / RR.HH.',
    descripcion: 'Administra legajos, regímenes, reincorporaciones e informes',
    permisos: [P.DOCENTES_VER, P.DOCENTES_GESTIONAR, P.CARGOS_GESTIONAR, P.CATALOGO_GESTIONAR, P.NOMENCLADOR_GESTIONAR, P.CIRCUITOS_GESTIONAR, P.LICENCIAS_CARGAR,
      P.LICENCIAS_VER_TODAS, P.LICENCIAS_REVISAR, P.REINCORPORACIONES_REGISTRAR, P.REEMPLAZOS_VER, P.REEMPLAZOS_GESTIONAR,
      P.ASISTENCIA_VER, P.REPORTES_VER, P.DATOS_SENSIBLES_VER],
  },
  SUPERVISOR: {
    nombre: 'Representante legal / Supervisión',
    descripcion: 'Consulta información institucional, supervisa trámites e interviene en circuitos',
    permisos: [P.DOCENTES_VER, P.LICENCIAS_VER_TODAS, P.AUTORIZACIONES_DECIDIR, P.REEMPLAZOS_VER, P.ASISTENCIA_VER, P.REPORTES_VER, P.AUDITORIA_VER],
  },
};

async function main() {
  // 1. Permisos
  for (const p of Object.values(PERMISOS)) {
    await prisma.permiso.upsert({ where: { codigo: p.codigo }, create: p, update: { modulo: p.modulo, descripcion: p.descripcion } });
  }
  const permisos = await prisma.permiso.findMany();
  const idPermiso = new Map(permisos.map((p) => [p.codigo, p.id]));

  if (await prisma.institucion.findFirst({ where: { cue: '000000-DEMO' } })) {
    console.log('Institución de demostración ya existente: solo se sincronizaron permisos.');
    return;
  }

  // 2. Institución
  const inst = await prisma.institucion.create({
    data: { nombre: 'Instituto Educativo Demo', codigo: 'DEMO', cue: '000000-DEMO', tipoGestion: 'PUBLICA', jurisdiccion: 'Provincia del Chaco', email: 'secretaria@demo.edu.ar' },
  });

  // 3. Roles
  const roles: Record<string, string> = {};
  for (const [codigo, r] of Object.entries(ROLES)) {
    const rol = await prisma.rol.create({
      data: {
        institucionId: inst.id, codigo, nombre: r.nombre, descripcion: r.descripcion, sistema: true,
        permisos: { create: r.permisos.map((c) => ({ permisoId: idPermiso.get(c)! })) },
      },
    });
    roles[codigo] = rol.id;
  }

  // 4. Circuitos de autorización
  const circuitoGeneral = await prisma.circuitoAutorizacion.create({
    data: {
      institucionId: inst.id, nombre: 'Circuito general', descripcion: 'Verificación por Secretaría y autorización de Dirección', predeterminado: true,
      pasos: { create: [{ orden: 1, nombre: 'Verificación de Secretaría', rolId: roles.SECRETARIA }, { orden: 2, nombre: 'Autorización de Dirección', rolId: roles.DIRECTIVO }] },
    },
  });
  const circuitoExtendido = await prisma.circuitoAutorizacion.create({
    data: {
      institucionId: inst.id, nombre: 'Circuito con representante legal', descripcion: 'Para licencias extraordinarias o sin goce de haberes',
      pasos: {
        create: [
          { orden: 1, nombre: 'Verificación de Secretaría', rolId: roles.SECRETARIA },
          { orden: 2, nombre: 'Conformidad de Dirección', rolId: roles.DIRECTIVO },
          { orden: 3, nombre: 'Autorización del Representante Legal', rolId: roles.SUPERVISOR },
        ],
      },
    },
  });

  // 5. Regímenes y tipos (EJEMPLOS – configurar según normativa vigente)
  const privado = await prisma.regimenLicencia.create({
    data: {
      institucionId: inst.id, codigo: 'PRIV-EJ', nombre: 'Régimen de licencias – gestión privada (ejemplo)', tipoGestion: 'PRIVADA',
      normativa: 'Ejemplo ilustrativo. Reemplazar por el estatuto / convenio aplicable.', vigenteDesde: d('2020-01-01'),
    },
  });
  await prisma.regimenLicencia.create({
    data: {
      institucionId: inst.id, codigo: 'PUB-EJ', nombre: 'Régimen de licencias – gestión pública (ejemplo)', tipoGestion: 'PUBLICA',
      normativa: 'Ejemplo ilustrativo. Configurar según el estatuto docente de la jurisdicción.', vigenteDesde: d('2020-01-01'), activo: false,
    },
  });
  const tipos = [
    { codigo: 'ENF-CORTA', nombre: 'Enfermedad de corto tratamiento', categoria: 'SALUD', formaComputo: 'DIAS_CORRIDOS', documentacionRequerida: ['Certificado médico'],
      reglas: [{ tipo: 'MAX_DIAS_POR_SOLICITUD', valor: 15 }, { tipo: 'MAX_DIAS_POR_ANIO', valor: 45 }] },
    { codigo: 'ATN-FAM', nombre: 'Atención de familiar enfermo', categoria: 'FAMILIAR', formaComputo: 'DIAS_CORRIDOS', documentacionRequerida: ['Certificado médico del familiar'],
      reglas: [{ tipo: 'MAX_DIAS_POR_ANIO', valor: 20 }] },
    { codigo: 'EXAMEN', nombre: 'Rendir examen', categoria: 'ESTUDIO', formaComputo: 'DIAS_HABILES', documentacionRequerida: ['Constancia de examen'],
      reglas: [{ tipo: 'MAX_DIAS_POR_SOLICITUD', valor: 2 }, { tipo: 'MAX_DIAS_POR_ANIO', valor: 10 }] },
    { codigo: 'RAZ-PART', nombre: 'Razones particulares', categoria: 'ADMINISTRATIVA', formaComputo: 'DIAS_HABILES', documentacionRequerida: [],
      reglas: [{ tipo: 'MAX_DIAS_POR_ANIO', valor: 6 }, { tipo: 'MAX_SOLICITUDES_POR_ANIO', valor: 6 }, { tipo: 'ANTICIPACION_MIN_DIAS', valor: 2 }] },
    { codigo: 'MATERN', nombre: 'Maternidad', categoria: 'MATERNIDAD', formaComputo: 'DIAS_CORRIDOS', documentacionRequerida: ['Certificado médico con fecha probable de parto'], reglas: [] },
    { codigo: 'SIN-GOCE', nombre: 'Licencia extraordinaria sin goce de haberes', categoria: 'OTRA', formaComputo: 'DIAS_CORRIDOS', documentacionRequerida: ['Nota fundada'],
      conGoceHaberes: false, circuitoId: circuitoExtendido.id, reglas: [{ tipo: 'MIN_ANTIGUEDAD_MESES', valor: 12 }, { tipo: 'ANTICIPACION_MIN_DIAS', valor: 15 }] },
  ] as const;
  for (const t of tipos) {
    const { reglas, ...datos } = t;
    await prisma.tipoLicencia.create({
      data: {
        ...datos, documentacionRequerida: [...datos.documentacionRequerida], regimenId: privado.id, vigenteDesde: d('2020-01-01'),
        // Sensibles: salud, maternidad y todo tipo que exija certificado médico (incluido ATN-FAM).
        sensible: ['SALUD', 'MATERNIDAD'].includes(datos.categoria) || datos.documentacionRequerida.some((x) => /certificado m[eé]dico/i.test(x)),
        autoridadCompetente: 'Dirección', reglas: { create: reglas.map((r) => ({ ...r })) },
      },
    });
  }

  // 5 bis. Nomenclador oficial de licencias (Ley 647-E, 2026) con sus reglas iniciales.
  const regimen647 = await prisma.regimenLicencia.create({
    data: {
      institucionId: inst.id, codigo: 'LEY-647E', nombre: 'Estatuto del Docente — Ley 647-E (Chaco)', tipoGestion: 'PUBLICA',
      normativa: 'Ley 647-E, títulos XVI a XIX (arts. 305 a 350). Nomenclador de licencias 2026.', vigenteDesde: d('2026-01-01'),
    },
  });
  const nomenclador = await parsearNomenclador(readFileSync(join(__dirname, 'datos', 'nomenclador-647e-2026.xlsx')));
  const cargado = await prisma.$transaction((tx) => aplicarNomenclador(tx, regimen647.id, nomenclador, { vigenciaDesde: d('2026-01-01') }), { timeout: 60_000 });
  console.log(`Nomenclador 647-E: ${cargado.motivos} motivos, ${cargado.variantes} variantes, ${cargado.reglasCreadas} reglas.`);

  // 6. Estructura académica
  const ciclo = new Date().getFullYear();
  const cargos = Object.fromEntries(
    await Promise.all(
      [
        ['PROF-HC', 'Profesor/a (horas cátedra)', 'HORAS_CATEDRA'],
        ['MG', 'Maestro/a de grado', 'CARGO'],
        ['PRECEPTOR', 'Preceptor/a', 'CARGO'],
        ['SECRET', 'Secretario/a', 'CARGO'],
      ].map(async ([codigo, nombre, tipo]) => [codigo, (await prisma.cargo.create({ data: { institucionId: inst.id, codigo, nombre, tipo: tipo as 'CARGO' } })).id]),
    ),
  );
  const espacios = Object.fromEntries(
    await Promise.all(
      [['MAT', 'Matemática'], ['LEN', 'Lengua y Literatura'], ['HIS', 'Historia'], ['BIO', 'Biología'], ['ING', 'Inglés']].map(async ([codigo, nombre]) => [
        codigo, (await prisma.espacioCurricular.create({ data: { institucionId: inst.id, codigo, nombre } })).id,
      ]),
    ),
  );
  const cursos: Record<string, string> = {};
  for (const [anio, division] of [[1, 'A'], [1, 'B'], [2, 'A'], [3, 'A']] as const) {
    const c = await prisma.curso.create({ data: { institucionId: inst.id, anio, division, turno: 'MANANA', cicloLectivo: ciclo, nombre: `${anio}° ${division}` } });
    cursos[`${anio}${division}`] = c.id;
  }

  // 7. Docentes y designaciones
  const docentesData = [
    { legajo: 'D-001', dni: '23456789', apellido: 'García', nombre: 'Laura', sexo: '27', ingreso: '2012-03-01' },
    { legajo: 'D-002', dni: '28765432', apellido: 'Fernández', nombre: 'Martín', sexo: '20', ingreso: '2016-03-01' },
    { legajo: 'D-003', dni: '31234567', apellido: 'López', nombre: 'Carolina', sexo: '27', ingreso: '2019-08-01' },
    { legajo: 'D-004', dni: '35678901', apellido: 'Romero', nombre: 'Diego', sexo: '20', ingreso: '2024-03-01' },
    { legajo: 'D-005', dni: '33987654', apellido: 'Sosa', nombre: 'Valeria', sexo: '27', ingreso: '2021-03-01' },
  ];
  const docentes: Record<string, string> = {};
  for (const x of docentesData) {
    const doc = await prisma.docente.create({
      data: {
        institucionId: inst.id, legajo: x.legajo, dni: x.dni, cuil: cuil(x.sexo, x.dni), apellido: x.apellido, nombre: x.nombre,
        fechaIngreso: d(x.ingreso), email: `${x.nombre.toLowerCase()}.${x.apellido.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@demo.edu.ar`,
        domicilios: { create: { calle: 'Av. Siempre Viva', numero: String(100 + docentesData.indexOf(x)), localidad: 'Resistencia', provincia: 'Chaco', codigoPostal: '3500' } },
      },
    });
    docentes[x.legajo] = doc.id;
  }
  const desig = async (legajo: string, espacio: string, curso: string, horas: number, horarios: [number, string, string][], revista: 'TITULAR' | 'SUPLENTE' = 'TITULAR') =>
    prisma.designacion.create({
      data: {
        docenteId: docentes[legajo], cargoId: cargos['PROF-HC'], espacioCurricularId: espacios[espacio], cursoId: cursos[curso], turno: 'MANANA',
        // La fecha de inicio es la toma de posesión: de ella sale la antigüedad en el cargo y como titular (arts. 318 y 331).
        // El titular conserva el cargo desde su ingreso; el suplente lo toma al comenzar el ciclo.
        situacionRevista: revista, horasCatedra: horas,
        fechaDesde: revista === 'TITULAR' ? d(docentesData.find((x) => x.legajo === legajo)!.ingreso) : d(`${ciclo}-03-01`),
        horarios: { create: horarios.map(([diaSemana, horaDesde, horaHasta]) => ({ diaSemana, horaDesde, horaHasta })) },
      },
    });
  await desig('D-001', 'MAT', '1A', 4, [[1, '07:30', '09:00'], [3, '07:30', '09:00']]);
  await desig('D-001', 'MAT', '2A', 4, [[2, '09:10', '10:40'], [4, '09:10', '10:40']]);
  await desig('D-002', 'LEN', '1A', 4, [[2, '07:30', '09:00'], [5, '07:30', '09:00']]);
  await desig('D-003', 'HIS', '3A', 3, [[1, '10:50', '12:10'], [4, '07:30', '08:10']]);
  await desig('D-004', 'BIO', '1B', 3, [[3, '09:10', '10:40'], [5, '10:50', '11:30']], 'SUPLENTE');
  await desig('D-005', 'ING', '2A', 3, [[1, '09:10', '10:40'], [3, '10:50', '11:30']]);

  // Feriados de ejemplo
  for (const [fecha, descripcion] of [[`${ciclo}-05-01`, 'Día del Trabajador'], [`${ciclo}-05-25`, 'Revolución de Mayo'], [`${ciclo}-07-09`, 'Día de la Independencia']]) {
    await prisma.feriado.create({ data: { institucionId: inst.id, fecha: d(fecha), descripcion } });
  }

  // 8. Usuarios de demostración
  const usuarios: [string, string, string, string, string | null][] = [
    ['admin@demo.edu.ar', 'Admin', 'Sistema', 'ADMIN', null],
    ['secretaria@demo.edu.ar', 'Silvia', 'Paredes', 'SECRETARIA', null],
    ['direccion@demo.edu.ar', 'Ricardo', 'Molina', 'DIRECTIVO', null],
    ['rrhh@demo.edu.ar', 'Andrea', 'Quiroga', 'RRHH', null],
    ['representante@demo.edu.ar', 'Jorge', 'Benítez', 'SUPERVISOR', null],
    ['laura.garcia@demo.edu.ar', 'Laura', 'García', 'DOCENTE', docentes['D-001']],
    ['martin.fernandez@demo.edu.ar', 'Martín', 'Fernández', 'DOCENTE', docentes['D-002']],
    ['diego.romero@demo.edu.ar', 'Diego', 'Romero', 'DOCENTE', docentes['D-004']],
  ];
  for (const [email, nombre, apellido, rol, docenteId] of usuarios) {
    await prisma.usuario.create({
      data: {
        institucionId: inst.id, email, nombre, apellido, passwordHash: await bcrypt.hash(passwordDemo(), 12), debeCambiarPassword: true, docenteId,
        roles: { create: [{ rolId: roles[rol] }] },
      },
    });
  }

  console.log(`Seed completo. Institución: ${inst.nombre}. Circuito predeterminado: ${circuitoGeneral.nombre}. Usuarios de demostración: ${usuarios.length}.`);
  console.log(passwordSemilla
    ? 'Contraseña de los usuarios de demostración: la de SEED_ADMIN_PASSWORD. Se pedirá cambiarla en el primer ingreso.'
    : 'Contraseñas aleatorias (no se muestran). Defina SEED_ADMIN_PASSWORD y vuelva a sembrar para poder ingresar.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
