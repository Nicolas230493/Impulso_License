-- Adecuación normativa Ley 647-E, fases 1 y 2: nomenclador, reglas versionadas, calendario y saldos.

-- CreateEnum
CREATE TYPE "AutoridadLicencia" AS ENUM ('DIRECTOR', 'SUPERVISOR', 'SUPERIOR_INMEDIATO', 'DIRECTOR_REGIONAL', 'SUBSECRETARIO', 'MINISTRO', 'BIENESTAR', 'JUNTA');

-- CreateEnum
CREATE TYPE "PlanillaIL" AS ENUM ('IL1', 'IL2', 'NINGUNA');

-- CreateEnum
CREATE TYPE "OrigenLicencia" AS ENUM ('SOLICITUD', 'AUTOMATICA', 'NOVEDAD_RRHH');

-- CreateEnum
CREATE TYPE "AlcanceCalendario" AS ENUM ('NACIONAL', 'PROVINCIAL', 'INSTITUCION');

-- CreateEnum
CREATE TYPE "TipoDiaNoLaborable" AS ENUM ('FERIADO', 'RECESO', 'ASUETO');

-- AlterEnum
ALTER TYPE "SituacionRevista" ADD VALUE 'TRANSITORIO';

-- AlterTable
ALTER TABLE "docentes" ADD COLUMN     "fecha_ingreso_sistema" DATE;

-- AlterTable
ALTER TABLE "designaciones" ADD COLUMN     "motivo_cese" TEXT,
ADD COLUMN     "sin_termino" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "feriados" ADD COLUMN     "alcance" "AlcanceCalendario" NOT NULL DEFAULT 'INSTITUCION',
ADD COLUMN     "fecha_hasta" DATE,
ADD COLUMN     "tipo" "TipoDiaNoLaborable" NOT NULL DEFAULT 'FERIADO';

-- AlterTable
ALTER TABLE "solicitudes_designaciones" ADD COLUMN     "revista" "SituacionRevista",
ADD COLUMN     "variante_id" TEXT;

-- CreateTable
CREATE TABLE "motivos_licencia" (
    "id" TEXT NOT NULL,
    "regimen_id" TEXT NOT NULL,
    "agrupacion" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "planilla_il" "PlanillaIL" NOT NULL DEFAULT 'NINGUNA',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivos_licencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variantes_licencia" (
    "id" TEXT NOT NULL,
    "motivo_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "denominacion" TEXT,
    "encuadre_legal" TEXT,
    "revistas" "SituacionRevista"[],
    "pct_haberes" INTEGER,
    "forma_pago_texto" TEXT,
    "autoridad" "AutoridadLicencia",
    "otorga_texto" TEXT,
    "observaciones" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "variantes_licencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglas_variantes" (
    "id" TEXT NOT NULL,
    "variante_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "definicion" JSONB NOT NULL,
    "nota" TEXT,
    "creada_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglas_variantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldos_licencia" (
    "id" TEXT NOT NULL,
    "docente_id" TEXT NOT NULL,
    "motivo_id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "usados" INTEGER NOT NULL DEFAULT 0,
    "tope" INTEGER,
    "tramo_haberes" INTEGER,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saldos_licencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "motivos_licencia_regimen_id_codigo_key" ON "motivos_licencia"("regimen_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "variantes_licencia_motivo_id_codigo_key" ON "variantes_licencia"("motivo_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "reglas_variantes_variante_id_version_key" ON "reglas_variantes"("variante_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "saldos_licencia_docente_id_motivo_id_periodo_key" ON "saldos_licencia"("docente_id", "motivo_id", "periodo");

-- AddForeignKey
ALTER TABLE "solicitudes_designaciones" ADD CONSTRAINT "solicitudes_designaciones_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variantes_licencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motivos_licencia" ADD CONSTRAINT "motivos_licencia_regimen_id_fkey" FOREIGN KEY ("regimen_id") REFERENCES "regimenes_licencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variantes_licencia" ADD CONSTRAINT "variantes_licencia_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "motivos_licencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_variantes" ADD CONSTRAINT "reglas_variantes_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variantes_licencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_licencia" ADD CONSTRAINT "saldos_licencia_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "docentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_licencia" ADD CONSTRAINT "saldos_licencia_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "motivos_licencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permiso para importar el nomenclador y administrar sus reglas: se asigna a los roles que ya gestionan el catálogo.
INSERT INTO "permisos" ("id", "codigo", "modulo", "descripcion")
VALUES (gen_random_uuid()::text, 'nomenclador.gestionar', 'licencias', 'Importar el nomenclador oficial y administrar las reglas de cada variante')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT rp."rol_id", p."id"
FROM "rol_permisos" rp
JOIN "permisos" pc ON pc."id" = rp."permiso_id" AND pc."codigo" = 'catalogo.gestionar'
CROSS JOIN "permisos" p
WHERE p."codigo" = 'nomenclador.gestionar'
ON CONFLICT DO NOTHING;
