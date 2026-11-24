-- Secretaría arma hoy a mano las planillas IL1, IL2 y la estadística mensual: necesita consultar y exportar
-- los informes para dejar de usarlas (spec de adecuación 647-E). Los informes respetan SensitiveDataPolicy.
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permisos" p
WHERE r."codigo" = 'SECRETARIA' AND p."codigo" = 'reportes.ver'
ON CONFLICT DO NOTHING;
