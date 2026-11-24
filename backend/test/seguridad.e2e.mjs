/**
 * E2E de seguridad del spec de remediación (un caso por hallazgo verificable por HTTP).
 * Requisitos: API en ejecución con NODE_ENV=test y TRUSTED_PROXIES=127.0.0.1, sobre una base recién sembrada
 * con SEED_ADMIN_PASSWORD (puede correr después de smoke.e2e.mjs). Uso: SEED_ADMIN_PASSWORD=… node test/seguridad.e2e.mjs
 */
import ExcelJS from 'exceljs';

// Lee backend/.env (SEED_ADMIN_PASSWORD, API_URL) sin pisar variables ya definidas: el mismo comando sirve en
// Linux y en Windows, sin anteponer VARIABLE=valor. Requiere Node 20.12+ (en versiones anteriores, definirlas a mano).
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* sin .env o Node sin loadEnvFile */ }
const API = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD (la misma usada al sembrar la base).'); process.exit(2); }

let fallos = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) { fallos++; if (extra !== undefined) console.log('   ', JSON.stringify(extra).slice(0, 600)); } };
const ipAzar = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
async function req(token, method, path, body, { form = false, ip = ipAzar(), headers: extra = {} } = {}) {
  const headers = { 'X-Requested-With': 'EduLicencias', 'X-Forwarded-For': ip, ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !form) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: form ? body : body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}
async function login(email, password = PASSWORD) {
  const r = await req(null, 'POST', '/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken, usuario: r.data.usuario };
}
const iso = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pdf = (extra = '') => new Blob([Buffer.from(`%PDF-1.4\n%prueba\n1 0 obj<<${extra}>>endobj\ntrailer<<>>\n%%EOF`)], { type: 'application/pdf' });
const adjuntar = (token, solId, tipoDocumento, archivo = pdf(), version) => {
  const fd = new FormData();
  fd.append('tipoDocumento', tipoDocumento);
  if (version !== undefined) fd.append('version', String(version));
  fd.append('archivo', archivo, 'doc.pdf');
  return req(token, 'POST', `/solicitudes/${solId}/documentos`, fd, { form: true });
};
const MOTIVO = 'Diagnóstico confidencial de prueba';

const laura = await login('laura.garcia@demo.edu.ar');
const martin = await login('martin.fernandez@demo.edu.ar');
const secre = await login('secretaria@demo.edu.ar');
const dire = await login('direccion@demo.edu.ar');
const rrhh = await login('rrhh@demo.edu.ar');
const repre = await login('representante@demo.edu.ar');
const admin = await login('admin@demo.edu.ar');

const yo = (await req(laura.token, 'GET', '/docentes/yo')).data;
const tipos = (await req(laura.token, 'GET', '/tipos-licencia?vigentes=true')).data;
const tipo = (c) => tipos.find((t) => t.codigo === c);
const desigLaura = yo.designaciones.map((d) => d.id);

// ─────────── Fase 1: datos sensibles ───────────
let r = await req(laura.token, 'POST', '/solicitudes', { tipoLicenciaId: tipo('ENF-CORTA').id, designacionIds: [desigLaura[1]], fechaDesde: iso(60), fechaHasta: iso(62), motivo: MOTIVO });
ok(r.status === 201, 'docente crea solicitud de salud con motivo', r.data);
const solSalud = r.data;
ok(/^LIC-DEMO-\d{4}-\d{6}$/.test(solSalud.numero), `[22] numeración por institución: ${solSalud.numero}`);

for (const [nombre, u] of [['SECRETARIA', secre], ['DIRECTIVO', dire], ['SUPERVISOR', repre]]) {
  r = await req(u.token, 'GET', `/docentes/${yo.id}/licencias`);
  const fila = r.data.find?.((s) => s.id === solSalud.id);
  const texto = JSON.stringify(r.data);
  ok(r.status === 200 && fila && !texto.includes(MOTIVO) && fila.tipoLicencia.nombre === 'Licencia con reserva' && !texto.includes('Enfermedad'),
    `[1] ${nombre}: GET /docentes/:id/licencias sin motivo ni tipo sensible`, fila);
  r = await req(u.token, 'GET', `/solicitudes/${solSalud.id}`);
  if (r.status === 200) ok(!JSON.stringify(r.data).includes(MOTIVO) && r.data.tipoLicencia.reservado === true, `[1] ${nombre}: detalle de solicitud enmascarado`, r.data.tipoLicencia);
}
r = await req(rrhh.token, 'GET', `/docentes/${yo.id}/licencias`);
ok(r.data.find((s) => s.id === solSalud.id)?.tipoLicencia.nombre === 'Enfermedad de corto tratamiento', '[1] RR.HH. (datos_sensibles.ver) ve el tipo real');
r = await req(laura.token, 'GET', `/solicitudes/${solSalud.id}`);
ok(r.data.motivo === MOTIVO, '[1] la titular ve su propio motivo');

r = await req(repre.token, 'GET', '/auditoria?entidad=solicitud&porPagina=200');
ok(r.status === 200 && !JSON.stringify(r.data).includes(MOTIVO), '[2] SUPERVISOR: GET /auditoria?entidad=solicitud sin valores de motivo');
r = await req(admin.token, 'GET', `/auditoria?entidadId=${solSalud.id}`);
ok(!JSON.stringify(r.data).includes(MOTIVO), '[2] el motivo no se guarda en la auditoría (ni siquiera lo ve ADMIN)');

ok((await adjuntar(laura.token, solSalud.id, 'Certificado médico')).status === 201, 'adjunta certificado');
ok((await req(laura.token, 'POST', `/solicitudes/${solSalud.id}/presentar`)).status === 200, 'presenta → PENDIENTE');
r = await req(dire.token, 'GET', '/reportes/informes/solicitudes-pendientes');
const filaInf = r.data.filas?.find((f) => f.numero === solSalud.numero);
ok(filaInf?.tipo === 'Licencia con reserva', '[3] informe (JSON) sin DATOS_SENSIBLES_VER muestra "Licencia con reserva"', filaInf);
r = await req(dire.token, 'GET', '/reportes/informes/solicitudes-pendientes?formato=xlsx');
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(r.data));
const celdas = []; wb.worksheets[0].eachRow((row) => row.eachCell((c) => celdas.push(String(c.value))));
ok(celdas.includes('Licencia con reserva') && !celdas.some((c) => c.includes('Enfermedad')), '[3] XLSX sin DATOS_SENSIBLES_VER enmascara el tipo');

r = await req(laura.token, 'POST', '/solicitudes', { tipoLicenciaId: tipo('ATN-FAM').id, designacionIds: [desigLaura[1]], fechaDesde: iso(70), fechaHasta: iso(71) });
const solFam = r.data;
r = await adjuntar(laura.token, solFam.id, 'Certificado médico del familiar');
ok(r.status === 201 && r.data.archivo.confidencial === true, '[11] certificado de ATN-FAM queda confidencial', r.data);
ok((await req(secre.token, 'GET', `/archivos/${r.data.archivo.id}`)).status === 403, '[11] no se descarga con solo docentes.ver');

const fdConf = new FormData();
fdConf.append('tipo', 'DNI'); fdConf.append('confidencial', 'false'); fdConf.append('archivo', pdf(), 'dni.pdf');
ok((await req(secre.token, 'POST', `/docentes/${yo.id}/documentos`, fdConf, { form: true })).status === 400, '[12] campo confidencial en el multipart → 400 (whitelist)');
const fdOk = new FormData();
fdOk.append('tipo', 'DNI'); fdOk.append('archivo', pdf(), 'dni.pdf');
r = await req(secre.token, 'POST', `/docentes/${yo.id}/documentos`, fdOk, { form: true });
ok(r.status === 201 && r.data.archivo.confidencial === true, '[12] documento personal nace confidencial', r.data);
ok((await req(secre.token, 'PATCH', `/docentes/${yo.id}/documentos/${r.data.id}/confidencial`, { confidencial: false })).status === 403, '[12] sin datos_sensibles.ver no se puede bajar la reserva');
ok((await req(rrhh.token, 'PATCH', `/docentes/${yo.id}/documentos/${r.data.id}/confidencial`, { confidencial: false })).status === 200, '[12] con datos_sensibles.ver sí (auditado)');

// ─────────── Fase 2: roles ───────────
const roles = (await req(admin.token, 'GET', '/roles')).data;
const rolAdmin = roles.find((x) => x.codigo === 'ADMIN');
ok((await req(admin.token, 'PUT', `/roles/${rolAdmin.id}`, { codigo: 'ADMIN', nombre: 'X', permisos: [] })).status === 403, '[4] editar un rol de sistema → 403');
r = await req(admin.token, 'POST', '/roles', { codigo: 'GESTOR_USUARIOS', nombre: 'Gestor de usuarios', permisos: ['usuarios.gestionar'] });
ok(r.status === 201, 'admin crea rol con usuarios.gestionar', r.data);
const pwGestor = 'GestorPrueba2026x';
r = await req(admin.token, 'POST', '/usuarios', { email: 'gestor@demo.edu.ar', nombre: 'Ges', apellido: 'Tor', password: pwGestor, rolIds: [r.data.id] });
ok(r.status === 201, 'admin crea usuario gestor', r.data);
const gestorId = r.data.id;
ok((await req(admin.token, 'POST', '/usuarios', { email: 'gestor@demo.edu.ar', nombre: 'a', apellido: 'b', password: pwGestor, rolIds: [] })).data?.message === 'El registro ya existe', '[20] P2002 sin nombres de columnas');
const gestor = await login('gestor@demo.edu.ar', pwGestor);
ok((await req(gestor.token, 'PATCH', `/usuarios/${gestorId}`, { rolIds: [rolAdmin.id] })).status === 403, '[4] usuario con usuarios.gestionar no puede asignarse ADMIN');
const usuarios = (await req(admin.token, 'GET', '/usuarios?porPagina=100')).data.items;
const idSecre = usuarios.find((u) => u.email === 'secretaria@demo.edu.ar').id;
ok((await req(gestor.token, 'PATCH', `/usuarios/${idSecre}`, { rolIds: [rolAdmin.id] })).status === 403, '[4] ni asignárselo a otro');
ok((await req(gestor.token, 'POST', '/roles', { codigo: 'ESCALADA', nombre: 'x', permisos: ['datos_sensibles.ver'] })).status === 403, '[4] sin roles.gestionar no crea roles');
ok((await req(gestor.token, 'POST', `/usuarios/${usuarios.find((u) => u.email === 'admin@demo.edu.ar').id}/reset-password`, { password: 'Tomado2026xyz' })).status === 403, '[4] no puede resetear la clave de un ADMIN');

// ─────────── Fase 3: sesión ───────────
ok((await req(gestor.token, 'POST', '/auth/cambiar-password', { actual: pwGestor, nueva: 'GestorNueva2026y' })).status === 204, 'gestor cambia su contraseña');
ok((await req(gestor.token, 'GET', '/auth/me')).status === 401, '[17] access token emitido antes del cambio de contraseña → 401');

const victima = 'diego.romero@demo.edu.ar';
for (let i = 0; i < 5; i++) await req(null, 'POST', '/auth/login', { email: victima, password: 'Incorrecta123' });
let t0 = Date.now();
const bloqueada = await req(null, 'POST', '/auth/login', { email: victima, password: PASSWORD });
const tBloq = Date.now() - t0; t0 = Date.now();
const inexistente = await req(null, 'POST', '/auth/login', { email: 'no-existe@demo.edu.ar', password: PASSWORD });
const tInex = Date.now() - t0;
ok(bloqueada.status === 401 && inexistente.status === 401 && JSON.stringify(bloqueada.data) === JSON.stringify(inexistente.data),
  '[18] cuenta bloqueada e inexistente: misma respuesta', [bloqueada.data, inexistente.data]);
ok(Math.abs(tBloq - tInex) < Math.max(tBloq, tInex) * 0.6 + 50, `[18] tiempos similares (${tBloq} ms vs ${tInex} ms)`);
let limitado = false;
for (let i = 0; i < 14 && !limitado; i++) limitado = (await req(null, 'POST', '/auth/login', { email: victima, password: 'Incorrecta123' })).status === 429;
ok(limitado, '[19] X-Forwarded-For distinto en cada intento contra la misma cuenta → límite por cuenta (429)');

const ipFija = '10.200.200.200';
let limRefresh = false;
for (let i = 0; i < 40 && !limRefresh; i++) limRefresh = (await req(null, 'POST', '/auth/refresh', undefined, { ip: ipFija })).status === 429;
ok(limRefresh, '[32] refresh con throttle propio (429)');

// ─────────── Fase 4: integridad del flujo ───────────
const docMartin = (await req(martin.token, 'GET', '/docentes/yo')).data;
r = await req(secre.token, 'POST', '/solicitudes', { docenteId: docMartin.id, tipoLicenciaId: tipo('RAZ-PART').id, designacionIds: [docMartin.designaciones[0].id], fechaDesde: iso(20), fechaHasta: iso(20) });
const solSecre = r.data;
ok((await req(secre.token, 'POST', `/solicitudes/${solSecre.id}/presentar`)).status === 200, 'Secretaría carga y presenta en nombre del docente');
ok((await req(secre.token, 'POST', `/solicitudes/${solSecre.id}/tomar`)).status === 403, '[13] quien la cargó no puede recibirla');
ok((await req(rrhh.token, 'POST', `/solicitudes/${solSecre.id}/tomar`)).status === 200, 'RR.HH. la recibe');
ok((await req(secre.token, 'POST', `/solicitudes/${solSecre.id}/decision`, { decision: 'APROBADA' })).status === 403, '[13] Secretaría que la creó no puede autorizarla');
ok((await req(secre.token, 'POST', `/solicitudes/${solSecre.id}/decision`, { decision: 'RECHAZADA', observacion: 'x' })).status === 403, '[13] ni rechazarla');

r = await req(laura.token, 'POST', '/solicitudes', { tipoLicenciaId: tipo('ENF-CORTA').id, designacionIds: [desigLaura[0]], fechaDesde: iso(80), fechaHasta: iso(81) });
const solBorr = r.data;
r = await adjuntar(laura.token, solBorr.id, 'Certificado médico');
ok((await req(rrhh.token, 'POST', `/solicitudes/${solBorr.id}/documentos/${r.data.id}/verificar`)).status === 409, '[14] verificar documento en BORRADOR → 409');

// [16] editar vs. cambio de estado concurrente: exactamente una gana; si gana el cambio de estado, los datos no cambian.
const antes = (await req(laura.token, 'GET', `/solicitudes/${solBorr.id}`)).data;
const [edicion, presentacion] = await Promise.all([
  req(laura.token, 'PATCH', `/solicitudes/${solBorr.id}`, { motivo: 'Cambio concurrente', version: antes.version }),
  req(laura.token, 'POST', `/solicitudes/${solBorr.id}/presentar`, { version: antes.version }),
]);
const despues = (await req(laura.token, 'GET', `/solicitudes/${solBorr.id}`)).data;
ok([edicion.status, presentacion.status].filter((s) => s === 200).length === 1 && [edicion.status, presentacion.status].includes(409),
  `[16] edición y presentación concurrentes: una gana, la otra 409 (${edicion.status}/${presentacion.status})`);
ok(presentacion.status !== 200 || despues.motivo !== 'Cambio concurrente', '[16] si se presentó, la edición no modificó los datos');
ok((await req(laura.token, 'PATCH', `/solicitudes/${solBorr.id}`, { motivo: 'Desactualizada', version: antes.version })).status === 409, '[16] editar con versión vieja → 409');

const sosa = (await req(rrhh.token, 'GET', '/docentes?buscar=Sosa')).data.items[0];
r = await req(rrhh.token, 'POST', '/reemplazos', { designacionId: docMartin.designaciones[0].id, fechaDesde: iso(90), fechaHasta: iso(92), suplentes: [{ suplenteId: sosa.id, fechaDesde: iso(90), fechaHasta: iso(92) }] });
ok(r.status === 201, 'reemplazo propuesto', r.data);
const [c1, c2] = await Promise.all([
  req(rrhh.token, 'POST', `/reemplazos/${r.data.id}/estado`, { estado: 'ACTIVO' }),
  req(rrhh.token, 'POST', `/reemplazos/${r.data.id}/estado`, { estado: 'ANULADO' }),
]);
ok([c1.status, c2.status].filter((s) => s === 200).length === 1 && [c1.status, c2.status].includes(409), `[15] dos cambios concurrentes del mismo reemplazo: uno gana, el otro 409 (${c1.status}/${c2.status})`);

// ─────────── Fase 5 ───────────
for (const clave of ['__proto__', 'constructor', 'toString']) {
  ok((await req(dire.token, 'GET', `/reportes/informes/${clave}`)).status === 404, `[25] informe "${clave}" → 404`);
}
r = await adjuntar(laura.token, solFam.id, 'Otro', pdf('/OpenAction<</S/JavaScript/JS(app.alert(1))>>'));
ok(r.status === 400, '[24] PDF con JavaScript → 400', r.data);
const archivoFam = (await req(laura.token, 'GET', `/solicitudes/${solFam.id}`)).data.documentos[0].archivo.id;
r = await req(laura.token, 'GET', `/archivos/${archivoFam}`);
ok(r.headers.get('content-disposition')?.startsWith('attachment') && r.headers.get('content-security-policy')?.includes('sandbox'), '[24] archivos: attachment + CSP sandbox');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
