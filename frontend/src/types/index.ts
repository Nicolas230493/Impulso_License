export type EstadoSolicitud =
  | 'BORRADOR' | 'PENDIENTE' | 'EN_REVISION' | 'OBSERVADA' | 'PENDIENTE_DICTAMEN' | 'ELEVADA' | 'AUTORIZADA' | 'RECHAZADA' | 'FINALIZADA' | 'ANULADA'
  | 'INTERRUMPIDA' | 'CANCELADA_CESE' | 'REENCUADRADA';
export type EstadoLaboral = 'ACTIVO' | 'INACTIVO' | 'BAJA' | 'JUBILADO';
export type Turno = 'MANANA' | 'TARDE' | 'VESPERTINO' | 'NOCHE';
export type SituacionRevista = 'TITULAR' | 'INTERINO' | 'TRANSITORIO' | 'SUPLENTE' | 'PROVISIONAL';
export type CanalIngreso = 'SISTEMA' | 'MAIL' | 'CUADERNO' | 'WHATSAPP' | 'ORAL';
export type CategoriaLicencia = 'SALUD' | 'FAMILIAR' | 'ESTUDIO' | 'GREMIAL' | 'ADMINISTRATIVA' | 'MATERNIDAD' | 'OTRA';
export type EstadoReemplazo = 'PROPUESTO' | 'ACTIVO' | 'FINALIZADO' | 'ANULADO';
export type EstadoAsistencia = 'PRESENTE' | 'AUSENTE' | 'TARDANZA' | 'LICENCIA';

export interface Paginado<T> { items: T[]; total: number; pagina: number; porPagina: number }

export interface Perfil {
  id: string; email: string; nombre: string; apellido: string; docenteId: string | null;
  /** El servidor exige cambiar la contraseña (usuarios nuevos, sembrados o con clave reseteada). */
  debeCambiarPassword?: boolean;
  /** Verificación en dos pasos (TOTP). */
  totpActivo?: boolean;
  /** Su rol la exige y todavía no la configuró: solo puede usar Mi perfil hasta hacerlo. */
  debeConfigurar2fa?: boolean;
  segundoFactorObligatorio?: boolean;
  institucion: { id: string; nombre: string; tipoGestion: 'PUBLICA' | 'PRIVADA' };
  roles: { codigo: string; nombre: string }[];
  permisos: string[];
}

export interface Cargo { id: string; codigo: string; nombre: string; tipo: 'CARGO' | 'HORAS_CATEDRA'; activo: boolean }
export interface Curso { id: string; nombre: string; anio: number; division: string; turno: Turno; cicloLectivo: number }
export interface Espacio { id: string; codigo: string; nombre: string; activo: boolean }
export interface Horario { id: string; diaSemana: number; horaDesde: string; horaHasta: string }

export interface Designacion {
  id: string; docenteId: string; cargoId: string; cursoId: string | null; espacioCurricularId: string | null;
  turno: Turno; situacionRevista: SituacionRevista; horasCatedra: number | null;
  fechaDesde: string; fechaHasta: string | null; resolucion: string | null; activa: boolean;
  cargo: Cargo; curso: Curso | null; espacio: Espacio | null; horarios: Horario[];
  docente?: { id: string; apellido: string; nombre: string; legajo: string };
}

export interface Docente {
  id: string; legajo: string; dni: string; cuil: string; apellido: string; nombre: string;
  fechaNacimiento: string | null; email: string | null; telefono: string | null; fechaIngreso: string;
  estadoLaboral: EstadoLaboral; observaciones: string | null;
  designacionesActivas?: number; enLicencia?: boolean;
}

export interface DocenteDetalle extends Docente {
  domicilio: { calle: string; numero: string | null; piso: string | null; localidad: string; provincia: string; codigoPostal: string | null } | null;
  contactos: { id: string; tipo: string; valor: string; referencia: string | null; principal: boolean }[];
  documentos: { id: string; tipo: string; descripcion: string | null; createdAt: string; archivo: ArchivoInfo }[];
  designaciones: Designacion[];
  usuario: { id: string; email: string; activo: boolean } | null;
}

export interface ArchivoInfo { id: string; nombreOriginal: string; mimeType: string; tamanio: number; confidencial: boolean }

export interface Regla { id?: string; tipo: 'MAX_DIAS_POR_SOLICITUD' | 'MAX_DIAS_POR_ANIO' | 'MAX_SOLICITUDES_POR_ANIO' | 'MIN_ANTIGUEDAD_MESES' | 'ANTICIPACION_MIN_DIAS'; valor: number; descripcion?: string | null }

export interface Regimen {
  id: string; codigo: string; nombre: string; tipoGestion: 'PUBLICA' | 'PRIVADA'; normativa: string | null; descripcion: string | null;
  vigenteDesde: string; vigenteHasta: string | null; activo: boolean; _count?: { tipos: number };
}

export interface TipoLicencia {
  id: string; regimenId: string; circuitoId: string | null; codigo: string; nombre: string; categoria: CategoriaLicencia;
  articulo: string | null; descripcion: string | null; documentacionRequerida: string[];
  formaComputo: 'DIAS_CORRIDOS' | 'DIAS_HABILES'; conGoceHaberes: boolean; autoridadCompetente: string | null;
  /** Datos de salud (nombre, motivo y archivos reservados). `reservado`: llegó enmascarado para este usuario. */
  sensible?: boolean; reservado?: boolean;
  vigenteDesde: string; vigenteHasta: string | null; activo: boolean;
  regimen: { id: string; codigo: string; nombre: string; tipoGestion?: string }; reglas: Regla[];
  circuito: { id: string; nombre: string } | null;
}

export interface SolicitudResumen {
  id: string; numero: string; docenteId: string; tipoLicenciaId: string; fechaSolicitud: string;
  fechaDesde: string; fechaHasta: string; diasComputados: number; motivo: string | null; estado: EstadoSolicitud; pasoActual: number; version: number;
  docente: { id: string; legajo: string; apellido: string; nombre: string };
  /** `reservado`: el tipo es sensible y el usuario no puede verlo (llega con una etiqueta genérica). */
  tipoLicencia: { id: string; codigo?: string; nombre: string; categoria: CategoriaLicencia; reservado?: boolean };
}

export interface Paso { id: string; orden: number; nombre: string; rolId: string; rol: { id: string; codigo: string; nombre: string } }
export interface Circuito { id: string; nombre: string; descripcion: string | null; predeterminado: boolean; activo: boolean; pasos: Paso[]; _count?: { tipos: number } }

export interface SolicitudDetalle extends SolicitudResumen {
  solicitanteId: string;
  docente: SolicitudResumen['docente'] & { dni: string; fechaIngreso: string };
  tipoLicencia: TipoLicencia;
  designaciones: Designacion[];
  documentos: { id: string; tipoDocumento: string; verificado: boolean; verificadoEn: string | null; createdAt: string; archivo: ArchivoInfo }[];
  autorizaciones: { id: string; paso: number; pasoNombre: string; usuarioId: string; decision: 'APROBADA' | 'OBSERVADA' | 'RECHAZADA'; observacion: string | null; fecha: string }[];
  historial: { id: string; estadoAnterior: EstadoSolicitud | null; estadoNuevo: EstadoSolicitud; usuarioId: string; comentario: string | null; fecha: string }[];
  reincorporacion: { fechaEfectiva: string; observaciones: string | null } | null;
  reemplazos: { id: string; estado: EstadoReemplazo; fechaDesde: string; fechaHasta: string; suplentes: { suplente: { apellido: string; nombre: string } }[] }[];
  circuito: Circuito | null;
  usuarios: Record<string, string>;
  acciones: Record<
    | 'editar' | 'presentar' | 'adjuntar' | 'tomar' | 'decidir' | 'verificarDocumentos' | 'anular' | 'reincorporar'
    | 'cargarDictamen' | 'cargarResolucion' | 'excepcion' | 'partir' | 'interrumpir' | 'reencuadrar' | 'disposicion', boolean>;
  // Nomenclador (Ley 647-E)
  motivoId: string | null;
  motivoNomenclador: { id: string; codigo: string; nombre: string; agrupacion: number; planillaIL: string } | null;
  variantes: { designacionId: string; revista: SituacionRevista | null; id: string; codigo: string; encuadreLegal: string | null; denominacion: string | null; pctHaberes: number | null }[];
  instrumentos: { id: string; tipo: 'DISPOSICION' | 'RESOLUCION' | 'DICTAMEN'; numero: string; fecha: string; emisor: string; favorable: boolean | null; archivoId: string | null; observaciones: string | null }[];
  evaluacion: Evaluacion | null;
  canalIngreso: CanalIngreso; avisoEn: string | null; fechaEvento: string | null; ampliaciones: string[];
  pctHaberes: number | null; tramosHaberes: { dias: number; pct: number }[] | null; origen: 'SOLICITUD' | 'AUTOMATICA' | 'NOVEDAD_RRHH';
  reservada: boolean; dictamenVencido: boolean; excepcionMotivo: string | null; excepcionInstrumento: string | null;
  padre: { id: string; numero: string; estado: EstadoSolicitud } | null;
  derivadas: { id: string; numero: string; estado: EstadoSolicitud; fechaDesde: string; fechaHasta: string }[];
}

// ───────── Nomenclador ─────────
export interface ResumenRegla {
  unidad: 'CORRIDOS' | 'HABILES' | 'LABORABLES' | 'MINUTOS_JORNADA' | 'SIN_TOPE';
  periodoTope: string;
  tope: number | { escalones: { antigMin?: string; ambito?: string; dias: number }[] } | null;
  topeTexto: string | null;
  alcanceCargos: 'TODOS' | 'SELECCION';
  fechaEvento: { etiqueta: string; requerida: boolean; dentroDelPeriodo: boolean } | null;
  ampliaciones: { clave: string; condicion: string; dias: number }[];
  documentacion: { nombre: string; plazoHoras: number | null }[];
  dictamenRM: boolean; autoridad: string | null; sensible: boolean; reservada: boolean; origen: 'SOLICITUD' | 'AUTOMATICA' | 'NOVEDAD_RRHH';
  informativos: string[]; nota: string | null; diferencia: string | null;
}
export interface VarianteNomenclador {
  id: string; codigo: string; numero: number; denominacion: string | null; encuadreLegal: string | null; revistas: SituacionRevista[];
  pctHaberes: number | null; formaPagoTexto: string | null; autoridad: string | null; otorgaTexto: string | null; observaciones: string | null; activa: boolean;
  reglaVigente: { id: string; version: number; vigenciaDesde: string; resumen: ResumenRegla | null } | null;
}
export interface MotivoNomenclador { id: string; codigo: string; nombre: string; agrupacion: number; planillaIL: string; activo: boolean; variantes: VarianteNomenclador[] }
export interface Nomenclador { regimen: { id: string; codigo: string; nombre: string } | null; motivos: MotivoNomenclador[] }
export interface Hallazgo { codigo: string; nivel: 'BLOQUEANTE' | 'EXCEPCIONABLE' | 'ADVERTENCIA'; mensaje: string }
export interface Evaluacion {
  motivo: { id: string; codigo: string; nombre: string };
  regla: { unidad: string; periodoTope: string; alcanceCargos: string; autoridad: string | null; dictamenRM: boolean; sensible: boolean; reservada: boolean };
  diasPedidos: number; admisible: boolean; requiereExcepcion: boolean;
  bloqueantes: string[]; excepcionables: string[]; advertencias: string[];
  porDesignacion: {
    designacionId: string; revista: SituacionRevista; varianteCodigo: string; encuadreLegal: string | null; diasPedidos: number;
    tope: number | null; disponibles: number | null; excedente: number; tramos: { dias: number; pct: number }[];
    propuestaParticion: { dentroDelTope: number; excedente: number; como: string } | null; hallazgos: Hallazgo[];
  }[];
}

export interface Reemplazo {
  id: string; solicitudId: string | null; titularId: string; designacionId: string; fechaDesde: string; fechaHasta: string;
  instrumentoLegal: string | null; estado: EstadoReemplazo; observaciones: string | null; version: number;
  titular: { id: string; apellido: string; nombre: string; legajo: string };
  designacion: Designacion;
  solicitud: { id: string; numero: string; estado: EstadoSolicitud } | null;
  suplentes: { id: string; fechaDesde: string; fechaHasta: string; suplente: { id: string; apellido: string; nombre: string; legajo: string }; coberturas: { horario: Horario }[] }[];
}

export interface Notificacion { id: string; tipo: string; titulo: string; mensaje: string; entidad: string | null; entidadId: string | null; leida: boolean; createdAt: string }

export interface Rol { id: string; codigo: string; nombre: string; descripcion: string | null; sistema: boolean; permisos: string[]; usuarios: number }
export interface Permiso { id: string; codigo: string; modulo: string; descripcion: string }
export interface Usuario {
  id: string; email: string; nombre: string; apellido: string; activo: boolean; ultimoAcceso: string | null; docenteId: string | null;
  docente: { id: string; legajo: string; apellido: string; nombre: string } | null;
  roles: { id: string; codigo: string; nombre: string }[];
}
