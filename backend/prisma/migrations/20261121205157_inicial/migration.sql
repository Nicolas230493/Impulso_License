-- CreateEnum
CREATE TYPE "TipoGestion" AS ENUM ('PUBLICA', 'PRIVADA');

-- CreateEnum
CREATE TYPE "EstadoLaboral" AS ENUM ('ACTIVO', 'INACTIVO', 'BAJA', 'JUBILADO');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MANANA', 'TARDE', 'VESPERTINO', 'NOCHE');

-- CreateEnum
CREATE TYPE "SituacionRevista" AS ENUM ('TITULAR', 'INTERINO', 'SUPLENTE', 'PROVISIONAL');

-- CreateEnum
CREATE TYPE "TipoCargo" AS ENUM ('CARGO', 'HORAS_CATEDRA');

-- CreateEnum
CREATE TYPE "CategoriaLicencia" AS ENUM ('SALUD', 'FAMILIAR', 'ESTUDIO', 'GREMIAL', 'ADMINISTRATIVA', 'MATERNIDAD', 'OTRA');

-- CreateEnum
CREATE TYPE "FormaComputo" AS ENUM ('DIAS_CORRIDOS', 'DIAS_HABILES');

-- CreateEnum
CREATE TYPE "TipoRegla" AS ENUM ('MAX_DIAS_POR_SOLICITUD', 'MAX_DIAS_POR_ANIO', 'MAX_SOLICITUDES_POR_ANIO', 'MIN_ANTIGUEDAD_MESES', 'ANTICIPACION_MIN_DIAS');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('BORRADOR', 'PENDIENTE', 'EN_REVISION', 'OBSERVADA', 'AUTORIZADA', 'RECHAZADA', 'FINALIZADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "DecisionAutorizacion" AS ENUM ('APROBADA', 'OBSERVADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoReemplazo" AS ENUM ('PROPUESTO', 'ACTIVO', 'FINALIZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoAsistencia" AS ENUM ('PRESENTE', 'AUSENTE', 'TARDANZA', 'LICENCIA');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('NUEVA_SOLICITUD', 'SOLICITUD_OBSERVADA', 'SOLICITUD_AUTORIZADA', 'SOLICITUD_RECHAZADA', 'LICENCIA_POR_FINALIZAR', 'REINCORPORACION_PENDIENTE', 'REEMPLAZO_ASIGNADO', 'PASO_PENDIENTE');

-- CreateTable
CREATE TABLE "instituciones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cue" TEXT,
    "cuit" TEXT,
    "tipo_gestion" "TipoGestion" NOT NULL,
    "jurisdiccion" TEXT,
    "domicilio" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instituciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "docente_id" TEXT,
    "ultimo_acceso" TIMESTAMP(3),
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocada_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "sistema" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_roles" (
    "usuario_id" TEXT NOT NULL,
    "rol_id" TEXT NOT NULL,

    CONSTRAINT "usuario_roles_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "rol_permisos" (
    "rol_id" TEXT NOT NULL,
    "permiso_id" TEXT NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "docentes" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "legajo" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "cuil" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha_nacimiento" DATE,
    "email" TEXT,
    "telefono" TEXT,
    "fecha_ingreso" DATE NOT NULL,
    "estado_laboral" "EstadoLaboral" NOT NULL DEFAULT 'ACTIVO',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "referencia" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domicilios" (
    "id" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "numero" TEXT,
    "piso" TEXT,
    "localidad" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "codigo_postal" TEXT,
    "vigente" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "domicilios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_personales" (
    "id" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "archivo_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_personales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCargo" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cursos" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "division" TEXT NOT NULL,
    "turno" "Turno" NOT NULL,
    "ciclo_lectivo" INTEGER NOT NULL,

    CONSTRAINT "cursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espacios_curriculares" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "espacios_curriculares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designaciones" (
    "id" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "cargo_id" TEXT NOT NULL,
    "curso_id" TEXT,
    "espacio_curricular_id" TEXT,
    "turno" "Turno" NOT NULL,
    "situacion_revista" "SituacionRevista" NOT NULL,
    "horas_catedra" INTEGER,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE,
    "resolucion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "designaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios" (
    "id" TEXT NOT NULL,
    "designacion_id" TEXT NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_desde" TEXT NOT NULL,
    "hora_hasta" TEXT NOT NULL,

    CONSTRAINT "horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriados" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regimenes_licencias" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo_gestion" "TipoGestion" NOT NULL,
    "normativa" TEXT,
    "descripcion" TEXT,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "regimenes_licencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_licencias" (
    "id" TEXT NOT NULL,
    "regimen_id" TEXT NOT NULL,
    "circuito_id" TEXT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaLicencia" NOT NULL,
    "articulo" TEXT,
    "descripcion" TEXT,
    "documentacion_requerida" TEXT[],
    "forma_computo" "FormaComputo" NOT NULL,
    "con_goce_haberes" BOOLEAN NOT NULL DEFAULT true,
    "autoridad_competente" TEXT,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_licencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglas_licencias" (
    "id" TEXT NOT NULL,
    "tipo_licencia_id" TEXT NOT NULL,
    "tipo" "TipoRegla" NOT NULL,
    "valor" INTEGER NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "reglas_licencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_licencias" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "tipo_licencia_id" TEXT NOT NULL,
    "fecha_solicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE NOT NULL,
    "dias_computados" INTEGER NOT NULL,
    "motivo" TEXT,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'BORRADOR',
    "paso_actual" INTEGER NOT NULL DEFAULT 1,
    "solicitante_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_licencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_designaciones" (
    "solicitud_id" TEXT NOT NULL,
    "designacion_id" TEXT NOT NULL,

    CONSTRAINT "solicitudes_designaciones_pkey" PRIMARY KEY ("solicitud_id","designacion_id")
);

-- CreateTable
CREATE TABLE "documentos_licencias" (
    "id" TEXT NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "archivo_id" TEXT NOT NULL,
    "tipo_documento" TEXT NOT NULL,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "verificado_por_id" TEXT,
    "verificado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_licencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuitos_autorizacion" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "predeterminado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "circuitos_autorizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pasos_circuito" (
    "id" TEXT NOT NULL,
    "circuito_id" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol_id" TEXT NOT NULL,

    CONSTRAINT "pasos_circuito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autorizaciones" (
    "id" TEXT NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "paso" INTEGER NOT NULL,
    "paso_nombre" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "decision" "DecisionAutorizacion" NOT NULL,
    "observacion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autorizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estados" (
    "id" TEXT NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "estado_anterior" "EstadoSolicitud",
    "estado_nuevo" "EstadoSolicitud" NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "comentario" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_estados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reincorporaciones" (
    "id" TEXT NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "fecha_efectiva" DATE NOT NULL,
    "registrada_por_id" TEXT NOT NULL,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reincorporaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reemplazos" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "solicitud_id" TEXT,
    "titular_id" TEXT NOT NULL,
    "designacion_id" TEXT NOT NULL,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE NOT NULL,
    "autorizado_por_id" TEXT,
    "instrumento_legal" TEXT,
    "estado" "EstadoReemplazo" NOT NULL DEFAULT 'PROPUESTO',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reemplazos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reemplazo_docentes" (
    "id" TEXT NOT NULL,
    "reemplazo_id" TEXT NOT NULL,
    "suplente_id" TEXT NOT NULL,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE NOT NULL,

    CONSTRAINT "reemplazo_docentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coberturas" (
    "id" TEXT NOT NULL,
    "reemplazo_docente_id" TEXT NOT NULL,
    "horario_id" TEXT NOT NULL,

    CONSTRAINT "coberturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistencias" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "designacion_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "EstadoAsistencia" NOT NULL,
    "justificada" BOOLEAN NOT NULL DEFAULT false,
    "justificacion" TEXT,
    "registrada_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novedades" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "registrada_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novedades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "entidad" TEXT,
    "entidad_id" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "nombre_original" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanio" INTEGER NOT NULL,
    "ruta" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "confidencial" BOOLEAN NOT NULL DEFAULT false,
    "subido_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT,
    "usuario_id" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "valores_anteriores" JSONB,
    "valores_nuevos" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instituciones_cue_key" ON "instituciones"("cue");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_docente_id_key" ON "usuarios"("docente_id");

-- CreateIndex
CREATE INDEX "usuarios_institucion_id_idx" ON "usuarios"("institucion_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_idx" ON "sesiones"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_institucion_id_codigo_key" ON "roles"("institucion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "permisos"("codigo");

-- CreateIndex
CREATE INDEX "docentes_institucion_id_apellido_idx" ON "docentes"("institucion_id", "apellido");

-- CreateIndex
CREATE UNIQUE INDEX "docentes_institucion_id_legajo_key" ON "docentes"("institucion_id", "legajo");

-- CreateIndex
CREATE UNIQUE INDEX "docentes_institucion_id_dni_key" ON "docentes"("institucion_id", "dni");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_personales_archivo_id_key" ON "documentos_personales"("archivo_id");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_institucion_id_codigo_key" ON "cargos"("institucion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "cursos_institucion_id_ciclo_lectivo_anio_division_turno_key" ON "cursos"("institucion_id", "ciclo_lectivo", "anio", "division", "turno");

-- CreateIndex
CREATE UNIQUE INDEX "espacios_curriculares_institucion_id_codigo_key" ON "espacios_curriculares"("institucion_id", "codigo");

-- CreateIndex
CREATE INDEX "designaciones_docente_id_idx" ON "designaciones"("docente_id");

-- CreateIndex
CREATE UNIQUE INDEX "feriados_institucion_id_fecha_key" ON "feriados"("institucion_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "regimenes_licencias_institucion_id_codigo_key" ON "regimenes_licencias"("institucion_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_licencias_regimen_id_codigo_key" ON "tipos_licencias"("regimen_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "reglas_licencias_tipo_licencia_id_tipo_key" ON "reglas_licencias"("tipo_licencia_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_licencias_numero_key" ON "solicitudes_licencias"("numero");

-- CreateIndex
CREATE INDEX "solicitudes_licencias_institucion_id_estado_idx" ON "solicitudes_licencias"("institucion_id", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_licencias_docente_id_fecha_desde_fecha_hasta_idx" ON "solicitudes_licencias"("docente_id", "fecha_desde", "fecha_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_licencias_archivo_id_key" ON "documentos_licencias"("archivo_id");

-- CreateIndex
CREATE UNIQUE INDEX "pasos_circuito_circuito_id_orden_key" ON "pasos_circuito"("circuito_id", "orden");

-- CreateIndex
CREATE INDEX "autorizaciones_solicitud_id_idx" ON "autorizaciones"("solicitud_id");

-- CreateIndex
CREATE INDEX "historial_estados_solicitud_id_idx" ON "historial_estados"("solicitud_id");

-- CreateIndex
CREATE UNIQUE INDEX "reincorporaciones_solicitud_id_key" ON "reincorporaciones"("solicitud_id");

-- CreateIndex
CREATE INDEX "reemplazos_institucion_id_estado_idx" ON "reemplazos"("institucion_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "coberturas_reemplazo_docente_id_horario_id_key" ON "coberturas"("reemplazo_docente_id", "horario_id");

-- CreateIndex
CREATE INDEX "asistencias_institucion_id_fecha_idx" ON "asistencias"("institucion_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "asistencias_designacion_id_fecha_key" ON "asistencias"("designacion_id", "fecha");

-- CreateIndex
CREATE INDEX "novedades_institucion_id_fecha_idx" ON "novedades"("institucion_id", "fecha");

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_leida_idx" ON "notificaciones"("usuario_id", "leida");

-- CreateIndex
CREATE INDEX "auditoria_institucion_id_fecha_idx" ON "auditoria"("institucion_id", "fecha");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_roles" ADD CONSTRAINT "usuario_roles_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docentes" ADD CONSTRAINT "docentes_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domicilios" ADD CONSTRAINT "domicilios_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_personales" ADD CONSTRAINT "documentos_personales_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_personales" ADD CONSTRAINT "documentos_personales_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "espacios_curriculares" ADD CONSTRAINT "espacios_curriculares_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designaciones" ADD CONSTRAINT "designaciones_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designaciones" ADD CONSTRAINT "designaciones_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designaciones" ADD CONSTRAINT "designaciones_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designaciones" ADD CONSTRAINT "designaciones_espacio_curricular_id_fkey" FOREIGN KEY ("espacio_curricular_id") REFERENCES "espacios_curriculares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_designacion_id_fkey" FOREIGN KEY ("designacion_id") REFERENCES "designaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regimenes_licencias" ADD CONSTRAINT "regimenes_licencias_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_licencias" ADD CONSTRAINT "tipos_licencias_regimen_id_fkey" FOREIGN KEY ("regimen_id") REFERENCES "regimenes_licencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_licencias" ADD CONSTRAINT "tipos_licencias_circuito_id_fkey" FOREIGN KEY ("circuito_id") REFERENCES "circuitos_autorizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_licencias" ADD CONSTRAINT "reglas_licencias_tipo_licencia_id_fkey" FOREIGN KEY ("tipo_licencia_id") REFERENCES "tipos_licencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_licencias" ADD CONSTRAINT "solicitudes_licencias_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_licencias" ADD CONSTRAINT "solicitudes_licencias_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_licencias" ADD CONSTRAINT "solicitudes_licencias_tipo_licencia_id_fkey" FOREIGN KEY ("tipo_licencia_id") REFERENCES "tipos_licencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_designaciones" ADD CONSTRAINT "solicitudes_designaciones_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_licencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_designaciones" ADD CONSTRAINT "solicitudes_designaciones_designacion_id_fkey" FOREIGN KEY ("designacion_id") REFERENCES "designaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_licencias" ADD CONSTRAINT "documentos_licencias_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_licencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_licencias" ADD CONSTRAINT "documentos_licencias_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circuitos_autorizacion" ADD CONSTRAINT "circuitos_autorizacion_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasos_circuito" ADD CONSTRAINT "pasos_circuito_circuito_id_fkey" FOREIGN KEY ("circuito_id") REFERENCES "circuitos_autorizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasos_circuito" ADD CONSTRAINT "pasos_circuito_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_licencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estados" ADD CONSTRAINT "historial_estados_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_licencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reincorporaciones" ADD CONSTRAINT "reincorporaciones_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_licencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reemplazos" ADD CONSTRAINT "reemplazos_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reemplazos" ADD CONSTRAINT "reemplazos_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_licencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reemplazos" ADD CONSTRAINT "reemplazos_titular_id_fkey" FOREIGN KEY ("titular_id") REFERENCES "docentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reemplazos" ADD CONSTRAINT "reemplazos_designacion_id_fkey" FOREIGN KEY ("designacion_id") REFERENCES "designaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reemplazo_docentes" ADD CONSTRAINT "reemplazo_docentes_reemplazo_id_fkey" FOREIGN KEY ("reemplazo_id") REFERENCES "reemplazos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reemplazo_docentes" ADD CONSTRAINT "reemplazo_docentes_suplente_id_fkey" FOREIGN KEY ("suplente_id") REFERENCES "docentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_reemplazo_docente_id_fkey" FOREIGN KEY ("reemplazo_docente_id") REFERENCES "reemplazo_docentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_designacion_id_fkey" FOREIGN KEY ("designacion_id") REFERENCES "designaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedades" ADD CONSTRAINT "novedades_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedades" ADD CONSTRAINT "novedades_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
