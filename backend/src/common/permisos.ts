/**
 * Catálogo de permisos del sistema. Los roles se configuran por institución
 * asignando estos códigos (tabla rol_permisos). El frontend recibe la lista
 * de permisos efectivos del usuario para mostrar u ocultar funciones, pero
 * la autorización real siempre se aplica en el backend.
 */
export const PERMISOS = {
  INSTITUCION_GESTIONAR: { codigo: 'institucion.gestionar', modulo: 'instituciones', descripcion: 'Editar datos institucionales y feriados' },
  USUARIOS_GESTIONAR: { codigo: 'usuarios.gestionar', modulo: 'usuarios', descripcion: 'Administrar usuarios y asignarles roles' },
  ROLES_GESTIONAR: { codigo: 'roles.gestionar', modulo: 'usuarios', descripcion: 'Crear y modificar roles y su matriz de permisos' },
  DOCENTES_VER: { codigo: 'docentes.ver', modulo: 'docentes', descripcion: 'Consultar legajos docentes' },
  DOCENTES_GESTIONAR: { codigo: 'docentes.gestionar', modulo: 'docentes', descripcion: 'Registrar y modificar legajos docentes' },
  CARGOS_GESTIONAR: { codigo: 'cargos.gestionar', modulo: 'cargos', descripcion: 'Administrar cargos, cursos, espacios y designaciones' },
  CATALOGO_GESTIONAR: { codigo: 'catalogo.gestionar', modulo: 'licencias', descripcion: 'Administrar regímenes y tipos de licencia' },
  NOMENCLADOR_GESTIONAR: { codigo: 'nomenclador.gestionar', modulo: 'licencias', descripcion: 'Importar el nomenclador oficial y administrar las reglas de cada variante' },
  LICENCIAS_SOLICITAR: { codigo: 'licencias.solicitar', modulo: 'licencias', descripcion: 'Presentar solicitudes propias' },
  LICENCIAS_CARGAR: { codigo: 'licencias.cargar', modulo: 'licencias', descripcion: 'Cargar solicitudes en nombre de un docente' },
  LICENCIAS_VER_TODAS: { codigo: 'licencias.ver_todas', modulo: 'licencias', descripcion: 'Consultar todas las solicitudes de la institución' },
  LICENCIAS_REVISAR: { codigo: 'licencias.revisar', modulo: 'licencias', descripcion: 'Recibir solicitudes, verificar documentación y observar' },
  LICENCIAS_EXCEPCION: { codigo: 'licencias.excepcion', modulo: 'licencias', descripcion: 'Autorizar excepciones a topes y requisitos del nomenclador, con motivo e instrumento legal' },
  AUTORIZACIONES_DECIDIR: { codigo: 'autorizaciones.decidir', modulo: 'autorizaciones', descripcion: 'Intervenir en pasos del circuito de autorización' },
  CIRCUITOS_GESTIONAR: { codigo: 'circuitos.gestionar', modulo: 'autorizaciones', descripcion: 'Configurar circuitos de autorización' },
  REINCORPORACIONES_REGISTRAR: { codigo: 'reincorporaciones.registrar', modulo: 'licencias', descripcion: 'Registrar reincorporaciones' },
  REEMPLAZOS_VER: { codigo: 'reemplazos.ver', modulo: 'reemplazos', descripcion: 'Consultar reemplazos' },
  REEMPLAZOS_GESTIONAR: { codigo: 'reemplazos.gestionar', modulo: 'reemplazos', descripcion: 'Registrar y autorizar reemplazos' },
  ASISTENCIA_REGISTRAR: { codigo: 'asistencia.registrar', modulo: 'asistencias', descripcion: 'Registrar asistencia y novedades' },
  ASISTENCIA_VER: { codigo: 'asistencia.ver', modulo: 'asistencias', descripcion: 'Consultar asistencia' },
  REPORTES_VER: { codigo: 'reportes.ver', modulo: 'reportes', descripcion: 'Consultar y exportar informes' },
  AUDITORIA_VER: { codigo: 'auditoria.ver', modulo: 'auditoria', descripcion: 'Consultar la auditoría' },
  DATOS_SENSIBLES_VER: { codigo: 'datos_sensibles.ver', modulo: 'docentes', descripcion: 'Acceder a documentación médica y datos sensibles de terceros' },
} as const;

export type CodigoPermiso = (typeof PERMISOS)[keyof typeof PERMISOS]['codigo'];
export const P = Object.fromEntries(Object.entries(PERMISOS).map(([k, v]) => [k, v.codigo])) as {
  [K in keyof typeof PERMISOS]: (typeof PERMISOS)[K]['codigo'];
};
