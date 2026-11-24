-- Segundo factor (TOTP) para cuentas con privilegios.
ALTER TABLE "usuarios" ADD COLUMN "totp_secreto" TEXT;
ALTER TABLE "usuarios" ADD COLUMN "totp_activo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "usuarios" ADD COLUMN "totp_ultimo_paso" INTEGER;
