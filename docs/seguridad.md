# Remediación de seguridad — estado y trazabilidad

Estado de la ejecución del spec "EduLicencias — Spec de remediación de seguridad" (23/11/2026).

**Verificado:** compilación de backend y frontend, 132 tests unitarios en verde (`npm test`, sin base de datos),
`npm audit --audit-level=high` en 0 para backend y frontend, y que el backend compilado no arranca con configuración
insegura.

**Pendiente de ejecutar:** la migración `20261123120000_remediacion_seguridad` y los E2E (`npm run test:e2e`) contra una
base PostgreSQL real. En el entorno donde se hizo el cambio no había Docker ni PostgreSQL. La migración incluye migraciones
de datos y hay que probarla antes sobre una copia de la base.

## Trazabilidad

U = test unitario (`backend/src/**/*.spec.ts`, en verde). E = E2E (`backend/test/seguridad.e2e.mjs`, escrito, sin ejecutar).

| # | Sev. | Cambio | Test principal |
|---|---|---|---|
| 1 | Alto | `SensitiveDataPolicy` + `@ExponeEntidad` + interceptor global; `GET /docentes/:id/licencias` con `select` explícito | U `sensitive-data.policy.spec`, U `arquitectura.spec`; E matriz por rol |
| 2 | Alto | Auditoría guarda `motivo`/`observaciones` como `[modificado]`; `GET /auditoria` redacta; migración sanea históricos | U policy (auditoría); E SUPERVISOR |
| 3 | Alto | Informes PDF/XLSX/JSON usan `nombreTipo()` de la política; se eliminó la implementación local | U `informes.spec` (lee el XLSX y el texto del PDF) |
| 4 | Alto | Sin cambios de roles propios; regla de techo; ADMIN solo por ADMIN; roles de sistema inmutables; `roles.gestionar` | U `usuarios.service.spec`; E autoasignación |
| 5 | Alto | Seed solo en development/test, contraseñas de `SEED_ADMIN_PASSWORD` o aleatorias, `debeCambiarPassword`; `npm run bootstrap:admin`; README sin contraseña | U `fase5.spec` (seed con `NODE_ENV=production` aborta), U `repositorio.spec` |
| 6 | Alto | Redis con `requirepass`; puertos solo en loopback (override de desarrollo); sin puertos en el compose base | U `repositorio.spec`; infra: `redis-cli` sin clave → `NOAUTH` (manual) |
| 7 | Medio | Overrides `uuid@11.1.1` (exceljs), `deepmerge-ts@8.0.2`, `effect@3.22.5` (Prisma); `@nestjs/cli@11.0.24`; `zod@4.6.7` (frontend); audit en CI | `npm audit --audit-level=high` = 0 |
| 8 | Medio | PostgreSQL con credenciales por entorno y usuario de aplicación sin superusuario | U `repositorio.spec`; infra manual |
| 9 | Medio | Cookie `Secure` forzada en producción; el arranque falla con `COOKIE_SECURE=false` | U `entorno.spec`; arranque real verificado |
| 10 | Medio | `JWT_ACCESS_SECRET` ≥ 32 caracteres, sin placeholders y con variedad mínima | U `entorno.spec`; arranque real verificado |
| 11 | Medio | `TipoLicencia.sensible`; confidencialidad derivada de ese campo; migración marca ATN-FAM y sus archivos | U policy; E ATN-FAM |
| 12 | Medio | `confidencial` fuera del DTO; documentos personales nacen confidenciales; `PATCH …/confidencial` con `datos_sensibles.ver`, auditado | E multipart rechazado |
| 13 | Medio | Titular, quien cargó y quien recibió no deciden ni reciben (autorizar/observar/rechazar) | U `flujo.spec`; E Secretaría |
| 14 | Medio | Verificación solo en PENDIENTE/EN_REVISION, nunca sobre solicitud propia, escritura condicionada | U `flujo.spec`; E BORRADOR → 409 |
| 15 | Medio | Reemplazos: lectura y escritura en `$transaction` con `updateMany({id, estado, version})` | U `flujo.spec` (concurrencia simulada); E `Promise.all` |
| 16 | Medio | Edición/adjunto/quitar condicionados a BORRADOR/OBSERVADA + versión; archivo a disco después del commit | U `flujo.spec`; E concurrencia |
| 17 | Medio | `Usuario.tokenVersion` + claim `tv`; se incrementa en logout global, cambio/reset de contraseña, cambio de roles y desactivación | U `auth.spec`; E token tras cambio de clave → 401 |
| 18 | Medio | Mensaje único; backoff 1/5/15 min con desbloqueo automático; notificación al bloquear | U `auth.spec`; E respuesta idéntica |
| 19 | Medio | Throttler en Redis; `trust proxy` desde `TRUSTED_PROXIES`; límite por IP y por cuenta | U `throttling.spec`, U `entorno.spec`; E `X-Forwarded-For` variable |
| 20 | Bajo | P2002 → "El registro ya existe"; detalle solo al log | U `fase5.spec`; E |
| 21 | Bajo | `circuitoDe` con `findFirst({ id, institucionId })` | U `flujo.spec` |
| 22 | Bajo | `LIC-<COD_INST>-AAAA-NNNNNN`, secuencia por institución (upsert atómico), `@@unique([institucionId, numero])` | U `flujo.spec`; E formato |
| 23 | Bajo | `usuariosConRol` filtra por institución | U `flujo.spec` |
| 24 | Bajo | Siempre `attachment` + `CSP: sandbox`; validación estructural de PDF/PNG/JPEG (rechaza JavaScript/acciones en PDF) | U `validacion-archivos.spec`, U `fase5.spec`; E |
| 25 | Bajo | `INFORMES` es un `Map`; clave desconocida → 404 | U `informes.spec` |
| 26 | Bajo | Test de contrato rutas del frontend ↔ guards del backend | U `arquitectura.spec` |
| 27 | Bajo | CSP estricta y Referrer-Policy en `vite preview` y `deploy/nginx/edulicencias.conf` | U `repositorio.spec` |
| 28 | Bajo | `.gitignore` con `.env*` y `!.env.example` | U `repositorio.spec` |
| 29 | Bajo | Sin `allowScripts`; CI con `npm ci --ignore-scripts` | U `repositorio.spec` |
| 30 | Bajo | Blobs siempre como descarga (`a.download`) | U `repositorio.spec` |
| 31 | Bajo | `CORS_ORIGINS` normalizado; `*` impide el arranque | U `entorno.spec` |
| 32 | Info | `@Throttle` en refresh/logout; purga diaria (BullMQ con Redis, cron sin Redis); IP desde la cadena de proxies confiables | U `auth.spec`, U `throttling.spec`; E refresh 429 |

## Decisiones tomadas al ejecutar el spec

- **Etiqueta genérica:** "Licencia con reserva" (la propuesta del spec). Además del nombre se reservan el código, la
  categoría, el artículo, la descripción, la documentación requerida y las reglas del tipo, y el nombre de los archivos
  confidenciales. Si un objeto no trae `sensible`, el tipo se trata como sensible (falla cerrada).
- **Motivo:** se oculta en toda solicitud, no solo en las sensibles, salvo al titular y a quien tiene `datos_sensibles.ver`
  (objetivo medible 1). Quien cargó la solicitud en nombre del docente tampoco lo ve después.
- **Separación de funciones (hallazgo 13):** sin excepción configurable (es una pregunta abierta del spec). En el circuito
  de ejemplo, si Secretaría recibe una solicitud no puede aprobar el paso 1: la debe recibir otra persona con
  `licencias.revisar` (p. ej. RR.HH.). También se bloquea que quien cargó una solicitud la reciba.
- **Adjuntar documentación:** solo en BORRADOR u OBSERVADA (antes también en PENDIENTE y EN_REVISION).
- **Regla de techo ampliada:** además de asignar roles, un actor no puede editar ni resetear la contraseña de un usuario
  con más permisos que él (si no, `usuarios.gestionar` alcanzaba para tomar la cuenta de un ADMIN).
- **`debeCambiarPassword`:** el frontend obliga a ir a "Mi perfil" y el backend responde 403 a toda ruta que no tenga
  `@PermiteCambioPendiente` (perfil, cambio de contraseña, segundo factor, cierre de sesión, contador de notificaciones).
- **Prisma (hallazgo 7):** en vez del salto a Prisma 7 se aplicaron `overrides` de las dependencias transitivas
  vulnerables (`deepmerge-ts`, `effect`). La actualización mayor sigue recomendada en una rama propia.
- **Versionado optimista:** `version` es opcional en la API (compatibilidad); el frontend la envía siempre.
- **Usuarios de base de datos:** dueño del esquema (migraciones) y aplicación (solo datos). El script de
  `docker/postgres` es idempotente y convierte bases existentes (ver README).

## Excepciones de `npm audit`

Ninguna con severidad alta. Quedan 3 moderadas en herramientas de desarrollo del backend (dependencias de `@nestjs/cli`).

## Pendiente fuera del código

- Ejecutar migración y E2E sobre una copia de la base (definición de terminado).
- Si alguna base se sembró fuera de desarrollo con la contraseña compartida anterior: rotar todas las contraseñas y revocar
  sesiones (`UPDATE usuarios SET token_version = token_version + 1, debe_cambiar_password = true;` + revocar `sesiones`).
- El proyecto no es un repositorio git: no hay historial que revisar por `.env` commiteados (hallazgo 28). Al crearlo,
  verificar que el `.env` local no se suba.
- MFA (TOTP) para ADMIN y SUPERVISOR: requisito para el próximo ciclo.
- Re-auditoría de los 33 hallazgos al cerrar las Fases 1 a 3.

## Segunda auditoría (24/11/2026)

Revisión completa del código más pruebas de ataque contra la API en ejecución (acceso a datos ajenos, tokens
falsificados, campos extra, inyección en búsquedas, archivos disfrazados, CSRF, CORS). Sin hallazgos críticos ni altos.
Cambios aplicados:

| Hallazgo | Sev. | Cambio | Verificación |
|---|---|---|---|
| Bomba zip en la importación del nomenclador | Medio | `verificarZip`: recorre el directorio central y descomprime cada entrada con tope igual al tamaño declarado (límites de entradas y total) | U `seguridad-extra.spec`; real: 200 MB comprimidos en 199 KB rechazados en 33 ms |
| Auditoría modificable desde la base | Medio | Trigger que impide UPDATE/DELETE/TRUNCATE; sin esos permisos para la aplicación | Real: la app recibe `permission denied`; el superusuario, el error del trigger |
| Usuario de la base con privilegios de más | Medio | Dueño del esquema (migraciones, `directUrl`) separado de la aplicación (solo DML, sin `CREATEDB`) | Real: `DROP`/`CREATE`/`ALTER … DISABLE TRIGGER` rechazados |
| Contraseñas de más de 72 bytes truncadas por bcrypt | Bajo | `@MaxBytes(72)` en todos los DTO, en seed y en bootstrap | Real: 400 |
| Archivos sin cifrar en disco | Bajo | AES-256-GCM con `CLAVE_CIFRADO` (obligatoria en producción), integridad por hash al descargar, `npm run cifrar:archivos` | U; real: en disco sin rastros del PDF y descarga idéntica |
| Sin antivirus | Bajo | ClamAV (INSTREAM), falla cerrada; `CLAMAV_HOST` obligatorio en producción | U con clamd simulado |
| Sin segundo factor | Bajo | TOTP (RFC 6238) con anti-reuso; obligatorio para ADMIN/SUPERVISOR en producción | U con vectores de la RFC; real: login en dos pasos |
| Margen de gracia de la rotación aceptaba otra IP | Info | Solo desde la misma IP y navegador que rotó | U `auth.spec` |
| Vulnerabilidades moderadas en `@nestjs/cli` | Info | Override `glob@14.0.6` | `npm audit` = 0; `nest build` verificado |

No se cambió: el bloqueo de cuenta por intentos (hallazgo 18) puede usarse para bloquear una cuenta ajena durante
1 a 15 minutos. Es el comportamiento que pide el spec; la duración corta y el aviso al titular lo mitigan.
