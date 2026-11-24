# Impulso License — Spec de adecuación normativa (Ley 647-E)

Nov 23, 2026 · @Nicolás

## Contexto y objetivo

EduLicencias pasa a llamarse **Impulso License** y se adecua al régimen de licencias del Estatuto del Docente de la Provincia del Chaco (Ley 647-E, títulos XVI a XIX, arts. 305 a 350). El cambio central es pasar de un catálogo genérico de tipos de licencia a uno que reproduzca el **nomenclador oficial 2026**, con reglas que dependen de la situación de revista, la antigüedad y el cargo afectado.

**Fuentes**

- *Ley 647-E — Estatuto del Docente (texto 2024).* Define las licencias ordinarias y extraordinarias, los permisos, las inasistencias justificables y sus topes, por separado para titulares (título XVI), interinos y transitorios (XVII) y suplentes (XVIII).
- *Nomenclador de licencias Ley 647-E 2026.* Contiene unas 140 variantes en 5 agrupaciones: Salud, Otras licencias, Permisos, Sanciones y Movimientos provisorios. Cada variante tiene código, encuadre legal, situación de revista, forma de pago, autoridad que otorga y tope.
- *Investigación del proyecto.* Describe cómo trabaja hoy Secretaría: recibe los pedidos por mail, cuaderno de inasistencias y WhatsApp, y los vuelve a cargar en al menos cuatro planillas distintas.

**Objetivos**

1. Que cada licencia se encuadre en un código del nomenclador y en su artículo, sin texto libre.
2. Que el sistema calcule los topes, los días y la forma de pago según la ley, y bloquee lo que no corresponde.
3. Que una sola carga reemplace al Excel de disposiciones, la planilla de estadística mensual, las planillas IL1 e IL2 y los Word de inasistencias por materia.
4. Que las licencias que otorgan autoridades fuera de la escuela (Supervisor, Director Regional, Subsecretario, Ministro, Reconocimientos Médicos) se registren con su instrumento legal.

**Fuera de alcance:** liquidación de haberes, el trámite interno de Reconocimientos Médicos o del Ministerio, y el régimen de establecimientos privados. Para estos últimos se pueden cargar más adelante otros regímenes con el mismo motor.

## Marco normativo: lo que el sistema tiene que respetar

La ley fija los derechos según la situación de revista: titular, interino o transitorio, y suplente (art. 3). Un mismo docente puede tener distinta situación en cada designación, así que la regla se evalúa por designación y no por persona. Abajo están las reglas transversales; los topes de cada licencia van en el catálogo.

### Estructura del régimen

| Bloque | Titular | Interino/transitorio | Suplente |
| --- | --- | --- | --- |
| Enumeración de licencias y permisos | art. 306 | art. 329 | art. 338 |
| Licencias ordinarias (anual, salud, maternidad, familiar, adopción) | arts. 307-309 | arts. 330-332 | arts. 339-341 |
| Licencias extraordinarias | arts. 318-319 | art. 333 | art. 342 |
| Permisos | arts. 320-321 | art. 334 | art. 343 |
| Inasistencias justificables por razones particulares | art. 323 | art. 336 | art. 345 |
| Disposiciones comunes | arts. 310-317, 322-328 y 347-350 | arts. 332, 335 y 337 (remiten al titular) | arts. 341, 344 y 346 (remiten al titular) |

### Reglas transversales

- **Licencias de salud simultáneas** (arts. 331 y 340). Las licencias de salud abarcan todos los cargos en que revista el docente y se otorgan a la vez en todos. La excepción es la atención de un familiar enfermo, que puede pedirse solo en algunos cargos (art. 309 d).
- **Unidad de cómputo.** La ley usa cuatro unidades distintas: días corridos (salud, maternidad, anual), días hábiles (matrimonio, nacimiento), días laborables (exámenes, duelo) y días sin calificar. El período de los topes también varía: año calendario, año escolar, decenio (asuntos particulares) o toda la carrera (incompatibilidad).
- **Antigüedad.** Hay tres medidas distintas: en el cargo y en el establecimiento (4 meses para interinos y suplentes, arts. 331 a y 340 a), en el sistema (6 meses para largo tratamiento de interinos, art. 331 b) y como titular (1 año para asuntos particulares y 3 años para estudio, arts. 318 a y 7 k).
- **Reconocimientos Médicos** es el único organismo que dictamina sobre licencias de salud, maternidad y familiar enfermo (arts. 313 y 317). Si el docente no se presenta dentro de las 24 h de reintegrarse a sus tareas, las faltas pasan a injustificadas (art. 313 b y c).
- **Aviso de ausencia.** El aviso se da dentro de la primera hora de labor en casos de salud (art. 313 d) y dentro de las 24 h en general (art. 326). El registro de asistencia anota "ausente con aviso" o "ausente sin aviso". Cinco días laborables seguidos sin aviso son abandono de servicio, y a los 10 días corridos el docente queda en situación de cesantía (art. 328).
- **Incompatibilidades entre licencias.** Durante asuntos particulares o fuerza mayor no se puede pedir otra licencia (art. 318 a y b). Estudio no se suma a ninguna de esas dos (art. 318 c).
- **Interrupción de la anual** (art. 315). La licencia anual se interrumpe por enfermedad, maternidad o razones de servicio y se retoma después.
- **Reencuadre** (art. 316). Una enfermedad común puede pasar a largo tratamiento sin agotar los 45 días.
- **Prórroga por salud** (art. 347). Concede el Ministerio: 100 % de haberes los dos primeros años, 50 % el tercero y 25 % el cuarto. Los períodos discontinuos se acumulan. Hay que llevar un registro con el número de resolución.
- **Cancelación por cese** (art. 350). La licencia de un interino o suplente se cancela si se presenta el titular. La excepción son maternidad y adopción, que se siguen pagando hasta terminar (arts. 331 d y f, 340 d y f).
- **Automáticas sin solicitud.** Ascenso de jerarquía (art. 319) e incompatibilidad por subrogancia (arts. 333 e y 342 e) se registran desde la designación, sin que el docente presente nada.
- **Carácter reservado.** Violencia de género se tramita en reserva y puede formalizarse en forma oral (art. 318 l).
- **Concepto anual.** Inasistencias, tardanzas y retiros inciden en el concepto anual del docente (art. 348), así que tienen que poder exportarse por docente y por año.

## Catálogo de licencias (nomenclador 2026)

El catálogo se carga completo desde el Excel del nomenclador y cada variante es un registro. El código tiene tres niveles: agrupación, motivo y variante (por ejemplo, `1.1.1` = Salud · Enfermedad común · Titular). La variante combina situación de revista y forma de pago. La tabla resume los motivos que se piden por solicitud; las agrupaciones 4 y 5 se tratan como novedades y no como licencias.

### Agrupaciones 1 a 3: licencias y permisos

| Código | Motivo | Titular | Interino | Suplente | Unidad | Otorga |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Enfermedad o lesión común | 45 d/año (309 b1) | 30 d; 10 d si < 4 meses (331 a) | 15 d; 5 d si < 4 meses (340 a) | corridos, año calendario | Director |
| 1.2 | Largo tratamiento, lesión grave o profilaxis | 2 años 100 % + 1 año 50 % | igual, desde 6 meses en el sistema | ver diferencia D1 | acumulativo | Director, previo informe de Reconocimientos Médicos |
| 1.3 | Enfermedad ocupacional o accidente de trabajo | 2 años 100 % + 1 año 50 % | igual | ver diferencia D2 | acumulativo | Ministro |
| 1.4 | Gravidez y maternidad | 180 d + prórrogas | igual | igual | corridos | Director |
| 1.5 | Enfermedad de un familiar | 28 d + 30 d de prórroga si es derivado fuera de la provincia | 10 d, con 4 meses | 5 d, con 4 meses (340 e) | corridos, año escolar | Director |
| 1.6 | Prórroga por salud (art. 347) | 100 % / 50 % / 25 % / sin goce | igual | igual | por período escolar | Ministro |
| 1.7 | Tareas pasivas | según prescripción | igual | igual | — | Director Regional |
| 2.1 | Anual | 60 d desde el 24/12 | 60 d, haber proporcional | 60 d, haber proporcional | corridos | Director |
| 2.2 | Adopción | 180 d (309 e) | igual | igual | corridos | Director |
| 2.3 | Asuntos particulares (sin goce) | 1 año por decenio, con 1 año como titular | — | — | decenio | Supervisor |
| 2.4 | Fuerza mayor o grave asunto de familia (sin goce) | 90 d/año | — | — | año calendario | Supervisor |
| 2.5 | Estudio o perfeccionamiento | 3 años con 3 de antigüedad; hasta 20 d sin antigüedad | 20 d, con 4 meses | 10 d, con 4 meses | año calendario | Subsecretario / Director Regional |
| 2.6 | Representación gremial, mutual o docente | según mandato + 5 d hábiles | — | — | — | Ministro |
| 2.7 | Cargo electivo o representación política (sin goce) | según mandato + 5 d hábiles | igual | igual | — | Ministro / Subsecretario |
| 2.8 | Matrimonio | 10 d | 10 d | 2 d | hábiles, con la fecha incluida | Director |
| 2.9 | Exámenes | 30 d/año; concurso 15 d hábiles | 16 d/año | ver pregunta abierta | laborables | Director |
| 2.10 | Incompatibilidad (sin goce) | hasta 2 años + 1 | automática por subrogancia | automática por subrogancia | carrera | Supervisor |
| 2.11 | Ascenso de jerarquía (sin goce) | automática (319) | automática | automática | según designación | Superior inmediato |
| 2.13 | Inasistencias por razones particulares | 10 con goce + 4 sin goce | 5 | 3 | año calendario | Director |
| 2.14 | Cambio de funciones por gravidez | según prescripción | igual | igual | — | Director |
| 2.15 | Donación de órganos | según certificación | igual | igual | — | Director |
| 2.16 | Papanicolau, colposcopía y mamografía | 1 d/año, certificado en 48 h | igual | igual | — | Director |
| 2.17 / 2.18 / 2.22 | Especiales (Res. 1280/00, deportiva Ley 3656, Ley 7616) | según norma | según norma | según norma | — | según norma |
| 2.19 | Comité de prevención de la tortura | mientras dure la función, máx. 5 afectaciones | igual | igual | — | Ministro |
| 2.20 | Violencia de género (reservada) | hasta cesar el riesgo | igual | igual | — | Director |
| 2.21 | Trámite jubilatorio | desde 60 d hábiles de iniciado hasta la baja | igual | igual | — | Subsecretario |
| 2.23 | Donación de plasma | 2 d por donación | igual | igual | — | Director |
| 2.24 | Violencia laboral (Ley 3718-E) | plazo del dictamen de la Ley 2023-A | igual | igual | — | Dirección de Bienestar Educativo |
| 3.1 | Nacimiento de hijo | 15 d; 30 d si es prematuro, múltiple o con trastornos congénitos | igual | igual | hábiles | Director |
| 3.2 | Adopción (cónyuge) | 30 d (+30 si hay discapacidad) | 30 d | 30 d | corridos | Director |
| 3.3 | Matrimonio de hijo | 5 d | 5 d hábiles | 5 d hábiles | con la fecha incluida | Director |
| 3.4 | Duelo | 8 / 2 / 1 d según el grado, +2 por traslado | 8 / 2 / 1 | 8 / 2 / 1 | laborables (suplente: hábiles) | Director |
| 3.5 | Candidato partidario o docente | desde 24 h de oficializada la lista hasta 5 d después de la elección | igual | igual | — | Director |
| 3.6 / 3.7 | Excursiones / credo no católico | no se computa la inasistencia | igual | igual | — | Director |
| 3.8 | Donación de sangre | 1 d | 1 d | 1 d | — | Director |
| 3.9 | Lactancia | 60 min diarios por 3 meses + 3 | igual | igual | minutos por jornada | Director |
| 3.10 | PSA | 1 d/año | igual | igual | — | Director |
| 3.11 | Natalicio | 1 d, la fecha del legajo | igual | igual | laborable | Director |
| 3.12 | Citación judicial | según citación | igual | igual | — | Director |

### Agrupaciones 4 y 5: novedades

Sanciones (apercibimiento, suspensión, suspensión preventiva) y movimientos provisorios (traslado transitorio, comisión de servicios, afectación, relevo, separación por sumario, tareas pasivas, baja en trámite) no se solicitan: los registra RR.HH. con su instrumento legal. Afectan la disponibilidad del docente en el calendario y aparecen en los informes, pero no consumen topes.

### Diferencias entre el nomenclador y la ley

El nomenclador 2026 no coincide con el texto de la ley en estos puntos. Hasta que la autoridad competente lo resuelva, el sistema carga la regla más restrictiva y la deja configurable.

| # | Motivo | Nomenclador | Ley 647-E (2024) |
| --- | --- | --- | --- |
| D1 | 1.2 Largo tratamiento, suplente | desde 6 meses en el sistema | suplencia sin término o 1 año en el sistema (art. 340 b) |
| D2 | 1.3 Accidente de trabajo, suplente | 2 años + 1 año al 50 % | 6 meses + 3 meses al 50 % (art. 340 c) |
| D3 | 2.2 Adopción | 100, 90 o 180 d según la edad del niño | 180 d sin importar la edad (art. 309 e) |
| D4 | 2.2.10 y 2.2.11 | encuadre 331-F para suplentes | debería ser 340-F, como la variante 2.2.12 |
| D5 | 1.4 Maternidad, prórrogas | solo 30 d | +30 d por parto múltiple o prematuro; igual período si el recién nacido requiere tratamiento prolongado; +90 d por hijo con discapacidad; 60 d si el niño nace muerto; traspaso al padre si fallece la madre (art. 309 c) |
| D6 | 2.9 Exámenes | sin concurso de oposición | 15 d hábiles por concurso de ingreso o ascenso (art. 318 h) |
| D7 | 2.13 Inasistencias | "3ª inasistencia en el mes = baja" | interinos: baja con más de 2 continuas o más de 5 discontinuas (art. 336); suplentes: más de 2 continuas y más de 3 (art. 345) |
| D8 | 3.12 Citación judicial | incluida | no está en las enumeraciones de los arts. 306, 329 y 338, aunque sí en los arts. 320 i, 334 j y 343 j |

## Motor de reglas

Cada variante del nomenclador tiene una regla declarativa en JSON, versionada con fecha de vigencia. Un servicio `ReglasLicenciaService` la evalúa al crear, editar y presentar una solicitud, y otra vez al autorizarla. Así, si cambia la normativa se carga una regla nueva sin tocar código, y las solicitudes viejas se siguen evaluando con la regla que estaba vigente en su fecha.

### Campos de la regla

| Campo | Valores | Ejemplo (1.1.3, enfermedad común, interino) |
| --- | --- | --- |
| `revista` | TITULAR, INTERINO, TRANSITORIO, SUPLENTE | INTERINO |
| `unidad` | CORRIDOS, HABILES, LABORABLES, MINUTOS\_JORNADA, SIN\_TOPE | CORRIDOS |
| `periodoTope` | ANIO\_CALENDARIO, ANIO\_ESCOLAR, DECENIO, CARRERA, POR\_EVENTO, MANDATO | ANIO\_CALENDARIO |
| `tope` | número o escalones por antigüedad | `[{antigMin: "4m", ambito: "cargo+establecimiento", dias: 30}, {dias: 10}]` |
| `tramosHaberes` | lista de tramos con su porcentaje | `[{hasta: "2a", pct: 100}, {hasta: "3a", pct: 50}]` en 1.2 |
| `acumulaDiscontinuos` | boolean | true |
| `alcanceCargos` | TODOS (simultánea) o SELECCION | TODOS |
| `requisitos` | antigüedad mínima, sexo según el legajo, jornada mayor a 4 h, no estar frente a curso, etc. | — |
| `documentacion` | lista con plazo de presentación | certificado y dictamen de Reconocimientos Médicos en 24 h desde el reintegro |
| `excluyeCon` | códigos incompatibles en simultáneo | — |
| `autoridad` | DIRECTOR, SUPERVISOR, DIRECTOR\_REGIONAL, SUBSECRETARIO, MINISTRO, BIENESTAR, JUNTA, SUPERIOR\_INMEDIATO | DIRECTOR |
| `sensible` / `reservada` | boolean | sensible = true |
| `origen` | SOLICITUD, AUTOMATICA, NOVEDAD\_RRHH | SOLICITUD |
| `vigencia` | desde y hasta | 2026-01-01 a — |

### Servicios de cálculo

- **Calendario laboral.** Feriados nacionales y provinciales, receso escolar y asuetos por institución. Con eso se calculan los días hábiles.
- **Días laborables por docente.** Los días en que el docente tiene obligaciones según los horarios de sus designaciones. Un duelo de 8 días laborables para alguien que trabaja martes y jueves dura casi un mes calendario.
- **Antigüedad.** Se calcula desde las designaciones en tres ámbitos: cargo y establecimiento, sistema, y como titular. Si se puede, se toma del legajo cargado; si no, se informa a mano con un respaldo adjunto.
- **Saldos.** Para cada docente, variante y período: días usados, días restantes y el tramo de haberes actual. Se recalculan al autorizar, anular o interrumpir una licencia.

### Validaciones al presentar

1. La variante existe para la situación de revista de cada designación afectada.
2. Se cumplen los requisitos de antigüedad y los demás requisitos de la regla.
3. No se supera el tope del período. Si se supera, el sistema ofrece partir la solicitud: lo que entra en el tope y el resto como prórroga (art. 347) o sin goce, según corresponda.
4. Si el motivo es de salud, se incluyen todas las designaciones del docente.
5. No hay superposición con licencias incompatibles, ni con asuntos particulares o fuerza mayor en curso.
6. La fecha del evento (casamiento, examen, fallecimiento) cae dentro del período, cuando la regla lo exige.
7. Las reglas de inasistencias (2.13) cuentan por mes y por año y avisan cuando un interino o suplente llega al umbral de baja de los arts. 336 y 345.

Las validaciones de topes y requisitos son advertencias bloqueantes que solo puede saltar un usuario con permiso `licencias.excepcion`, dejando registrado el motivo y el instrumento legal. Los topes del nomenclador son normativos, pero hay casos excepcionales que resuelve la autoridad y el sistema no puede impedirlos.

## Brechas: proceso actual y sistema actual

Hoy Secretaría carga cada licencia al menos cuatro veces y trabaja con un dato que el sistema todavía no modela bien: la situación de revista de cada materia. Las brechas se agrupan en lo que falta en el sistema y lo que reemplaza a las planillas.

### Proceso actual (según la investigación)

| Hoy | En Impulso License |
| --- | --- |
| Ingreso por mail, cuaderno de inasistencias y, a veces, WhatsApp | El docente carga la solicitud o la comunica oralmente. Si llega por otro medio, Secretaría la carga en su nombre y registra el **canal de ingreso** y la fecha y hora del aviso (arts. 313 d y 326). |
| Datos: nombre, DNI, fechas, tipo, materias (carrera, año, materia) y revista por materia | Se toman del legajo y de las designaciones. La solicitud solo elige el código, las fechas y las designaciones afectadas. |
| Excel con **Número de Disposición** correlativo | Numeración de disposición por institución y año, asignada al autorizar, con el documento PDF de la disposición generado. |
| Excel mensual por docente para la estadística (carga del 1 al 10 de cada mes) | Informe de estadística mensual con el formato que pide el Ministerio y alerta el día 1. |
| Word por materia con las inasistencias | Registro de asistencia diario por designación, con "ausente con aviso" o "ausente sin aviso" y su justificación. |
| Planillas **IL1** (licencias comunes) e **IL2** (extraordinarias: largo tratamiento, tareas pasivas, etc.) | Los dos informes se generan desde los mismos datos. Cada código del nomenclador tiene asignado a cuál de las dos planillas va. |

### Sistema actual frente a la ley

| Área | Hoy | Necesario |
| --- | --- | --- |
| Catálogo | Tipos genéricos con una categoría (SALUD, MATERNIDAD…) y una bandera `sensible` | Las 140 variantes del nomenclador con código de tres niveles, artículo y regla |
| Situación de revista | En la designación, pero no condiciona el tipo de licencia | Determina qué variante se aplica a cada designación afectada |
| Topes y unidades | Solo valida que la fecha final sea posterior a la inicial y que no haya superposición | Corridos, hábiles y laborables; topes por período; saldos |
| Antigüedad | No se calcula | Tres ámbitos (cargo y establecimiento, sistema, titular) |
| Autoridad | El circuito termina siempre en la institución | Elevar a una autoridad externa y registrar su instrumento legal |
| Reconocimientos Médicos | No existe | Paso obligatorio con dictamen para las licencias de salud |
| Haberes | No se registran | Porcentaje por tramo (100, 50, 25, sin goce) informado en la disposición |
| Licencias automáticas | No existen | Ascenso e incompatibilidad por subrogancia generadas desde la designación |
| Cese de interinos y suplentes | No afecta la licencia | Cancelación automática (art. 350), salvo maternidad y adopción |
| Reservadas | `confidencial` en los archivos | Violencia de género y violencia laboral: solicitud reservada completa, sin el tipo visible en el calendario ni en los reemplazos |

## Circuito de tramitación y autoridades

La escuela solo otorga lo que el nomenclador asigna al Director. Todo lo demás se eleva y queda en estado **Elevada** hasta que se carga el instrumento legal de la autoridad externa. Las licencias de salud, maternidad y familiar enfermo esperan, además, el dictamen de Reconocimientos Médicos.

&#91;embedded content: circuito de tramitación · 2 decisiones, 1 dictamen obligatorio\]

Las licencias automáticas (ascenso e incompatibilidad por subrogancia) y las novedades de RR.HH. no pasan por este circuito: entran directamente con su instrumento legal.

### Estados

Se suman dos estados a los ocho actuales: **Elevada** (esperando a una autoridad externa) y **Pendiente de dictamen** (esperando a Reconocimientos Médicos). También se agregan tres transiciones nuevas: **Interrumpida** (anual interrumpida por enfermedad, maternidad o razones de servicio, art. 315), **Cancelada por cese** (art. 350) y **Reencuadrada** (enfermedad común que pasa a largo tratamiento, art. 316).

### Autoridades del nomenclador

| Autoridad | Motivos | Qué registra la escuela |
| --- | --- | --- |
| Director | La mayoría: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.8, 2.9, 2.13 a 2.16, 2.20, 2.23 y todos los permisos | Autoriza y emite la disposición |
| Supervisor / superior inmediato | 2.3, 2.4, 2.10 y 2.11 | Eleva y registra la resolución |
| Director Regional | 1.7, 2.5 (interinos y suplentes) y 2.18 | Eleva y registra la resolución |
| Subsecretario | 2.5 (titulares), 2.7 fuera de la jurisdicción y 2.21 | Eleva y registra la resolución |
| Ministro | 1.3, 1.6, 2.6, 2.7 dentro de la jurisdicción y 2.19 | Eleva y registra la resolución |
| Dirección de Bienestar Educativo | 2.24 | Registra el otorgamiento |
| Reconocimientos Médicos | Dictamen en 1.1 a 1.5 (no otorga, dictamina) | Carga el dictamen como requisito previo |

Los roles internos (Secretaría, Directivo, RR.HH., Supervisor) se mantienen. La autoridad competente de cada variante determina quién del circuito puede autorizar, y se respeta la separación de funciones del spec de seguridad.

## Modelo de datos, módulos y renombre

Se agregan seis entidades y se amplían cuatro. Todo entra en migraciones Prisma nuevas, sobre la base ya remediada en el spec de seguridad. `SensitiveDataPolicy` toma la marca de sensible y de reservada desde la regla de cada variante.

### Entidades nuevas

| Entidad | Campos clave | Para qué |
| --- | --- | --- |
| `MotivoLicencia` | `agrupacion`, `codigo` ("1.1"), `nombre`, `planillaIL` (IL1, IL2 o ninguna) | Nivel motivo del nomenclador |
| `VarianteLicencia` | `codigo` ("1.1.3"), `motivoId`, `encuadreLegal` ("331-A"), `revista`, `formaPago`, `autoridad`, `observaciones` | Nivel variante; reemplaza a `TipoLicencia` |
| `ReglaLicencia` | `varianteId`, `version`, `vigenciaDesde`, `vigenciaHasta`, `definicion` (JSON) | Regla evaluable y versionada |
| `Feriado` / `CalendarioInstitucional` | `fecha`, `alcance` (nacional, provincial o institución), `tipo` (feriado, receso o asueto) | Base del cálculo de días hábiles |
| `SaldoLicencia` | `docenteId`, `motivoId`, `periodo`, `usados`, `tramoHaberes` | Lectura rápida de topes (se recalcula) |
| `InstrumentoLegal` | `tipo` (disposición, resolución o dictamen), `numero`, `fecha`, `emisor`, `archivoId` | Disposición de la escuela, resolución del Ministerio o dictamen de Reconocimientos Médicos |

### Entidades que se amplían

- **`SolicitudLicencia`:** `varianteId` por cada designación afectada, `canalIngreso` (sistema, mail, cuaderno, WhatsApp u oral), `avisoEn` (fecha y hora), `fechaEvento`, `diasComputados`, `pctHaberes`, `origen`, `solicitudPadreId` (para prórrogas e interrupciones) y `reservada`.
- **`SolicitudDesignacion`:** la variante y la revista se guardan **congeladas** al presentar. Si la revista cambia después, la licencia ya otorgada no cambia.
- **`Designacion`:** `revista`, `fechaToma`, `fechaCese`, `motivoCese`, `sinTermino` (para suplencias) y horarios con días de la semana.
- **`Docente`:** `fechaIngresoSistema` y `fechaNacimiento` (necesaria para el natalicio). El sexo solo se usa si una regla lo exige y nunca se infiere.

### Módulos backend

- `nomenclador`: importador del Excel oficial con vista previa de diferencias antes de aplicar, y ABM de reglas.
- `reglas`: `ReglasLicenciaService`, calendario y antigüedad.
- `disposiciones`: numeración, plantilla PDF e `InstrumentoLegal`.
- `informes`: IL1, IL2, estadística mensual, licencias por docente para el concepto anual, y registro de prórrogas del art. 347.
- `asistencias`: registro diario por designación con aviso y justificación.

### Renombre a Impulso License

| Ámbito | Cambio |
| --- | --- |
| Producto | Nombre visible, título del SPA, favicon y logos con la marca Impulso. Correos con remitente "Impulso License". |
| Código | `package.json` (`impulso-license-backend` y `impulso-license-frontend`), README y docs. Los nombres de módulos internos no cambian. |
| Infraestructura | Servicios de `docker-compose` y nombre de la base nueva `impulso_license`, con migración de datos desde la base anterior. |
| Documentos | La disposición y los informes PDF y XLSX llevan el encabezado nuevo. La numeración `LIC-` no cambia, para no romper la correlatividad. |
| Licencia de software | No confundir con la palabra "license" del nombre: el producto no cambia de licencia de uso. |

## Criterios de aceptación, plan y preguntas abiertas

El trabajo se entrega en 5 fases. La adecuación se considera terminada cuando Secretaría pueda dejar de usar las cuatro planillas actuales durante un mes completo sin perder información.

### Plan por fases

1. **Nomenclador y reglas.** Importador del Excel, entidades `MotivoLicencia`, `VarianteLicencia` y `ReglaLicencia`, y las reglas de las agrupaciones 1 a 3. Las diferencias D1 a D8 quedan configuradas como se indica arriba.
2. **Cálculo.** Calendario laboral, días laborables por docente, antigüedad y saldos. Tests de tabla con un caso por variante.
3. **Solicitud y circuito.** Elección de variante por designación, validaciones, paso de Reconocimientos Médicos, elevación a autoridad externa, licencias automáticas, cancelación por cese e interrupción de la anual.
4. **Documentos e informes.** Disposición numerada, IL1, IL2, estadística mensual, registro del art. 347 y asistencia diaria por designación.
5. **Renombre y migración.** Marca Impulso License, migración de las solicitudes existentes a códigos del nomenclador (con revisión manual de las que no se puedan mapear) y carga histórica del Excel de disposiciones.

### Criterios de aceptación

- [ ] Las \~140 variantes del nomenclador 2026 están cargadas, con su artículo y su regla, y un importador reproduce la carga desde el Excel oficial.
- [ ] Un interino con 3 meses en el cargo no puede pedir más de 10 días de enfermedad común en el año; con 5 meses, el tope es 30 (art. 331 a).
- [ ] Una licencia de salud de un docente con dos designaciones afecta a ambas automáticamente; la de familiar enfermo permite elegir.
- [ ] Un duelo de primer grado para un docente que trabaja martes y jueves computa 8 días laborables según su horario, no 8 corridos.
- [ ] Un matrimonio cuya fecha de casamiento cae fuera del período pedido es rechazado.
- [ ] Un titular que ya usó asuntos particulares hace menos de 2 años no puede volver a pedirla (art. 318 a).
- [ ] Una licencia de largo tratamiento pasa del tramo del 100 % al del 50 % al cumplir los 2 años acumulados, y la disposición lo indica.
- [ ] Al cesar un suplente porque se presenta el titular, sus licencias en curso se cancelan, salvo maternidad y adopción.
- [ ] Una licencia que otorga el Ministerio queda en estado "Elevada" hasta que se carga la resolución con su número.
- [ ] Una licencia de enfermedad sin dictamen de Reconocimientos Médicos a las 24 h del reintegro pasa las faltas a injustificadas, con aviso a Secretaría.
- [ ] Un interino con 3 inasistencias particulares en el mes genera una alerta de baja para el director (art. 336).
- [ ] Una licencia por violencia de género no muestra su tipo en el calendario, en los reemplazos, en los informes generales ni en la auditoría para quien no tenga `datos_sensibles.ver`.
- [ ] Los informes IL1, IL2 y la estadística mensual de un mes de prueba coinciden con las planillas que Secretaría armó a mano para el mismo mes.

### Preguntas abiertas

- **Diferencias D1 a D8.** ¿Qué rige cuando el nomenclador 2026 y el texto de la ley no coinciden? Hay que confirmarlo con la Dirección de Nivel o la regional.
- **Exámenes para suplentes.** El art. 338 incluye exámenes para suplentes, pero el art. 342 no fija un tope y el nomenclador no tiene variante. ¿Se aplica la del interino?
- **Formato de la estadística mensual y de las planillas IL1 e IL2.** Hace falta un ejemplo real de cada una para replicar las columnas.
- **Disposición.** ¿La numeración es anual o continúa entre años? ¿Hay un modelo de texto oficial?
- **Reconocimientos Médicos.** ¿El dictamen llega en papel, por mail o por algún sistema provincial con el que se pueda integrar?
- **Reglamentación.** Varios artículos remiten a la reglamentación del Ministerio (arts. 322, 323 y 347). Si hay decretos o resoluciones vigentes con más detalle, conviene sumarlos como fuente.
