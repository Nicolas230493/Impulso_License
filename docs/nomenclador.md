# Nomenclador de licencias (Ley 647-E) — fases 1 y 2

Estado de la adecuación normativa ("Impulso License — Spec de adecuación normativa", 23/11/2026).

## Qué está hecho

**Fase 1: nomenclador y reglas**

- Modelo nuevo: `MotivoLicencia`, `VarianteLicencia`, `ReglaVariante` (regla JSON versionada por vigencia) y
  `SaldoLicencia`. Migración `20261123140000_nomenclador_647e`.
- Importador del Excel oficial (`backend/prisma/datos/nomenclador-647e-2026.xlsx`). Carga **54 motivos y 176 variantes**:
  41 de salud, 71 de otras licencias, 43 permisos, 12 sanciones y 9 movimientos provisorios. El spec estimaba ~140.
  Tiene vista previa de diferencias antes de aplicar y nunca pisa versiones de reglas existentes.
- Regla inicial válida para 175 de las 176 variantes (`reglas-base.ts`). La 1.8.1 (traslado transitorio por razones de
  salud) no tiene autoridad ni tope en el Excel y queda sin regla hasta confirmarla.
- ABM de reglas: cada cambio es una versión nueva con fecha de vigencia. La versión anterior se cierra el día previo, y
  las solicitudes viejas se evalúan con la regla vigente en su fecha.

**Fase 2: cálculo**

- Unidades: días corridos, hábiles (lunes a viernes menos feriados, recesos y asuetos de la institución) y laborables
  (los días de la semana con horario en las designaciones afectadas).
- Ventanas de tope: año calendario, año escolar (desde el 1/3), decenio contado desde la titularidad, carrera y por evento.
- Antigüedad en tres ámbitos: cargo y establecimiento, sistema (`Docente.fechaIngresoSistema`, o el ingreso si falta)
  y titular (primera designación titular).
- Saldos por docente, motivo y período, y tramos de haberes acumulativos (100 % → 50 %).
- `ReglasLicenciaService.evaluar`: aplica las validaciones 1 a 7 del spec y clasifica cada hallazgo como bloqueante,
  excepcionable (solo puede saltarlo `licencias.excepcion`, en la fase 3) o advertencia.

**Endpoints** (`/api/nomenclador`)

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/` | sesión iniciada |
| POST | `/importar/vista-previa`, `/importar` (multipart, campo `archivo`) | `nomenclador.gestionar` |
| GET / POST | `/variantes/:id/reglas` | `nomenclador.gestionar` |
| POST | `/simular` | el propio docente, `licencias.cargar`, `licencias.revisar` o `nomenclador.gestionar` |
| GET | `/saldos/:docenteId` | el propio docente, `docentes.ver` o `licencias.ver_todas` |

El permiso nuevo `nomenclador.gestionar` lo reciben, por migración, los roles que ya tenían `catalogo.gestionar`
(ADMIN y RR.HH. en la demo). El seed carga el nomenclador completo en el régimen `LEY-647E`.

## Diferencias entre el nomenclador y la ley

Se aplicó la regla más restrictiva y cada caso queda anotado en el campo `diferencia` de la regla. Para cambiar el
criterio se carga una versión nueva de la regla, sin tocar código.

| # | Variante | Nomenclador | Ley 647-E | Se aplica |
|---|---|---|---|---|
| D1 | 1.2.7 / 1.2.8 largo tratamiento, suplente | 6 meses en el sistema | sin término o 1 año (art. 340 b) | ley |
| D2 | 1.3.7 / 1.3.8 accidente, suplente | 2 años + 1 al 50 % | 6 meses + 3 al 50 % (art. 340 c) | ley |
| D3 | 2.2 adopción | 100 / 90 / 180 días según la edad | 180 días (art. 309 e) | nomenclador |
| D4 | 2.2.10 / 2.2.11 | encuadre 331-F | debería ser 340-F | se avisa al importar |
| D5 | 1.4 prórroga de maternidad | solo 30 días | otros supuestos (art. 309 c) | nomenclador |
| D6 | 2.9.1 exámenes | sin concurso | +15 días hábiles por concurso (art. 318 h) | nomenclador |
| D7 | 2.13.3 / 2.13.4 inasistencias | 3.ª en el mes = baja | más de 2 continuas o más de 5 / 3 (arts. 336 y 345) | alerta con el primer umbral |
| D8 | 3.12 citación judicial | incluida | no está en arts. 306, 329 y 338 | se mantiene |
| **D9** | 1.5.6 familiar enfermo, suplente | 10 días | **5 días** (art. 340 e) | ley |
| **D10** | 3.4.7 a 3.4.9 duelo, suplente | días laborables | **días hábiles** (art. 343 e) | ley |

D9 y D10 no figuran en el spec: aparecieron al comparar el Excel con el texto de la ley.

Otros avisos del importador: la 2.17 no indica autoridad, la 3.12.2 dice "Interina", y los encuadres 320- y 334- de la
3.12 están incompletos.

## Supuestos a confirmar

- **Planillas IL1 e IL2:** IL2 = 1.2, 1.3, 1.6, 1.7, 2.6, 2.7, 2.10 y 2.11; el resto de las agrupaciones 1 a 3 va a IL1.
  Es provisorio hasta tener los modelos reales.
- **Año escolar:** empieza el 1 de marzo (regla del familiar enfermo y del art. 347).
- **Interino incluye transitorio** (art. 329).
- **2.7 cargo electivo:** otorga el Ministro, o el Subsecretario si el cargo es fuera de la jurisdicción. Queda como
  autoridad alternativa.
- **Exámenes para suplentes:** no hay variante (pregunta abierta del spec).

## Qué falta (fases 3 a 5)

- **Fase 3:** que la solicitud elija la variante por designación y la congele al presentar
  (`SolicitudDesignacion.varianteId` y `revista` ya existen); validar con el motor al crear, editar, presentar y
  autorizar; permiso `licencias.excepcion`; estados Elevada y Pendiente de dictamen; Reconocimientos Médicos;
  automáticas; cancelación por cese; interrupción de la anual.
- Hasta entonces los saldos y el historial están vacíos: el motor solo cuenta licencias con variante del nomenclador.
- **Fase 4:** disposición numerada, IL1, IL2, estadística mensual, registro del art. 347 y asistencia por designación.
- **Fase 5:** renombre técnico (paquetes, base `impulso_license`), mapeo de las solicitudes existentes a códigos del
  nomenclador y carga histórica.
- **Frontend:** todavía no hay pantallas para el nomenclador; todo se usa por API.
- **Sin probar contra PostgreSQL:** la migración, el importador escribiendo en la base y los endpoints. No hay base
  disponible en este entorno.
