-- Adecuación normativa Ley 647-E, fases 3 y 4: circuito con dictamen y elevación, instrumentos legales,
-- disposiciones numeradas, asistencia con aviso y excepciones a las reglas.

-- CreateEnum
CREATE TYPE "CanalIngreso" AS ENUM ('SISTEMA', 'MAIL', 'CUADERNO', 'WHATSAPP', 'ORAL');

-- CreateEnum
CREATE TYPE "TipoInstrumento" AS ENUM ('DISPOSICION', 'RESOLUCION', 'DICTAMEN');

-- CreateEnum
CREATE TYPE "AvisoAusencia" AS ENUM ('CON_AVISO', 'SIN_AVISO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoSolicitud" ADD VALUE 'PENDIENTE_DICTAMEN';
ALTER TYPE "EstadoSolicitud" ADD VALUE 'ELEVADA';
ALTER TYPE "EstadoSolicitud" ADD VALUE 'INTERRUMPIDA';
ALTER TYPE "EstadoSolicitud" ADD VALUE 'CANCELADA_CESE';
ALTER TYPE "EstadoSolicitud" ADD VALUE 'REENCUADRADA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNotificacion" ADD VALUE 'DICTAMEN_VENCIDO';
ALTER TYPE "TipoNotificacion" ADD VALUE 'ALERTA_BAJA';
ALTER TYPE "TipoNotificacion" ADD VALUE 'ABANDONO_SERVICIO';
ALTER TYPE "TipoNotificacion" ADD VALUE 'ESTADISTICA_MENSUAL';
ALTER TYPE "TipoNotificacion" ADD VALUE 'LICENCIA_CANCELADA';
ALTER TYPE "TipoNotificacion" ADD VALUE 'SOLICITUD_ELEVADA';

-- AlterTable
ALTER TABLE "tipos_licencias" ADD COLUMN     "motivo_id" TEXT;

-- AlterTable
ALTER TABLE "solicitudes_licencias" ADD COLUMN     "ampliaciones" TEXT[],
ADD COLUMN     "aviso_en" TIMESTAMP(3),
ADD COLUMN     "canal_ingreso" "CanalIngreso" NOT NULL DEFAULT 'SISTEMA',
ADD COLUMN     "dictamen_vencido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "excepcion_en" TIMESTAMP(3),
ADD COLUMN     "excepcion_instrumento" TEXT,
ADD COLUMN     "excepcion_motivo" TEXT,
ADD COLUMN     "excepcion_por_id" TEXT,
ADD COLUMN     "fecha_evento" DATE,
ADD COLUMN     "motivo_id" TEXT,
ADD COLUMN     "origen" "OrigenLicencia" NOT NULL DEFAULT 'SOLICITUD',
ADD COLUMN     "pct_haberes" INTEGER,
ADD COLUMN     "reservada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "solicitud_padre_id" TEXT,
ADD COLUMN     "tramos_haberes" JSONB;

-- AlterTable
ALTER TABLE "asistencias" ADD COLUMN     "aviso" "AvisoAusencia",
ADD COLUMN     "aviso_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "instrumentos_legales" (
    "id" TEXT NOT NULL,
    "institucion_id" TEXT NOT NULL,
    "solicitud_id" TEXT,
    "tipo" "TipoInstrumento" NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "emisor" TEXT NOT NULL,
    "favorable" BOOLEAN,
    "archivo_id" TEXT,
    "observaciones" TEXT,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrumentos_legales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_documentos" (
    "institucion_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secuencias_documentos_pkey" PRIMARY KEY ("institucion_id","tipo","anio")
);

-- CreateIndex
CREATE UNIQUE INDEX "instrumentos_legales_archivo_id_key" ON "instrumentos_legales"("archivo_id");

-- CreateIndex
CREATE INDEX "instrumentos_legales_solicitud_id_idx" ON "instrumentos_legales"("solicitud_id");

-- CreateIndex
CREATE INDEX "instrumentos_legales_institucion_id_tipo_fecha_idx" ON "instrumentos_legales"("institucion_id", "tipo", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_licencias_motivo_id_key" ON "tipos_licencias"("motivo_id");

-- AddForeignKey
ALTER TABLE "tipos_licencias" ADD CONSTRAINT "tipos_licencias_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "motivos_licencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_licencias" ADD CONSTRAINT "solicitudes_licencias_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "motivos_licencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_licencias" ADD CONSTRAINT "solicitudes_licencias_solicitud_padre_id_fkey" FOREIGN KEY ("solicitud_padre_id") REFERENCES "solicitudes_licencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrumentos_legales" ADD CONSTRAINT "instrumentos_legales_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrumentos_legales" ADD CONSTRAINT "instrumentos_legales_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_licencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrumentos_legales" ADD CONSTRAINT "instrumentos_legales_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secuencias_documentos" ADD CONSTRAINT "secuencias_documentos_institucion_id_fkey" FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permiso para saltar validaciones excepcionables (topes y requisitos) con motivo e instrumento legal.
INSERT INTO "permisos" ("id", "codigo", "modulo", "descripcion")
VALUES (gen_random_uuid()::text, 'licencias.excepcion', 'licencias', 'Autorizar excepciones a topes y requisitos del nomenclador, con motivo e instrumento legal')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permisos" p
WHERE r."codigo" = 'ADMIN' AND p."codigo" = 'licencias.excepcion'
ON CONFLICT DO NOTHING;
