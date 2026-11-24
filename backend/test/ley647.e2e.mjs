/**
 * Criterios de aceptación de la adecuación a la Ley 647-E, de punta a punta contra la API.
 * Requisitos: los mismos que smoke.e2e.mjs (NODE_ENV=test, TRUSTED_PROXIES=127.0.0.1, base recién sembrada con
 * SEED_ADMIN_PASSWORD). Puede correr después de smoke y seguridad. Uso: SEED_ADMIN_PASSWORD=… node test/ley647.e2e.mjs
 *
 * Lo que depende del paso del tiempo (tramo 100 % → 50 % a los 2 años, dictamen vencido a las 24 h, umbral de
 * inasistencias del art. 336) se prueba en los tests unitarios del motor (nomenclador.spec.ts y flujo.spec.ts).
 */
// Lee backend/.env (SEED_ADMIN_PASSWORD, API_URL) sin pisar variables ya definidas: el mismo comando sirve en
// Linux y en Windows, sin anteponer VARIABLE=valor. Requiere Node 20.12+ (en versiones anteriores, definirlas a mano).
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* sin .env o Node sin loadEnvFile */ }
const API = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!PASSWORD) { console.error('Defina SEED_ADMIN_PASSWORD (la misma usada al sembrar la base).'); process.exit(2); }
const ipAzar = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
let fallos = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) { fallos++; if (extra !== undefined) console.log('   ', JSON.stringify(extra).slice(0, 800)); } };
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
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.accessToken;
}
const iso = (n, base = new Date()) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mesesAtras = (m) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };
const pdf = (nombre, tipo) => {
  const fd = new FormData();
  fd.append('tipoDocumento', tipo);
  fd.append('archivo', new Blob([Buffer.from('%PDF-1.4\n%prueba\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')], { type: 'application/pdf' }), nombre);
  return fd;
};

const laura = await login('laura.garcia@demo.edu.ar');
const secre = await login('secretaria@demo.edu.ar');
const dire = await login('direccion@demo.edu.ar');
const rrhh = await login('rrhh@demo.edu.ar');
const admin = await login('admin@demo.edu.ar');

// ── Nomenclador cargado ────────────────────────────────────────────────────────────────────────────────────────
const nom = (await req(secre, 'GET', '/nomenclador')).data;
const M = Object.fromEntries(nom.motivos.map((m) => [m.codigo, m]));
const variantes = nom.motivos.flatMap((m) => m.variantes);
ok(variantes.length >= 140 && variantes.every((v) => v.encuadreLegal !== undefined), `nomenclador 2026 cargado: ${nom.motivos.length} motivos, ${variantes.length} variantes`);
const sinRegla = variantes.filter((v) => v.activa && !v.reglaVigente).map((v) => v.codigo);
ok(sinRegla.every((c) => c.startsWith('1.8.')), `toda variante activa tiene regla vigente (salvo 1.8, incompleta en el Excel)`, sinRegla);
const variante = (codigo) => variantes.find((v) => v.codigo === codigo);

const docentes = (await req(rrhh, 'GET', '/docentes?porPagina=50')).data.items;
const porLegajo = Object.fromEntries(docentes.map((d) => [d.legajo, d]));
const designacionesDe = async (docenteId) => (await req(rrhh, 'GET', `/designaciones?docenteId=${docenteId}`)).data;
const yo = (await req(laura, 'GET', '/docentes/yo')).data;
const dLaura = yo.designaciones.map((d) => d.id);
const simular = (token, cuerpo) => req(token, 'POST', '/nomenclador/simular', cuerpo);
const bloquea = (ev, texto) => [...(ev.bloqueantes ?? []), ...(ev.excepcionables ?? []), ...(ev.porDesignacion ?? []).flatMap((p) => p.hallazgos ?? [])]
  .some((h) => JSON.stringify(h).toLowerCase().includes(texto));

// ── Art. 331 a: tope de enfermedad de interinos según antigüedad en el cargo ────────────────────────────────────
const cargos = (await req(admin, 'GET', '/cargos')).data;
const cargo = cargos.find((c) => c.codigo === 'PROF-HC') ?? cargos[0];
const nuevaDesig = async (legajo, revista, desde) => {
  const r = await req(admin, 'POST', '/designaciones', { docenteId: porLegajo[legajo].id, cargoId: cargo.id, turno: 'TARDE', situacionRevista: revista, horasCatedra: 2, fechaDesde: desde,
    horarios: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, horaDesde: '14:00', horaHasta: '15:20' })) });
  if (r.status !== 201) throw new Error(`designación ${legajo}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};
const int3 = await nuevaDesig('D-003', 'INTERINO', mesesAtras(3));
const int5 = await nuevaDesig('D-005', 'INTERINO', mesesAtras(5));
// La enfermedad abarca todas las designaciones del docente: cada una con la variante de su revista.
const enfInterino = async (docente, desig, dias) => {
  const todas = await designacionesDe(docente.id);
  const vs = todas.map((d) => ({ designacionId: d.id, varianteId: variante(d.situacionRevista === 'TITULAR' ? '1.1.1' : d.situacionRevista === 'SUPLENTE' ? '1.1.4' : '1.1.3').id }));
  return simular(secre, { variantes: vs, docenteId: docente.id, designacionIds: todas.map((d) => d.id), desde: iso(1), hasta: iso(dias) });
};
let r = await enfInterino(porLegajo['D-003'], int3, 11);
const p3 = r.data.porDesignacion?.find((p) => p.designacionId === int3.id);
ok(r.status === 200 && p3?.tope === 10 && !p3.admisible, 'interino con 3 meses en el cargo: tope 10 días de enfermedad, 11 no se admiten (art. 331 a)', r.data);
r = await enfInterino(porLegajo['D-005'], int5, 11);
const p5 = r.data.porDesignacion?.find((p) => p.designacionId === int5.id);
ok(r.status === 200 && p5?.tope === 30 && p5.admisible, 'interino con 5 meses en el cargo: tope 30 días (art. 331 a)', r.data);

// ── Alcance: salud afecta todas las designaciones; familiar enfermo permite elegir ─────────────────────────────
r = await req(laura, 'POST', '/solicitudes', { motivoId: M['1.1'].id, designacionIds: [dLaura[0]], fechaDesde: iso(40), fechaHasta: iso(41) });
ok(r.status === 201 && r.data.evaluacion?.porDesignacion?.length === 2, 'licencia de salud con una designación elegida afecta a las dos', r.data);
if (r.data.id) await req(laura, 'POST', `/solicitudes/${r.data.id}/anular`, { comentario: 'Prueba' });
r = await req(laura, 'POST', '/solicitudes', { motivoId: M['1.5'].id, designacionIds: [dLaura[0]], fechaDesde: iso(40), fechaHasta: iso(41), variantes: [{ designacionId: dLaura[0], varianteId: variante('1.5.1').id }] });
ok(r.status === 201 && r.data.evaluacion?.porDesignacion?.length === 1, 'familiar enfermo: se puede pedir para una sola designación', r.data);
if (r.data.id) await req(laura, 'POST', `/solicitudes/${r.data.id}/anular`, { comentario: 'Prueba' });

// ── Duelo: días laborables según el horario de cada designación ────────────────────────────────────────────────
// Martín (D-002) trabaja martes y viernes. Un duelo de 8 días laborables se cuenta sobre sus días, no corridos.
const dMartin = await designacionesDe(porLegajo['D-002'].id);
const lunes = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
r = await simular(secre, { varianteId: variante('3.4.1').id, docenteId: porLegajo['D-002'].id, designacionIds: dMartin.map((d) => d.id), desde: lunes, hasta: iso(13, lunes), fechaEvento: iso(-1, lunes) });
// Del lunes al domingo de la semana siguiente: 2 martes y 2 viernes = 4 días laborables para Martín.
ok(r.status === 200 && r.data.porDesignacion?.[0]?.diasPedidos === 4, 'duelo: computa los días que el docente trabaja según su horario (4 en dos semanas, no 14 corridos)', r.data);

// ── Matrimonio: la fecha del casamiento tiene que caer dentro del período ──────────────────────────────────────
r = await simular(laura, { varianteId: variante('2.8.1').id, docenteId: yo.id, designacionIds: dLaura, desde: iso(60), hasta: iso(70), fechaEvento: iso(20) });
ok(r.status === 200 && r.data.admisible === false, 'matrimonio con la fecha del casamiento fuera del período: se rechaza', r.data);
r = await simular(laura, { varianteId: variante('2.8.1').id, docenteId: yo.id, designacionIds: dLaura, desde: iso(60), hasta: iso(70), fechaEvento: iso(62) });
ok(r.status === 200 && r.data.admisible === true, 'matrimonio con la fecha dentro del período: se admite', r.data);

// ── Art. 318 a: asuntos particulares, una vez cada 2 años (además, la otorga el supervisor: queda Elevada) ──────
const avanzarHastaDecision = async (id) => {
  let x = await req(rrhh, 'POST', `/solicitudes/${id}/tomar`);
  if (x.status !== 200) return x;
  x = await req(secre, 'POST', `/solicitudes/${id}/decision`, { decision: 'APROBADA', observacion: 'Verificado' });
  if (x.status !== 200) return x;
  return req(dire, 'POST', `/solicitudes/${id}/decision`, { decision: 'APROBADA' });
};
r = await req(laura, 'POST', '/solicitudes', { motivoId: M['2.3'].id, designacionIds: dLaura, fechaDesde: iso(90), fechaHasta: iso(95), motivo: 'Viaje' });
const asuntos = r.data;
await req(laura, 'POST', `/solicitudes/${asuntos.id}/documentos`, pdf('dj.pdf', 'Nota con declaración jurada de licencias anteriores por esta causa'), true);
r = r.status === 201 ? await req(laura, 'POST', `/solicitudes/${asuntos.id}/presentar`) : r;
ok(r.status === 200 && r.data.estado === 'PENDIENTE', 'asuntos particulares presentada', r.data);
r = await avanzarHastaDecision(asuntos.id);
ok(r.status === 200 && r.data.estado === 'ELEVADA', 'la licencia que otorga el supervisor queda "Elevada" al terminar el circuito interno', r.data);
r = await req(secre, 'GET', '/autorizaciones/bandeja');
ok(r.data.esperandoInstrumento?.some((s) => s.id === asuntos.id), 'aparece en la bandeja "Esperando dictamen o resolución"', r.data.esperandoInstrumento);
r = await simular(laura, { varianteId: variante('2.3.1').id, docenteId: yo.id, designacionIds: dLaura, desde: iso(200), hasta: iso(202) });
ok(r.status === 200 && r.data.admisible === false, 'una segunda de asuntos particulares dentro de los 2 años no se admite (art. 318 a)', r.data);

// ── Elevada → resolución con número → Autorizada ───────────────────────────────────────────────────────────────
const fdRes = new FormData();
for (const [k, v] of Object.entries({ tipo: 'RESOLUCION', numero: 'RES-123/2026', fecha: iso(0), emisor: 'Supervisión Regional' })) fdRes.append(k, v);
r = await req(secre, 'POST', `/solicitudes/${asuntos.id}/instrumentos`, fdRes, true);
const trasRes = (await req(secre, 'GET', `/solicitudes/${asuntos.id}`)).data;
ok([200, 201].includes(r.status) && trasRes.estado === 'AUTORIZADA' && trasRes.instrumentos?.some((i) => i.numero === 'RES-123/2026'),
  'al cargar la resolución con su número, la elevada pasa a Autorizada', { status: r.status, data: r.data, estado: trasRes.estado });

// ── Salud: requiere dictamen de Reconocimientos Médicos; con dictamen, autoriza y emite disposición ────────────
r = await req(laura, 'POST', '/solicitudes', { motivoId: M['1.1'].id, designacionIds: dLaura, fechaDesde: iso(150), fechaHasta: iso(152), motivo: 'Gripe' }); // fechas libres: smoke ya usa los próximos días
const salud = r.data;
await req(laura, 'POST', `/solicitudes/${salud.id}/documentos`, pdf('certificado.pdf', 'Certificado médico'), true);
r = await req(laura, 'POST', `/solicitudes/${salud.id}/presentar`);
ok(r.status === 200, 'licencia de salud presentada con certificado', r.data);
r = await avanzarHastaDecision(salud.id);
ok(r.status === 200 && r.data.estado === 'PENDIENTE_DICTAMEN', 'sin dictamen de Reconocimientos Médicos queda "Pendiente de dictamen"', r.data);
const fdDic = new FormData();
for (const [k, v] of Object.entries({ tipo: 'DICTAMEN', numero: 'RM-555', fecha: iso(0), emisor: 'Reconocimientos Médicos' })) fdDic.append(k, v);
r = await req(secre, 'POST', `/solicitudes/${salud.id}/instrumentos`, fdDic, true);
const trasDic = (await req(secre, 'GET', `/solicitudes/${salud.id}`)).data;
ok(trasDic.estado === 'AUTORIZADA', 'con el dictamen favorable la autoriza la escuela (la otorga el Director)', { status: r.status, data: r.data, estado: trasDic.estado });
r = await req(laura, 'GET', `/solicitudes/${salud.id}/disposicion.pdf`);
ok(r.status === 200 && Buffer.from(r.data).subarray(0, 4).toString() === '%PDF', 'la titular descarga la disposición en PDF', r.status);
const disp = trasDic.instrumentos?.find((i) => i.tipo === 'DISPOSICION');
ok(!!disp && /^\d+\/\d{4}$/.test(disp.numero), `la disposición queda numerada (${disp?.numero})`, trasDic.instrumentos);

// ── Art. 350: al cesar un suplente se cancelan sus licencias, salvo maternidad y adopción ──────────────────────
const diego = porLegajo['D-004'];
const dDiego = (await designacionesDe(diego.id)).filter((d) => d.situacionRevista === 'SUPLENTE');
r = await req(secre, 'POST', '/solicitudes', { docenteId: diego.id, motivoId: M['3.4'].id, designacionIds: dDiego.map((d) => d.id), fechaDesde: iso(20), fechaHasta: iso(30), fechaEvento: iso(19),
  variantes: dDiego.map((d) => ({ designacionId: d.id, varianteId: variante('3.4.7').id })) });
const dueloDiego = r.data;
ok(r.status === 201, 'Secretaría carga un duelo para el suplente', r.data);
await req(secre, 'POST', `/solicitudes/${dueloDiego.id}/documentos`, pdf('dj.pdf', 'Declaración jurada del fallecimiento y el vínculo'), true);
r = await req(secre, 'POST', `/solicitudes/${dueloDiego.id}/presentar`);
ok(r.status === 200, 'duelo del suplente presentado', r.data);
r = await req(admin, 'POST', `/designaciones/${dDiego[0].id}/baja`, { fechaHasta: iso(10), motivoCese: 'Presentación del titular' });
ok([200, 201].includes(r.status), 'cese del suplente por presentación del titular', r.data);
const trasCese = (await req(secre, 'GET', `/solicitudes/${dueloDiego.id}`)).data;
ok(['CANCELADA_CESE', 'ANULADA'].includes(trasCese.estado), `su licencia en curso se cancela (art. 350): ${trasCese.estado}`, trasCese.estado);

// ── Violencia de género: reservada para quien no tiene datos_sensibles.ver ─────────────────────────────────────
r = await req(secre, 'POST', '/solicitudes', { docenteId: yo.id, motivoId: M['2.20'].id, designacionIds: dLaura, fechaDesde: iso(120), fechaHasta: iso(125), canalIngreso: 'ORAL' });
const vg = r.data;
ok(r.status === 201 && vg.reservada === true, 'la licencia por violencia de género queda marcada como reservada', r.data);
const vgDir = (await req(dire, 'GET', `/solicitudes/${vg.id}`)).data;
const textoDir = JSON.stringify(vgDir).toLowerCase();
ok(!textoDir.includes('violencia') && !textoDir.includes('2.20'), 'Dirección no ve el tipo en el detalle', vgDir.tipoLicencia ?? vgDir.motivoNomenclador);
const cal = JSON.stringify((await req(dire, 'GET', `/reportes/calendario?desde=${iso(118)}&hasta=${iso(127)}`)).data).toLowerCase();
ok(!cal.includes('violencia'), 'ni en el calendario');
const aud = (await req(admin, 'GET', `/auditoria?entidadId=${vg.id}&porPagina=50`)).data;
ok(!JSON.stringify(aud).toLowerCase().includes('violencia'), 'ni en la auditoría (admin sin datos sensibles)');
const vgRrhh = (await req(rrhh, 'GET', `/solicitudes/${vg.id}`)).data;
ok(JSON.stringify(vgRrhh).toLowerCase().includes('violencia'), 'RR.HH. (datos_sensibles.ver) sí lo ve');

// ── Informes de la ley ─────────────────────────────────────────────────────────────────────────────────────────
const catalogo = (await req(secre, 'GET', '/reportes/informes')).data;
ok(Array.isArray(catalogo), 'Secretaría accede a los informes (reemplazan sus planillas)', catalogo);
if (!Array.isArray(catalogo)) { console.log(`
${fallos} fallo(s)`); process.exit(1); }
const claves = catalogo.map((i) => i.clave);
// El registro del art. 347 tiene datos de salud: solo con datos_sensibles.ver (RR.HH.); Secretaría no lo ve.
ok((await req(secre, 'GET', '/reportes/informes/registro-art-347?formato=xlsx')).status === 403, 'Secretaría no exporta el registro del art. 347 (datos de salud)');
for (const k of claves.filter((c) => /il1|il2|estad|347|concepto/i.test(c))) {
  const quien = k.includes('347') ? rrhh : secre;
  for (const fmt of ['xlsx', 'pdf']) {
    r = await req(quien, 'GET', `/reportes/informes/${k}?formato=${fmt}&desde=${iso(-30)}&hasta=${iso(30)}&anio=${new Date().getUTCFullYear()}&mes=${new Date().getUTCMonth() + 1}`);
    ok(r.status === 200 && r.data.byteLength > 500, `informe ${k} en ${fmt.toUpperCase()} (${r.data.byteLength ?? 0} bytes)`, r.status === 200 ? undefined : r.data);
  }
}
ok(claves.filter((c) => /il1|il2|estad|347|concepto/i.test(c)).length >= 5, `catálogo con IL1, IL2, estadística mensual, concepto anual y registro del art. 347 (${claves.join(', ')})`);

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
