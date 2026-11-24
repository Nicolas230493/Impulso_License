# EduLicencias — Spec de remediación de seguridad

Nov 23, 2026 · @Nicolás

## Contexto y alcance

Este spec cierra los 33 hallazgos de la auditoría de seguridad de EduLicencias en 5 fases. La prioridad es cortar primero las tres vías confirmadas de fuga de datos médicos. La auditoría fue de solo lectura y no modificó archivos; este documento define qué cambiar y cómo verificarlo.

**Punto de partida:** 6 hallazgos Altos, 13 Medios, 10 Bajos y 4 Informativos. No hay bypass de login ni SQL injection. Los controles positivos existentes (guards globales, permisos recalculados desde BD, bcrypt 12, refresh opaco con rotación, Prisma parametrizado, bloqueo optimista en `cambiarEstado`) se mantienen y se toman como patrón.

**Objetivos medibles**

1. Ningún endpoint, export ni registro de auditoría devuelve `motivo`, tipo exacto de licencia sensible ni archivos médicos a un usuario sin `DATOS_SENSIBLES_VER`.
2. Ningún usuario puede elevar sus propios privilegios ni modificar roles del sistema.
3. El sistema no arranca en producción con secretos débiles, credenciales del seed o servicios expuestos.
4. Toda transición de estado de solicitudes y reemplazos es atómica y respeta separación de funciones.
5. Cada hallazgo tiene al menos un test automatizado que fallaba antes del fix.

**Fuera de alcance:** migración de stack, rediseño de UI, MFA completo (queda especificado como requisito futuro en Fase 3), auditoría externa de penetración.

## Fase 1 — Política única de datos sensibles (hallazgos 1, 2, 3, 11, 12)

Se crea un único módulo `SensitiveDataPolicy` y todos los puntos de salida (API, auditoría, informes, archivos) pasan por él. Hoy el enmascarado existe (`ocultarSensibles`, `nombreTipo()`) pero se aplica a mano y se olvida en tres lugares; la causa raíz es la falta de un punto de control obligatorio.

### Diseño

- **Ubicación:** `backend/src/common/sensitive/sensitive-data.policy.ts`, exportado por un `SensitiveModule` global.
- **Clasificación declarativa:** un mapa por entidad con los campos sensibles. Mínimo: `SolicitudLicencia.motivo`, `SolicitudLicencia.observaciones`, `TipoLicencia.nombre` y `.codigo` cuando la categoría es sensible, `Archivo` con `confidencial = true`.
- **Categorías sensibles:** se agrega `TipoLicencia.sensible: boolean` (migración Prisma) en lugar de depender de la lista fija SALUD/MATERNIDAD. Se marca `true` en SALUD, MATERNIDAD y cualquier tipo que exija certificado médico (incluido ATN-FAM).
- **API única:** `redact(entidad, objeto, actor)` devuelve una copia con los campos sensibles reemplazados por `null` y el tipo por su etiqueta genérica ("Licencia con reserva"), salvo que el actor tenga `DATOS_SENSIBLES_VER` o sea el propio docente titular.
- **Interceptor global:** `SensitiveSerializationInterceptor` aplica `redact` a toda respuesta de controladores marcados con `@ExponeEntidad('solicitud')`. Un test de arquitectura falla si un controlador devuelve entidades de licencia sin ese decorador.

### Cambios por hallazgo

| # | Archivo | Cambio |
| --- | --- | --- |
| 1 | `docentes.service.ts:143-150` | `GET /docentes/:id/licencias` usa `select` explícito sin `motivo` y pasa por `redact`. Nunca devolver la fila completa. |
| 2 | `auditoria.service.ts:6`, `solicitudes.service.ts:193,228` | Al registrar, se guardan solo los campos no sensibles; para los sensibles se guarda `{campo: "[modificado]"}`. Los registros históricos se sanean con una migración de datos. `GET /auditoria` también pasa por `redact` como segunda barrera. |
| 3 | `reportes/informes.ts:63,139-143` | Reemplazar `s.tipoLicencia.nombre` por `policy.nombreTipo(tipo, actor)`. Aplica a PDF y XLSX. Se elimina el `nombreTipo()` local de `reportes.service.ts` para que haya una sola implementación. |
| 11 | `solicitudes.service.ts:345`, `archivos.service.ts:80-82` | La confidencialidad se deriva de `TipoLicencia.sensible`, no de la categoría. Migración que marca como confidenciales los archivos existentes de ATN-FAM. |
| 12 | `docentes.dto.ts:62`, `docentes.service.ts:125` | Quitar `confidencial` del DTO. El servidor lo decide: `true` por defecto para documentos personales; solo un usuario con `DATOS_SENSIBLES_VER` puede bajarlo, y queda auditado. |

### Criterios de aceptación

- [ ] Con un usuario SECRETARIA, DIRECTIVO o SUPERVISOR, `GET /docentes/:id/licencias` no contiene `motivo` ni el nombre real de un tipo sensible.
- [ ] Con SUPERVISOR, `GET /auditoria?entidad=solicitud` no contiene ningún valor de `motivo`, ni en registros nuevos ni en históricos.
- [ ] Un PDF y un XLSX generados por un usuario sin `DATOS_SENSIBLES_VER` muestran "Licencia con reserva" en tipos sensibles.
- [ ] Un certificado subido en una solicitud ATN-FAM queda `confidencial = true` y no es descargable con solo `DOCENTES_VER`.
- [ ] Enviar `confidencial: 'false'` en el multipart es ignorado (el DTO lo rechaza por whitelist).

## Fase 2 — Roles, seed e infraestructura (hallazgos 4, 5, 6, 7, 8)

Esta fase elimina la escalada de privilegios y deja la infraestructura sin puertos ni credenciales expuestos. El hallazgo 5 sería Crítico en producción, así que se resuelve antes de cualquier despliegue.

### 4 — Escalada de privilegios (`usuarios.service.ts:33-36,62-78,108-124`)

- Un usuario no puede modificar sus propios roles ni permisos: se valida `actor.id !== usuarioId` en asignación de roles, no solo en desactivación.
- Regla de techo: solo se pueden asignar roles cuyos permisos sean un subconjunto de los del actor. Asignar ADMIN requiere ser ADMIN.
- Los roles con `sistema: true` son inmutables en código, nombre y permisos. Cualquier intento devuelve 403 y queda auditado.
- Nuevo permiso `ROLES_GESTIONAR`, separado de `USUARIOS_GESTIONAR`, asignado solo a ADMIN.

### 5 — Seed con credencial conocida (`prisma/seed.ts:204,206,222`)

- El seed de usuarios demo solo corre si `NODE_ENV` es `development` o `test`; en otro caso aborta con error.
- Contraseñas generadas al azar por usuario (o tomadas de `SEED_ADMIN_PASSWORD`), nunca impresas en logs. Se marca `debeCambiarPassword = true`.
- En producción existe un comando aparte `npm run bootstrap:admin` que crea un único ADMIN con contraseña ingresada interactivamente.
- Quitar la contraseña del `README.md:33` y dejar de imprimir emails en el seed.
- Si alguna base ya fue sembrada fuera de desarrollo, rotar todas las contraseñas y revocar sesiones.

### 6 y 8 — Redis y PostgreSQL expuestos (`docker-compose.yml:5-10,18-22`)

- Puertos enlazados solo a loopback: `127.0.0.1:6380:6379` y `127.0.0.1:5433:5432`. En producción, sin `ports`; solo red interna de Docker.
- Redis con `requirepass` (o ACL con usuario dedicado) desde `REDIS_PASSWORD`; BullMQ y el cliente lo leen de config.
- PostgreSQL con usuario y contraseña desde variables de entorno, sin valores derivados del nombre del proyecto. Usuario de aplicación sin privilegios de superusuario.

### 7 — Dependencias vulnerables

- Backend: actualizar `exceljs` (para `uuid >= 11.1.1`) y `prisma`/`@prisma/client` a la versión mayor corregida, en una rama propia con la suite completa de tests.
- Frontend: `zod >= 4.6.6` (`package.json:21`).
- Agregar `npm audit --audit-level=high` al CI; falla el build con vulnerabilidades altas sin excepción documentada.

### Criterios de aceptación

- [ ] Un usuario con `USUARIOS_GESTIONAR` que intenta asignarse ADMIN recibe 403.
- [ ] Editar permisos de un rol `sistema: true` devuelve 403.
- [ ] `NODE_ENV=production npx prisma db seed` termina con error sin crear usuarios.
- [ ] Desde otra máquina de la red no se puede conectar a Redis ni a PostgreSQL; `redis-cli` sin contraseña devuelve `NOAUTH`.
- [ ] `npm audit --audit-level=high` sale con código 0 en backend y frontend.

## Fase 3 — Sesión, autenticación y configuración (hallazgos 9, 10, 17, 18, 19, 32)

La sesión pasa a ser revocable de inmediato y la configuración insegura impide el arranque. Se valida todo el entorno al iniciar con un esquema (`zod` o `Joi`) en `ConfigModule`.

| # | Problema | Requisito |
| --- | --- | --- |
| 9 | Cookie de refresh sin `Secure` (`auth.controller.ts:23`, `.env:10`) | En producción la cookie es siempre `Secure; HttpOnly; SameSite=Strict; Path=/auth`. Si `NODE_ENV=production` y `COOKIE_SECURE=false`, el arranque falla. `.env.example` trae `true`. |
| 10 | Secreto JWT sin validar fuerza (`jwt.strategy.ts:32`) | `JWT_SECRET` de al menos 32 bytes aleatorios; se rechazan placeholders conocidos (`cambiar-esto`, etc.). El arranque falla si no cumple. |
| 17 | Access token irrevocable (`jwt.strategy.ts:8-23`) | Se agrega `Usuario.tokenVersion` (int). El JWT lleva `tv`; la estrategia compara con BD (ya se consulta para recalcular permisos). Logout global, cambio de contraseña, cambio de roles y desactivación incrementan `tokenVersion`. |
| 18 | Bloqueo inducible y enumeración (`auth.service.ts:33-35`) | Mensaje único "Credenciales inválidas" para todos los casos. Bloqueo por cuenta con backoff progresivo (1, 5, 15 min) en vez de bloqueo duro; desbloqueo automático. Notificación al usuario cuando se bloquea. |
| 19 | Throttling falsificable y en memoria (`main.ts:10`, `app.module.ts:27`) | `ThrottlerStorageRedisService` para compartir contadores entre réplicas. `trust proxy` configurado con la IP o subred del proxy real (no `1` genérico) desde `TRUSTED_PROXIES`. Límite doble: por IP y por email. |
| 32 | Refresh/logout sin throttle, sesiones sin purga, sin MFA | `@Throttle` en refresh y logout. Job BullMQ diario que borra sesiones revocadas o vencidas hace más de 30 días. La IP auditada sale de la cadena de proxies confiables. MFA (TOTP) para ADMIN y SUPERVISOR queda como requisito para un ciclo posterior. |

### Criterios de aceptación

- [ ] El backend no arranca con `JWT_SECRET=cambiar-esto` ni con `COOKIE_SECURE=false` en producción.
- [ ] Tras cambiar la contraseña, un access token emitido antes devuelve 401 en la siguiente petición.
- [ ] Login con email inexistente y con cuenta bloqueada devuelven la misma respuesta y un tiempo similar.
- [ ] Enviar 20 intentos con distintos `X-Forwarded-For` contra el mismo email activa el límite por cuenta.
- [ ] Con dos réplicas, el contador de throttling es compartido.

## Fase 4 — Integridad del flujo de solicitudes (hallazgos 13, 14, 15, 16)

Toda escritura que depende de un estado se hace atómica, con el mismo patrón que ya funciona en `solicitudes.service.ts:297-304`. Además, quien crea o gestiona una solicitud no puede decidirla.

### Patrón obligatorio de escritura condicionada

```ts
const r = await tx.solicitud.updateMany({
  where: { id, estado: { in: estadosPermitidos }, version },
  data: { ...cambios, version: { increment: 1 } },
});
if (r.count === 0) throw new ConflictException('La solicitud cambió; recargue');
```

Se agrega `version Int @default(0)` a `SolicitudLicencia` y `Reemplazo`. El frontend envía la `version` leída y muestra el conflicto (409) al usuario.

### Cambios por hallazgo

| # | Archivo | Requisito |
| --- | --- | --- |
| 13 | `autorizaciones.service.ts:87-113` | Bloquear la decisión si el actor es el `docenteId`, el `solicitanteId` o quien recibió la solicitud. Aplica a autorizar, rechazar y observar. Excepción configurable por institución solo con un segundo aprobador. |
| 14 | `solicitudes.service.ts:367-376` | Verificar documentos solo en estados `PENDIENTE` o `EN_REVISION`, solo dentro de la institución del actor y nunca sobre documentos de una solicitud propia. Escritura condicionada al estado. |
| 15 | `reemplazos.service.ts:127-137` | Lectura y escritura dentro de `$transaction`; `updateMany` con `{id, estado, version}`. |
| 16 | `solicitudes.service.ts:210-229,339-349` | Edición y adjunto de archivos usan el patrón condicionado con estado `BORRADOR` u `OBSERVADA`. El archivo se guarda en disco solo después de confirmar la escritura en BD; si falla, se borra. |

### Criterios de aceptación

- [ ] Una SECRETARIA que creó una solicitud en nombre de un docente recibe 403 al intentar autorizarla.
- [ ] Verificar un documento de una solicitud en `BORRADOR` devuelve 409.
- [ ] Dos peticiones concurrentes que cambian el mismo reemplazo: una gana, la otra recibe 409 (test con `Promise.all`).
- [ ] Editar una solicitud mientras otra petición la pasa a `EN_REVISION` no modifica sus datos.

## Fase 5 — Hallazgos bajos e informativos (20-31)

Son cambios acotados de una o dos líneas cada uno. Pueden repartirse en paralelo y resolverse en un solo sprint. Tres de ellos (21, 22, 23) son fugas entre instituciones: pesan más cuando se sume la segunda institución.

| # | Archivo | Acción |
| --- | --- | --- |
| 20 | `prisma-exception.filter.ts:9-15` | En P2002 devolver "El registro ya existe" sin nombres de columnas ni índices; el detalle va solo al log. |
| 21 | `solicitudes.service.ts:139` | `circuitoDe` usa `findFirst({ id, institucionId })`. |
| 22 | `solicitudes.service.ts:158-163` | Numeración por institución con secuencia propia y `@@unique([institucionId, numero])`. Formato `LIC-<COD_INST>-AAAA-NNNNNN`. |
| 23 | `notificaciones.service.ts:38-41` | `usuariosConRol` filtra por `institucionId`. |
| 24 | `archivos.service.ts:29-37`, `archivos.controller.ts:13-19` | Servir siempre con `Content-Disposition: attachment` y `Content-Security-Policy: sandbox`. Validar estructura del PDF además de la firma. |
| 25 | `reportes.service.ts:114-117` | Reemplazar el objeto `INFORMES` por un `Map` o validar la clave con `Object.hasOwn`; clave desconocida devuelve 404. |
| 26 | `frontend/src/routes/index.tsx:30-42,60-75` | Sin cambio de código. Test de contrato que verifica que cada ruta protegida tiene su guard en backend. |
| 27 | `frontend/index.html` | CSP estricta (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`) y `Referrer-Policy: strict-origin-when-cross-origin`, servidas desde el servidor web o proxy. |
| 28 | `.gitignore:3` | Cambiar a `.env*` con excepción `!.env.example`. Revisar el historial de git por `.env` ya commiteados y rotar lo que aparezca. |
| 29 | `package.json` (ambos), `README.md` | Quitar `allowScripts` y la instrucción del README. Usar `npm ci --ignore-scripts` en CI y documentar qué paquetes necesitan scripts. |
| 30 | `frontend/src/services/api.ts:50-60` | Abrir los blobs como descarga (`a.download`) en lugar de `blob:` inline. |
| 31 | `main.ts:15` | Parsear `CORS_ORIGINS` con `split(',').map(s => s.trim()).filter(Boolean)` y fallar el arranque si contiene `*`. |

## Pruebas y verificación

Cada fix entra con un test que reproduce el hallazgo y fallaba antes del cambio. Sin ese test, el hallazgo no se considera cerrado.

**Tipos de prueba**

- **E2E de autorización (supertest):** una matriz rol × endpoint con los 8 usuarios de prueba. Verifica que la respuesta no contiene campos sensibles. Es la red de seguridad de la Fase 1.
- **Concurrencia:** `Promise.all` de dos escrituras sobre la misma entidad; exactamente una devuelve 2xx.
- **Arranque:** tests que levantan la app con configuraciones inválidas y esperan error.
- **Arquitectura:** un test que recorre los controladores y falla si uno expone entidades de licencia sin `@ExponeEntidad`.
- **Re-auditoría:** al cerrar las Fases 1 a 3, repetir la auditoría en modo solo lectura sobre los 33 hallazgos.

### Trazabilidad

| Hallazgo | Severidad | Fase | Test principal |
| --- | --- | --- | --- |
| 1 | Alto | 1 | E2E: `GET /docentes/:id/licencias` sin `motivo` por rol |
| 2 | Alto | 1 | E2E: `GET /auditoria` como SUPERVISOR sin `motivo` |
| 3 | Alto | 1 | Unit: informes PDF/XLSX con tipo enmascarado |
| 4 | Alto | 2 | E2E: autoasignación de ADMIN → 403 |
| 5 | Alto | 2 | Script: seed con `NODE_ENV=production` aborta |
| 6 | Alto | 2 | Infra: `redis-cli` sin contraseña → `NOAUTH` |
| 7 | Medio | 2 | CI: `npm audit --audit-level=high` |
| 8 | Medio | 2 | Infra: puerto 5433 no accesible desde la red |
| 9 | Medio | 3 | Arranque: `COOKIE_SECURE=false` en prod falla |
| 10 | Medio | 3 | Arranque: placeholder de JWT falla |
| 11 | Medio | 1 | E2E: archivo ATN-FAM confidencial |
| 12 | Medio | 1 | E2E: `confidencial: 'false'` rechazado |
| 13 | Medio | 4 | E2E: solicitante no puede autorizar |
| 14 | Medio | 4 | E2E: verificar en `BORRADOR` → 409 |
| 15 | Medio | 4 | Concurrencia: reemplazos |
| 16 | Medio | 4 | Concurrencia: edición vs cambio de estado |
| 17 | Medio | 3 | E2E: token anterior a cambio de contraseña → 401 |
| 18 | Medio | 3 | E2E: respuesta idéntica para cuenta inexistente y bloqueada |
| 19 | Medio | 3 | E2E: límite por email con `X-Forwarded-For` variable |
| 20-31 | Bajo | 5 | Un unit o E2E por fila de la tabla de Fase 5 |
| 32 | Info | 3 | E2E: throttle en refresh; job de purga |

## Plan de entrega y definición de terminado

Las fases van en orden y cada una tiene una condición para pasar a la siguiente. Las Fases 1 y 2 bloquean cualquier despliegue fuera de desarrollo.

1. **Fase 1 — Datos sensibles.** Una rama, un PR por hallazgo más uno para `SensitiveDataPolicy`. Pasa cuando la matriz E2E rol × endpoint está en verde.
2. **Fase 2 — Roles, seed e infraestructura.** El hallazgo 5 va primero. La actualización de dependencias mayores va en un PR aparte. Pasa cuando `npm audit` está limpio y la infra no expone puertos.
3. **Fase 3 — Sesión y autenticación.** Incluye migración de `tokenVersion` y throttler en Redis. Pasa cuando los tests de arranque y de revocación están en verde.
4. **Fase 4 — Integridad del flujo.** Incluye migración de `version` y cambios en el frontend para manejar 409.
5. **Fase 5 — Bajos.** En paralelo con la Fase 4 si hay más de una persona.
6. **Re-auditoría** sobre los 33 hallazgos.

### Definición de terminado (por hallazgo)

- [ ] Test que reproduce el hallazgo, en rojo antes y en verde después.
- [ ] PR que referencia el número de hallazgo en el título.
- [ ] Migraciones de datos probadas sobre una copia de la base.
- [ ] Sin regresiones en la suite completa.
- [ ] Fila de la tabla de trazabilidad actualizada.

### Preguntas abiertas

- ¿Hubo alguna base sembrada con la contraseña compartida fuera de desarrollo? Si sí, la rotación del hallazgo 5 es urgente.
- ¿Qué etiqueta genérica se muestra para tipos sensibles? Propuesta: "Licencia con reserva".
- ¿La excepción de separación de funciones (hallazgo 13) es necesaria en instituciones chicas con una sola autoridad?
