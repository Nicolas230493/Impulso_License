#!/bin/sh
# Roles de la base (hallazgo 8 y auditoría inalterable). Se separan dos usuarios sin superusuario:
#   - MIGRACION_DB_USER: dueño del esquema y de las tablas. Solo lo usa `prisma migrate` (DATABASE_URL_MIGRACIONES).
#   - APP_DB_USER: el de la aplicación (DATABASE_URL). Solo lee y escribe datos: no puede crear, alterar ni borrar
#     tablas, ni desactivar los triggers que impiden modificar la auditoría.
#
# Corre sola al inicializar el volumen. Es idempotente: para un volumen existente, ejecutarla a mano
# (convierte también una base donde la aplicación era dueña del esquema):
#   docker compose exec -T postgres sh /docker-entrypoint-initdb.d/01-usuario-app.sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" \
  -v owner_user="$MIGRACION_DB_USER" -v owner_password="$MIGRACION_DB_PASSWORD" -v db="$POSTGRES_DB" <<'SQL'
-- Dueño del esquema. CREATEDB solo hace falta para la base "sombra" de `prisma migrate dev` (desarrollo).
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEROLE CREATEDB NOREPLICATION', :'owner_user')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEROLE CREATEDB', :'owner_user', :'owner_password') \gexec

-- Aplicación: sin CREATEDB ni privilegios sobre el esquema.
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION', :'app_user')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEROLE NOCREATEDB', :'app_user', :'app_password') \gexec

REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"owner_user", :"app_user";

-- Todo lo que hoy es de la aplicación (bases convertidas) pasa al dueño del esquema.
REASSIGN OWNED BY :"app_user" TO :"owner_user";
ALTER SCHEMA public OWNER TO :"owner_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC, :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Solo datos: lectura y escritura en tablas y secuencias existentes y futuras (las que creen las migraciones).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";

-- La aplicación no toca el historial de migraciones ni modifica la auditoría (además del trigger).
SELECT format('REVOKE ALL ON TABLE %I FROM %I', '_prisma_migrations', :'app_user')
  WHERE to_regclass('public._prisma_migrations') IS NOT NULL \gexec
SELECT format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I FROM %I', 'auditoria', :'app_user')
  WHERE to_regclass('public.auditoria') IS NOT NULL \gexec
SQL
