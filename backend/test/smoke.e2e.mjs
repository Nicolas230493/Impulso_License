/**
 * Prueba de humo de punta a punta contra una API en ejecución con datos semilla recién cargados.
 * Uso (base descartable): NODE_ENV=test SEED_ADMIN_PASSWORD=… npm run db:seed && npm run start:dev, luego:
 *   SEED_ADMIN_PASSWORD=… node test/smoke.e2e.mjs
 * La API debe confiar en el proxy local (TRUSTED_PROXIES=loopback o 127.0.0.1). Por defecto la prueba usa 127.0.0.1 y
 * no localhost: Node resuelve localhost a ::1, y con TRUSTED_PROXIES=127.0.0.1 no se confiaría en X-Forwarded-For.
 * Cada petición simula una IP distinta (X-Forwarded-For) para no chocar con el límite de logins por IP; el límite por
 * cuenta sí aplica.
 */
// Lee backend/.env (SEED_ADMIN_PASSWORD, API_URL) sin pisar variables ya definidas: el mismo comando sirve en
// Linux y en Windows, sin anteponer VARIABLE=valor. Requiere Node 20.12+ (en versiones anteriores, definirlas a mano).
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* sin .env o Node sin loadEnvFile */ }
const API = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD (la misma usada al sembrar la base).'); process.exit(2); }
const ipAzar = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let fallos = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) { fallos++; if (extra) console.log('   ', JSON.stringify(extra).slice(0, 600)); } };
async function req(token, method, path, body, isForm) {
  const headers = { 'X-Requested-With': 'EduLicencias', 'X-Forwarded-For': ipAzar() };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}
async function login(email) {
  const r = await req(null, 'POST', '/auth/login', { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login ${email}: ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken, cookie: r.headers.get('set-cookie'), usuario: r.data.usuario };
}
const iso = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const laura = await login('laura.garcia@demo.edu.ar');
const secre = await login('secretaria@demo.edu.ar');
const dire = await login('direccion@demo.edu.ar');
const rrhh = await login('rrhh@demo.edu.ar');
const admin = await login('admin@demo.edu.ar');
ok(laura.usuario.permisos.includes('licencias.solicitar'), 'login docente con permisos efectivos');
ok((await req(null, 'POST', '/auth/login', { email: 'laura.garcia@demo.edu.ar', password: 'mala' })).status === 401, 'login con contraseña errónea → 401');

const yo = (await req(laura.token, 'GET', '/docentes/yo')).data;
ok(yo.designaciones.length === 2, 'docente consulta su legajo con 2 designaciones');
ok((await req(laura.token, 'GET', '/docentes')).status === 403, 'docente no puede listar todos los legajos');
ok((await req(laura.token, 'GET', `/docentes/${(await req(secre.token, 'GET', '/docentes?buscar=Fern')).data.items[0].id}`)).status === 403, 'docente no puede ver el legajo de otro');

const tipos = (await req(laura.token, 'GET', '/tipos-licencia?vigentes=true')).data;
const enf = tipos.find((t) => t.codigo === 'ENF-CORTA');
const designacionIds = yo.designaciones.map((d) => d.id);

let r = await req(laura.token, 'POST', '/solicitudes', { tipoLicenciaId: enf.id, designacionIds, fechaDesde: iso(5), fechaHasta: iso(2) });
ok(r.status === 400, 'rechaza fecha final anterior a la inicial', r.data);

r = await req(laura.token, 'POST', '/solicitudes', { tipoLicenciaId: enf.id, designacionIds, fechaDesde: iso(-2), fechaHasta: iso(4), motivo: 'Gripe' });
ok(r.status === 201 && r.data.estado === 'BORRADOR' && r.data.diasComputados === 7, `crea borrador ${r.data.numero} con 7 días corridos`, r.data);
const sol = r.data;

r = await req(laura.token, 'POST', `/solicitudes/${sol.id}/presentar`);
ok(r.status === 422 && r.data.errores?.some((e) => e.includes('Certificado médico')), 'no permite presentar sin documentación obligatoria', r.data);

const fd = new FormData();
fd.append('tipoDocumento', 'Certificado médico');
fd.append('archivo', new Blob([Buffer.from('%PDF-1.4\n%prueba\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')], { type: 'application/pdf' }), 'certificado.pdf');
r = await req(laura.token, 'POST', `/solicitudes/${sol.id}/documentos`, fd, true);
ok(r.status === 201 && r.data.archivo.confidencial === true, 'adjunta certificado (confidencial: tipo sensible)', r.data);
const archivoId = r.data.archivo.id;

const fdMalo = new FormData();
fdMalo.append('tipoDocumento', 'Otro');
fdMalo.append('archivo', new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }), 'falso.pdf');
ok((await req(laura.token, 'POST', `/solicitudes/${sol.id}/documentos`, fdMalo, true)).status === 400, 'rechaza archivo con firma binaria inválida');

r = await req(laura.token, 'POST', `/solicitudes/${sol.id}/presentar`);
ok(r.status === 200 && r.data.estado === 'PENDIENTE', 'presenta la solicitud → PENDIENTE', r.data);

const bandeja = (await req(secre.token, 'GET', '/autorizaciones/bandeja')).data;
ok(bandeja.pendientes.some((s) => s.id === sol.id), 'aparece en la bandeja de Secretaría');
ok((await req(secre.token, 'GET', '/notificaciones/contador')).data.sinLeer > 0, 'Secretaría recibió notificación de nueva solicitud');

ok((await req(dire.token, 'POST', `/solicitudes/${sol.id}/decision`, { decision: 'APROBADA' })).status === 409, 'Dirección no puede decidir antes de la recepción');
// Separación de funciones: recibe RR.HH., así Secretaría (paso 1) no decide algo que ella misma recibió.
r = await req(rrhh.token, 'POST', `/solicitudes/${sol.id}/tomar`);
ok(r.status === 200 && r.data.estado === 'EN_REVISION', 'RR.HH. recibe → EN_REVISION', r.data);
ok((await req(secre.token, 'POST', `/solicitudes/${sol.id}/decision`, { decision: 'RECHAZADA' })).status === 400, 'rechazo sin fundamento → 400');
ok((await req(dire.token, 'POST', `/solicitudes/${sol.id}/decision`, { decision: 'APROBADA' })).status === 403, 'Dirección no puede saltear el paso de Secretaría');
r = await req(secre.token, 'POST', `/solicitudes/${sol.id}/decision`, { decision: 'APROBADA', observacion: 'Documentación verificada' });
ok(r.status === 200 && r.data.pasoActual === 2, 'Secretaría aprueba paso 1 → paso 2', r.data);
ok((await req(secre.token, 'POST', `/solicitudes/${sol.id}/decision`, { decision: 'APROBADA' })).status === 403, 'Secretaría no puede aprobar el paso de Dirección');

const vistaDir = (await req(dire.token, 'GET', `/solicitudes/${sol.id}`)).data;
ok(vistaDir.motivo === null && vistaDir.tipoLicencia.nombre === 'Licencia con reserva', 'Dirección no ve el motivo ni el tipo de licencia médica');
ok(vistaDir.acciones.decidir === true, 'Dirección tiene la acción "decidir" habilitada');
ok((await req(dire.token, 'GET', `/archivos/${archivoId}`)).status === 403, 'Dirección no puede descargar el certificado médico');
ok((await req(rrhh.token, 'GET', `/archivos/${archivoId}`)).status === 200, 'RR.HH. (datos sensibles) sí puede descargarlo');
ok((await req(laura.token, 'GET', `/archivos/${archivoId}`)).status === 200, 'la titular puede descargar su certificado');

r = await req(dire.token, 'POST', `/solicitudes/${sol.id}/decision`, { decision: 'APROBADA' });
ok(r.status === 200 && r.data.estado === 'AUTORIZADA', 'Dirección autoriza → AUTORIZADA', r.data);

// Superposición
r = await req(laura.token, 'POST', '/solicitudes', { tipoLicenciaId: enf.id, designacionIds: [designacionIds[0]], fechaDesde: iso(3), fechaHasta: iso(6) });
const sol2 = r.data;
r = await req(laura.token, 'POST', `/solicitudes/${sol2.id}/presentar`);
ok(r.status === 422 && r.data.errores?.some((e) => e.includes('superpone')), 'detecta superposición con la licencia autorizada', r.data);
ok((await req(laura.token, 'POST', `/solicitudes/${sol2.id}/anular`, { comentario: 'Error de carga' })).data.estado === 'ANULADA', 'la docente anula su borrador');

// Reglas: máximo por solicitud (15 días)
r = await req(laura.token, 'POST', '/solicitudes', { tipoLicenciaId: enf.id, designacionIds, fechaDesde: iso(30), fechaHasta: iso(50) });
const sol3 = r.data;
r = await req(laura.token, 'POST', `/solicitudes/${sol3.id}/presentar`);
ok(r.status === 422 && r.data.errores?.some((e) => e.includes('máximo de 15')), 'aplica regla de máximo de días por solicitud', r.data);

// Reemplazo con cobertura parcial
const detalle = (await req(rrhh.token, 'GET', `/solicitudes/${sol.id}`)).data;
const d0 = detalle.designaciones[0];
const docs = (await req(rrhh.token, 'GET', '/docentes?porPagina=50')).data.items;
const sosa = docs.find((x) => x.apellido === 'Sosa'), lopez = docs.find((x) => x.apellido === 'López');
const horarios = (await req(rrhh.token, 'GET', `/designaciones?docenteId=${yo.id}`)).data.find((x) => x.id === d0.id).horarios;
const base = { solicitudId: sol.id, designacionId: d0.id, fechaDesde: iso(-2), fechaHasta: iso(4) };
r = await req(rrhh.token, 'POST', '/reemplazos', { ...base, suplentes: [{ suplenteId: sosa.id, fechaDesde: iso(-2), fechaHasta: iso(4), horarioIds: [horarios[0].id] }, { suplenteId: lopez.id, fechaDesde: iso(-2), fechaHasta: iso(4) }] });
ok(r.status === 400, 'rechaza doble cobertura de la misma franja', r.data);
r = await req(rrhh.token, 'POST', '/reemplazos', { ...base, fechaHasta: iso(10), suplentes: [{ suplenteId: sosa.id, fechaDesde: iso(-2), fechaHasta: iso(4) }] });
ok(r.status === 400, 'rechaza reemplazo que excede el período de la licencia', r.data);
r = await req(rrhh.token, 'POST', '/reemplazos', { ...base, suplentes: [{ suplenteId: sosa.id, fechaDesde: iso(-2), fechaHasta: iso(4), horarioIds: [horarios[0].id] }, { suplenteId: lopez.id, fechaDesde: iso(-2), fechaHasta: iso(4), horarioIds: [horarios[1].id] }] });
ok(r.status === 201 && r.data.suplentes.length === 2, 'registra reemplazo con cobertura parcial por dos suplentes', r.data);
const rem = r.data;
r = await req(rrhh.token, 'POST', `/reemplazos/${rem.id}/estado`, { estado: 'ACTIVO' });
ok(r.status === 200 && r.data.estado === 'ACTIVO', 'activa el reemplazo', r.data);

// Panel / calendario / informes
const panel = (await req(dire.token, 'GET', '/reportes/panel')).data;
ok(panel.docentesConLicencia === 1 && panel.reemplazosActivos === 1, `panel: ${panel.docentesConLicencia} docente con licencia, ${panel.reemplazosActivos} reemplazo activo`, panel);
const cal = (await req(dire.token, 'GET', `/reportes/calendario?desde=${iso(-10)}&hasta=${iso(20)}`)).data;
ok(cal.eventos.some((e) => e.tipo === 'licencia') && cal.eventos.some((e) => e.tipo === 'reemplazo') && cal.eventos.some((e) => e.tipo === 'reincorporacion'), 'calendario con licencia, reemplazo y reincorporación prevista');
ok(cal.eventos.find((e) => e.tipo === 'licencia').detalle === 'Licencia con reserva', 'calendario oculta el tipo de licencia médica a Dirección');

// Asistencia
const plan = (await req(secre.token, 'GET', `/asistencias?fecha=${iso(0)}`)).data;
ok(plan.filas.some((f) => f.docente.id === yo.id && f.licencia), 'planilla de asistencia marca a la docente en licencia');

// Reincorporación
r = await req(rrhh.token, 'POST', `/solicitudes/${sol.id}/reincorporacion`, { fechaEfectiva: iso(3), observaciones: 'Alta médica anticipada' });
ok(r.status === 200 && r.data.estado === 'FINALIZADA', 'registra reincorporación anticipada → FINALIZADA', r.data);
const rem2 = (await req(rrhh.token, 'GET', `/reemplazos/${rem.id}`)).data;
ok(rem2.estado === 'FINALIZADO' && rem2.fechaHasta.startsWith(iso(2)), 'el reemplazo finaliza el día previo a la reincorporación', rem2);

for (const fmt of ['xlsx', 'pdf']) {
  r = await req(rrhh.token, 'GET', `/reportes/informes/licencias-por-periodo?formato=${fmt}`);
  ok(r.status === 200 && r.data.byteLength > 500, `exporta informe en ${fmt.toUpperCase()} (${r.data.byteLength} bytes)`);
}
ok((await req(laura.token, 'GET', '/reportes/informes')).status === 403, 'docente no accede a informes');

const hist = (await req(laura.token, 'GET', `/solicitudes/${sol.id}`)).data.historial.map((h) => h.estadoNuevo).join(' → ');
ok(hist === 'BORRADOR → PENDIENTE → EN_REVISION → EN_REVISION → AUTORIZADA → FINALIZADA', `historial: ${hist}`);
const aud = (await req(admin.token, 'GET', `/auditoria?entidadId=${sol.id}&porPagina=100`)).data;
ok(aud.total >= 8, `auditoría registró ${aud.total} movimientos de la solicitud`);
ok((await req(dire.token, 'GET', '/auditoria')).status === 403, 'Dirección no accede a auditoría');

// Refresh token
const rt = laura.cookie.split(';')[0];
let rr = await fetch(API + '/auth/refresh', { method: 'POST', headers: { Cookie: rt, 'X-Requested-With': 'EduLicencias', 'X-Forwarded-For': ipAzar() } });
ok(rr.status === 200, 'refresh con cookie rota la sesión');
rr = await fetch(API + '/auth/refresh', { method: 'POST', headers: { Cookie: rt } });
ok(rr.status === 403, 'refresh sin header anti-CSRF → 403');
rr = await fetch(API + '/auth/refresh', { method: 'POST', headers: { Cookie: rt, 'X-Requested-With': 'EduLicencias' } });
ok(rr.status === 401, 'reutilizar un refresh token ya rotado → 401 (y revoca sesiones)');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
