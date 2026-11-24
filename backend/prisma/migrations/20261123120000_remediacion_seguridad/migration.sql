-- Remediación de seguridad (spec de remediación, fases 1 a 5).
-- Incluye cambios de esquema y migraciones de datos. Probar sobre una copia de la base antes de producción.

-- ─────────────── Esquema ───────────────

-- Hallazgo 18: aviso de bloqueo de cuenta.
ALTER TYPE "TipoNotificacion" ADD VALUE 'CUENTA_BLOQUEADA';

-- Hallazgo 22: código corto de institución para la numeración por institución.
ALTER TABLE "instituciones" ADD COLUMN "codigo" TEXT;
UPDATE "instituciones"
SET "codigo" = UPPER(LEFT(REGEXP_REPLACE(COALESCE("cue", "id"), '[^A-Za-z0-9]', '', 'g'), 12));
ALTER TABLE "instituciones" ALTER COLUMN "codigo" SET NOT NULL;
CREATE UNIQUE INDEX "instituciones_codigo_key" ON "instituciones"("codigo");

-- Hallazgos 5, 17 y 18: cambio obligatorio de contraseña, revocación de access tokens y backoff de bloqueo.
ALTER TABLE "usuarios"
  ADD COLUMN "debe_cambiar_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nivel_bloqueo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Hallazgos 1, 3 y 11: clasificación declarativa de tipos sensibles.
ALTER TABLE "tipos_licencias" ADD COLUMN "sensible" BOOLEAN NOT NULL DEFAULT false;

-- Hallazgos 13 a 16: control de concurrencia optimista.
ALTER TABLE "solicitudes_licencias" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "reemplazos" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Hallazgo 22: numeración única por institución con secuencia propia.
DROP INDEX "solicitudes_licencias_numero_key";
CREATE UNIQUE INDEX "solicitudes_licencias_institucion_id_numero_key" ON "solicitudes_licencias"("institucion_id", "numero");

CREATE TABLE "secuencias_solicitudes" (
    "institucion_id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "secuencias_solicitudes_pkey" PRIMARY KEY ("institucion_id","anio")
);
ALTER TABLE "secuencias_solicitudes" ADD CONSTRAINT "secuencias_solicitudes_institucion_id_fkey"
  FOREIGN KEY ("institucion_id") REFERENCES "instituciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Datos ───────────────

-- Hallazgo 11: son sensibles SALUD, MATERNIDAD y todo tipo que exija certificado médico (incluido ATN-FAM).
UPDATE "tipos_licencias"
SET "sensible" = true
WHERE "categoria" IN ('SALUD', 'MATERNIDAD')
   OR EXISTS (SELECT 1 FROM UNNEST("documentacion_requerida") AS doc WHERE doc ILIKE '%certificado m_dico%');

-- Hallazgo 11: los archivos ya subidos en solicitudes de tipos sensibles pasan a ser confidenciales.
UPDATE "archivos" a
SET "confidencial" = true
FROM "documentos_licencias" dl
JOIN "solicitudes_licencias" s ON s."id" = dl."solicitud_id"
JOIN "tipos_licencias" t ON t."id" = s."tipo_licencia_id"
WHERE dl."archivo_id" = a."id" AND t."sensible" = true AND a."confidencial" = false;

-- Hallazgo 2: sanear la auditoría histórica de solicitudes (motivo y observaciones).
UPDATE "auditoria"
SET "valores_nuevos" = "valores_nuevos"
      || CASE WHEN "valores_nuevos" ? 'motivo' THEN '{"motivo":"[modificado]"}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN "valores_nuevos" ? 'observaciones' THEN '{"observaciones":"[modificado]"}'::jsonb ELSE '{}'::jsonb END
WHERE "entidad" = 'solicitud' AND jsonb_typeof("valores_nuevos") = 'object'
  AND ("valores_nuevos" ? 'motivo' OR "valores_nuevos" ? 'observaciones');

UPDATE "auditoria"
SET "valores_anteriores" = "valores_anteriores"
      || CASE WHEN "valores_anteriores" ? 'motivo' THEN '{"motivo":"[modificado]"}'::jsonb ELSE '{}'::jsonb END
      || CASE WHEN "valores_anteriores" ? 'observaciones' THEN '{"observaciones":"[modificado]"}'::jsonb ELSE '{}'::jsonb END
WHERE "entidad" = 'solicitud' AND jsonb_typeof("valores_anteriores") = 'object'
  AND ("valores_anteriores" ? 'motivo' OR "valores_anteriores" ? 'observaciones');

-- Hallazgo 22: inicializar la secuencia con la numeración existente (formato anterior LIC-AAAA-NNNNNN).
INSERT INTO "secuencias_solicitudes" ("institucion_id", "anio", "ultimo")
SELECT "institucion_id",
       CAST(SPLIT_PART("numero", '-', 2) AS INTEGER),
       MAX(CAST(SPLIT_PART("numero", '-', 3) AS INTEGER))
FROM "solicitudes_licencias"
WHERE "numero" ~ '^LIC-[0-9]{4}-[0-9]+$'
GROUP BY "institucion_id", SPLIT_PART("numero", '-', 2);

-- Hallazgo 4: permiso separado para gestionar roles, asignado solo a los roles ADMIN.
INSERT INTO "permisos" ("id", "codigo", "modulo", "descripcion")
VALUES (gen_random_uuid()::text, 'roles.gestionar', 'usuarios', 'Crear y modificar roles y su matriz de permisos')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permisos" p
WHERE r."codigo" = 'ADMIN' AND p."codigo" = 'roles.gestionar'
ON CONFLICT DO NOTHING;

-- Hallazgo 17: invalidar todos los access tokens emitidos antes de esta versión.
UPDATE "usuarios" SET "token_version" = 1;
