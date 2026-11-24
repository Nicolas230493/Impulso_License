-- Auditoría a prueba de modificaciones: nadie puede editar, borrar ni vaciar registros, ni desde la base.
-- El usuario de la aplicación no es dueño de la tabla, así que tampoco puede desactivar estos triggers
-- (ver docker/postgres/01-usuario-app.sh). Solo el dueño del esquema, con un procedimiento documentado, podría.
CREATE OR REPLACE FUNCTION auditoria_inalterable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría no se puede modificar ni borrar (operación %)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER auditoria_sin_update_delete
  BEFORE UPDATE OR DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_inalterable();

CREATE TRIGGER auditoria_sin_truncate
  BEFORE TRUNCATE ON "auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_inalterable();

-- Además del trigger: ningún rol distinto del dueño conserva permisos para modificar la auditoría ni el historial de
-- migraciones (los privilegios por defecto del script de roles se los habrían dado al usuario de la aplicación).
DO $$
DECLARE g record;
BEGIN
  FOR g IN
    SELECT DISTINCT grantee, table_name FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee <> current_user AND grantee <> 'PUBLIC'
      AND ((table_name = 'auditoria' AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE'))
        OR (table_name = '_prisma_migrations'))
  LOOP
    IF g.table_name = 'auditoria' THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I FROM %I', g.table_name, g.grantee);
    ELSE
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', g.table_name, g.grantee);
    END IF;
  END LOOP;
END $$;
