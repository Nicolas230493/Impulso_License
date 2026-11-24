# Impulso License

Sistema web de gestión integral de personal y licencias docentes (SPEC 01).
Monorepo con **backend NestJS + Prisma + PostgreSQL** y **frontend React + Vite + Tailwind**.

## Puesta en marcha (desarrollo)

Requisitos: Node 20.12+ y Docker (Docker Desktop en Windows). Los comandos de abajo funcionan igual en Linux/macOS
(bash) y en Windows (PowerShell o cmd); ninguno antepone `VARIABLE=valor`: la configuración va en los archivos `.env`.

Para generar contraseñas y secretos (en cualquier sistema):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
# 1. Base de datos y Redis (credenciales propias; los puertos se publican solo en 127.0.0.1)
cp .env.example .env            # completar las contraseñas con valores generados
docker compose up -d            # PostgreSQL en 127.0.0.1:5433, Redis (con contraseña) en 127.0.0.1:6380
# Opcional en desarrollo, obligatorio en producción: antivirus (≈1 GB de RAM) y CLAMAV_HOST=127.0.0.1 en backend/.env
# docker compose --profile antivirus up -d

# 2. Backend
cd backend
cp .env.example .env            # DATABASE_URL (usuario de aplicación), DATABASE_URL_MIGRACIONES (dueño del esquema),
                                # JWT_ACCESS_SECRET y CLAVE_CIFRADO generados, y SEED_ADMIN_PASSWORD para la demo
npm install
npx prisma migrate deploy       # crea el esquema
npm run db:seed                 # solo con NODE_ENV=development o test (lo toma de backend/.env)
npm run start:dev               # API en http://localhost:3000/api

# 3. Frontend (otra terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxy /api → :3000)
```

El servidor **no arranca** si la configuración es insegura: `JWT_ACCESS_SECRET` débil o de ejemplo, `COOKIE_SECURE=false` o
sin `REDIS_URL` en producción, `CORS_ORIGINS` con `*`, etc. El error indica qué variable corregir.

La base usa dos usuarios sin superusuario: el **dueño del esquema** (`MIGRACION_DB_USER`, solo para `prisma migrate`) y
el de la **aplicación** (`APP_DB_USER`, solo lee y escribe datos). El script de `docker/postgres` los crea al inicializar
el volumen; en un volumen que ya existía (por ejemplo, de una versión anterior donde la aplicación era dueña del
esquema) se corre a mano, es idempotente y convierte la base:

```bash
docker compose up -d postgres     # con MIGRACION_DB_USER/MIGRACION_DB_PASSWORD ya agregados al .env de la raíz
docker compose exec -T postgres sh /docker-entrypoint-initdb.d/01-usuario-app.sh
```

Archivos subidos antes de definir `CLAVE_CIFRADO`: `npm run cifrar:archivos` (simulación) y `-- --aplicar`.

### Usuarios de demostración

El seed crea los usuarios de abajo con la contraseña de `SEED_ADMIN_PASSWORD` (si no se define, se generan contraseñas
aleatorias que no se muestran). Todos deben cambiarla en el primer ingreso. El seed no corre fuera de desarrollo/pruebas.

| Perfil | Usuario |
|---|---|
| Administrador | admin@demo.edu.ar |
| Secretaría | secretaria@demo.edu.ar |
| Directivo | direccion@demo.edu.ar |
| Administración / RR.HH. | rrhh@demo.edu.ar |
| Representante legal / Supervisión | representante@demo.edu.ar |
| Docente | laura.garcia@demo.edu.ar, martin.fernandez@demo.edu.ar, diego.romero@demo.edu.ar |

### Producción: primer administrador

Con `NODE_ENV=production` en `backend/.env`:

```bash
cd backend
npx prisma migrate deploy
npm run bootstrap:admin
```

Pide institución, correo y contraseña de forma interactiva (la contraseña no se muestra ni se registra). Solo crea el primero.

En producción el seed no corre, así que el nomenclador 647-E se carga aparte (también desde Administración → Nomenclador):

```bash
cd backend
npm run cargar:nomenclador                  # simulación: muestra qué va a cargar
npm run cargar:nomenclador -- --aplicar
```

### Pasar los datos de EduLicencias (base anterior)

La base anterior (`edulicencias`, contenedor `edulicencias-db`, volumen `…_pgdata`) no se modifica: se copia a la nueva
(`impulso_license`) y sobre la copia se aplican las migraciones de la Ley 647-E.

Desde la raíz del proyecto, con Docker en marcha (igual en Linux y Windows):

```bash
node deploy/migrar-base-anterior.mjs                # se niega si la base nueva ya tiene tablas
node deploy/migrar-base-anterior.mjs --reemplazar   # la base nueva solo tiene datos de prueba: la respalda y la reemplaza
```

Si hay más de un volumen `…_pgdata` en la máquina, indique cuál con la variable `VIEJO_VOLUMEN`
(bash: `VIEJO_VOLUMEN=nombre node deploy/…`; PowerShell: `$env:VIEJO_VOLUMEN='nombre'; node deploy/…`).
Con Podman en lugar de Docker: `DOCKER_BIN=podman`.

El script deja respaldos en `respaldos/` (ignorado por git: contiene datos personales) y al final indica los pasos
siguientes en `backend/`: apuntar `DATABASE_URL` a la base nueva, `npm run db:deploy`,
`npm run cargar:nomenclador -- --aplicar` y `npm run migrar:solicitudes`.

`migrar:solicitudes` pasa las solicitudes del régimen anterior a códigos del nomenclador (`prisma/datos/mapeo-tipos-anteriores.json`).
Lo que no puede decidir solo queda en `revision-migracion-solicitudes.csv`: se completa la columna **variante elegida**
(p. ej. `1.5.1`) y se aplica con `npm run migrar:solicitudes -- --resueltas revision-migracion-solicitudes.csv --aplicar`.
Las designaciones con revista **Provisional** (no existe en la Ley 647-E) se corrigen antes a interino o transitorio.

### Reiniciar la base de datos

```bash
cd backend
npx prisma migrate reset        # borra todo, re-aplica migraciones y ejecuta el seed
```

## Pruebas

```bash
cd backend
npm test                        # unitarias: reglas, política de datos sensibles, roles, sesión, arquitectura, contrato de rutas
# E2E contra la API en ejecución, sobre una base descartable recién sembrada:
#   API con NODE_ENV=test y TRUSTED_PROXIES=loopback; las pruebas toman SEED_ADMIN_PASSWORD (y API_URL) de backend/.env
npm run test:e2e                # smoke + seguridad + ley647 (API_URL por defecto http://127.0.0.1:3000/api)
```

CI (`.github/workflows/ci.yml`) instala con `npm ci --ignore-scripts` y corre `npm audit --audit-level=high`, que falla el
build ante vulnerabilidades altas. Paquetes que necesitan pasos de instalación: Prisma (`npx prisma generate`, se corre
explícitamente); esbuild funciona sin su script porque usa el binario del paquete opcional de la plataforma.

`ley647.e2e.mjs` comprueba los criterios de aceptación de la Ley 647-E contra la API: topes de interinos por antigüedad,
alcance de las licencias de salud, días laborables según horario, matrimonio, asuntos particulares cada 2 años, elevación a
autoridad externa y resolución, dictamen de Reconocimientos Médicos, disposición numerada, cancelación por cese (art. 350),
reserva de violencia de género e informes IL1, IL2, estadística mensual, concepto anual y registro del art. 347. Lo que
depende del paso del tiempo (tramo de haberes a los 2 años, dictamen vencido a las 24 h, alertas del art. 336) está en los
tests unitarios del motor.

La prueba E2E recorre el circuito completo: solicitud → documentación → presentación → recepción → aprobación por pasos →
superposición → reemplazo parcial → reincorporación anticipada → informes → auditoría → rotación de sesión.

## Arquitectura

```
backend/src
  common/            guards (JWT + permisos), decoradores, fechas, validadores (CUIL), filtros
  prisma/            PrismaService
  modules/
    auth/            login, refresh con rotación, logout, cambio de contraseña, bloqueo por intentos
    usuarios/        usuarios, roles, matriz de permisos
    instituciones/   datos institucionales y feriados
    docentes/        legajos, domicilios, contactos, documentación personal
    cargos/          cargos, cursos, espacios curriculares, designaciones y horarios
    licencias/       catálogo (regímenes, tipos, reglas) y solicitudes
                     reglas-negocio.ts → funciones puras con tests
    autorizaciones/  circuitos configurables por pasos/rol, bandeja, decisiones
    reemplazos/      reemplazos con cobertura parcial (por franja y por tramo de fechas)
    asistencias/     planilla diaria y novedades
    notificaciones/  notificaciones internas + alertas diarias (cron 7:00)
    reportes/        panel, calendario, 7 informes con exportación PDF/Excel
    auditoria/       registro de acciones con valores anteriores/nuevos e IP
    archivos/        almacenamiento privado con control de acceso

frontend/src
  components/ layouts/ pages/ services/ hooks/ routes/ types/ utils/
```

### Circuito de una solicitud

```
BORRADOR ──presentar──▶ PENDIENTE ──recibir──▶ EN_REVISION ──(paso 1..n aprobado)──▶ AUTORIZADA ──reincorporación──▶ FINALIZADA
    │                       │                      │  ├─observar──▶ OBSERVADA ──corregir y presentar──▶ PENDIENTE
    └──────── anular ───────┴──────────────────────┘  └─rechazar──▶ RECHAZADA
```

- Cada paso del circuito lo decide **solo** el rol responsable; nadie interviene en su propia solicitud.
- Al presentar se valida: período, vigencia del tipo y del régimen, designaciones afectadas vigentes,
  **superposición** con otras licencias en cargos comunes, **documentación obligatoria** y las **reglas** configuradas
  (máximo por solicitud o por año, cantidad anual, antigüedad mínima y anticipación).
- Todo cambio de estado queda en `historial_estados` y en `auditoria`, con control de concurrencia optimista.

### Seguridad

- Contraseñas con bcrypt (12 rondas) y política de complejidad. Tras 5 intentos fallidos la cuenta se bloquea con backoff
  progresivo (1, 5 y 15 minutos) y desbloqueo automático; se avisa al usuario. El login responde siempre
  "Credenciales inválidas", exista o no la cuenta y esté o no bloqueada.
- El access token JWT dura 15 minutos y se guarda **solo en memoria**. Lleva la versión de token del usuario (`tv`): un
  cierre de sesión global, un cambio de contraseña o de roles y la desactivación lo invalidan en la siguiente petición.
  El refresh token es una cookie `HttpOnly`, `SameSite=Strict`, `path=/api/auth` y `Secure` (obligatorio en producción);
  se rota en cada uso y queda guardado como hash. Las sesiones revocadas o vencidas se purgan a los 30 días (job diario).
  Si dos pestañas renuevan a la vez, se turnan (Web Locks) y el backend acepta durante 30 s la cookie recién rotada
  mientras la sesión que la reemplazó siga viva; fuera de ese margen, reusar un token rotado revoca todas las sesiones.
- Con una contraseña temporal (`debeCambiarPassword`), la API responde 403 a todo salvo el perfil, el cambio de
  contraseña, el cierre de sesión y el contador de notificaciones (`@PermiteCambioPendiente`).
- Los permisos se resuelven en cada petición. Nadie modifica sus propios roles, solo se asignan roles con permisos que el
  actor tiene (ADMIN solo lo asigna un ADMIN), los roles de sistema son inmutables y la matriz de roles requiere
  `roles.gestionar`. Los intentos de escalada quedan auditados.
- Rate limiting con contadores en Redis (compartidos entre réplicas): por IP y, en el login, también por cuenta. Solo se
  confía en `X-Forwarded-For` de los proxies listados en `TRUSTED_PROXIES`.
- Helmet, CORS con orígenes exactos (`*` no se admite), `ValidationPipe` con whitelist y consultas parametrizadas (Prisma).
  Los errores de base de datos no revelan columnas ni índices.
- Archivos fuera del directorio público, con firma binaria y estructura validadas (PDF sin JavaScript ni acciones),
  escaneo antivirus con ClamAV (falla cerrada: sin respuesta del antivirus no se aceptan), hash SHA-256 y permisos 0600.
  Se guardan **cifrados** (AES-256-GCM con `CLAVE_CIFRADO`) y al descargarlos se verifica que coincidan con su hash.
  Se escriben en disco solo después de confirmar la base. Se sirven siempre como descarga y con
  `Content-Security-Policy: sandbox`.
- **Verificación en dos pasos (TOTP)** con cualquier app autenticadora. Obligatoria para ADMIN y SUPERVISOR en
  producción (`EXIGIR_2FA`); hasta configurarla solo pueden usar "Mi perfil". El código incorrecto cuenta para el
  bloqueo por intentos y un código no se acepta dos veces. Si un administrador blanquea la contraseña de otro usuario,
  también le reinicia el segundo factor (recuperación por teléfono perdido).
- **Base de datos con privilegios mínimos:** la aplicación no puede crear, alterar ni borrar tablas. La **auditoría es
  inalterable**: un trigger impide editarla, borrarla o vaciarla (incluso a un superusuario, salvo que lo desactive a
  propósito) y el usuario de la aplicación no tiene permisos para intentarlo ni para desactivar el trigger.
- El Excel del nomenclador se verifica antes de abrirlo (protección contra bombas zip).
- Contraseñas de hasta 72 bytes (el límite real de bcrypt) en todos los formularios.
- **Datos sensibles**: una única política (`SensitiveDataPolicy`) filtra toda respuesta de los controladores marcados con
  `@ExponeEntidad`, la auditoría y los informes. Sin `datos_sensibles.ver`, y salvo el propio docente, el motivo no se
  muestra y los tipos marcados como sensibles (salud, maternidad o con certificado médico) aparecen como
  "Licencia con reserva". Su documentación es confidencial y cada acceso de terceros queda auditado. La auditoría guarda
  los campos sensibles como `[modificado]`.
- Separación de funciones: quien es titular, cargó o recibió una solicitud no puede decidirla. Toda transición de
  solicitudes y reemplazos es una escritura condicionada a estado y versión (409 si cambió).

## Estado respecto de la SPEC

Implementado: fases 2 a 7 completas y la mayor parte de la fase 8. Cubre todos los criterios de aceptación de la sección 13.

## Hoja de ruta

Lo que falta, ordenado por prioridad. Se recomienda avanzar primero con el grupo 1 y, en paralelo, cargar la normativa real.

### 1. Lo que frena el uso real en la escuela

- [ ] **Normativa real.** Los regímenes y tipos cargados son *ejemplos ilustrativos*. Hay que cargar el estatuto o convenio
      aplicable (artículos, topes de días, documentación, autoridad que autoriza) y que lo valide la autoridad competente.
- [ ] **Documentación diferida.** Hoy el certificado se exige al presentar. Falta un plazo configurable por tipo de licencia
      (p. ej. 48–72 h) para entregarlo después, con alerta si no llega.
- [ ] **Prórrogas.** Extender una licencia ya autorizada sin crear una solicitud nueva (muy común en salud y maternidad).
- [ ] **Licencias por horas o media jornada.** Hoy todo se computa por días.
- [ ] **Pantallas faltantes** (el backend ya existe):
  - [ ] Feriados y datos de la institución
  - [ ] Novedades del personal
  - [ ] Vista del docente de sus propias suplencias
- [ ] **Importación masiva** de docentes y designaciones desde Excel.
- [ ] **Alta de nuevas instituciones** desde la interfaz: el modelo ya es multi-institución, pero hoy se crean por seed o script.

### 2. Para ponerlo en producción

- [ ] **Correo electrónico con BullMQ/Redis**: avisos por mail y recuperación de contraseña ("olvidé mi contraseña").
      El punto de extensión está marcado con `TODO(fase 8)` en `notificaciones.service.ts`, y Redis ya está en `docker-compose.yml`.
- [ ] **Despliegue:**
  - [ ] Dockerfiles para la API y el frontend
  - [ ] HTTPS con proxy inverso y `COOKIE_SECURE=true`
  - [ ] Backups cifrados automáticos de PostgreSQL y del directorio `storage/`
- [ ] **Git, ESLint/Prettier y CI** que corra los tests en cada cambio.
- [x] **Numeración por institución.** `LIC-<COD_INST>-AAAA-NNNNNN` con secuencia propia por institución.
- [ ] **Seguridad adicional:**
  - [x] Segundo factor (TOTP) para ADMIN y SUPERVISOR
  - [ ] Pantalla para ver y cerrar sesiones abiertas
  - [x] Escaneo antivirus de los archivos subidos (ClamAV)
  - [x] Cifrado en reposo de los archivos subidos
  - [x] Auditoría a prueba de modificaciones (que nadie pueda editar ni borrar registros, ni desde la base)

### 3. Calidad y mantenimiento

- [ ] **Tests por módulo** (lo pide la spec): tests de integración por servicio y tests del frontend.
- [ ] **Documentación de la API** con Swagger/OpenAPI.
- [ ] **Prorrateo de días por período** en los informes y en el cupo anual: hoy una licencia que cruza el período
      se cuenta completa, y `MAX_DIAS_POR_ANIO` se imputa al año de inicio.
- [ ] **Datos personales (Ley 25.326):** política de retención y exportación del legajo completo a pedido del titular.
# Impulso_License
# Impulso_License
