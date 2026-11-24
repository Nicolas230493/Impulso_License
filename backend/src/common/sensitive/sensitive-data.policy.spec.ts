import { P } from '../permisos';
import {
  ETIQUETA_TIPO_RESERVADO, nombreTipo, redact, sanearValoresAuditoria, sensibilidadPorDefecto, tipoEsSensible, VALOR_AUDITORIA_SENSIBLE,
} from './sensitive-data.policy';

const SECRETARIA = { permisos: [P.DOCENTES_VER, P.LICENCIAS_VER_TODAS, P.LICENCIAS_REVISAR], docenteId: null };
const DIRECTIVO = { permisos: [P.DOCENTES_VER, P.LICENCIAS_VER_TODAS, P.REPORTES_VER], docenteId: null };
const SUPERVISOR = { permisos: [P.DOCENTES_VER, P.AUDITORIA_VER], docenteId: null };
const RRHH = { permisos: [P.DOCENTES_VER, P.DATOS_SENSIBLES_VER], docenteId: null };
const TITULAR = { permisos: [P.LICENCIAS_SOLICITAR], docenteId: 'doc-1' };

const tipoSalud = { id: 't1', codigo: 'ENF-CORTA', nombre: 'Enfermedad de corto tratamiento', categoria: 'SALUD', sensible: true, documentacionRequerida: ['Certificado médico'], reglas: [{ tipo: 'MAX' }] };
const tipoExamen = { id: 't2', codigo: 'EXAMEN', nombre: 'Rendir examen', categoria: 'ESTUDIO', sensible: false };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const solicitud = (tipo: any) => ({
  id: 's1', numero: 'LIC-DEMO-2026-000001', docenteId: 'doc-1', solicitanteId: 'u-sec', motivo: 'Gripe fuerte', estado: 'BORRADOR',
  tipoLicencia: tipo,
  documentos: [{ id: 'd1', tipoDocumento: 'Certificado médico', archivo: { id: 'a1', nombreOriginal: 'cardiologia.pdf', confidencial: true } }],
});

describe('SensitiveDataPolicy.redact (hallazgos 1 y 11)', () => {
  it.each([['SECRETARIA', SECRETARIA], ['DIRECTIVO', DIRECTIVO], ['SUPERVISOR', SUPERVISOR]])('%s no ve motivo, tipo sensible ni nombre del archivo', (_, actor) => {
    const r = redact('solicitud', solicitud(tipoSalud), actor);
    expect(r.motivo).toBeNull();
    expect(r.tipoLicencia).toMatchObject({ nombre: ETIQUETA_TIPO_RESERVADO, codigo: 'RESERVADO', categoria: null, documentacionRequerida: [], reglas: [], reservado: true });
    expect(r.documentos[0].archivo.nombreOriginal).toBe('Documento confidencial');
    expect(JSON.stringify(r)).not.toMatch(/Gripe|Enfermedad|ENF-CORTA|cardiologia/);
  });

  it('el motivo se reserva aunque el tipo no sea sensible; el tipo no sensible se muestra', () => {
    const r = redact('solicitud', solicitud(tipoExamen), SECRETARIA);
    expect(r.motivo).toBeNull();
    expect(r.tipoLicencia.nombre).toBe('Rendir examen');
  });

  it('el titular y quien tiene datos_sensibles.ver ven todo', () => {
    expect(redact('solicitud', solicitud(tipoSalud), TITULAR)).toEqual(solicitud(tipoSalud));
    expect(redact('solicitud', solicitud(tipoSalud), RRHH)).toEqual(solicitud(tipoSalud));
  });

  it('quien cargó la solicitud en nombre del docente no es titular', () => {
    const r = redact('solicitud', solicitud(tipoSalud), { permisos: [P.LICENCIAS_CARGAR], docenteId: 'otro' });
    expect(r.motivo).toBeNull();
  });

  it('recorre paginados y listas anidadas sin mutar el original', () => {
    const original = { items: [solicitud(tipoSalud)], total: 1 };
    const r = redact('solicitud', original, DIRECTIVO);
    expect(r.items[0].motivo).toBeNull();
    expect(original.items[0].motivo).toBe('Gripe fuerte');
  });

  it('falla cerrada: si no se cargó `sensible`, el tipo se reserva', () => {
    const { sensible: _, ...sinFlag } = tipoSalud;
    expect(tipoEsSensible(sinFlag)).toBe(true);
    expect(redact('solicitud', solicitud(sinFlag), SECRETARIA).tipoLicencia.nombre).toBe(ETIQUETA_TIPO_RESERVADO);
  });

  it('respeta Date y valores primitivos', () => {
    const f = new Date('2026-01-01');
    const r = redact('solicitud', { ...solicitud(tipoExamen), fechaDesde: f }, SECRETARIA);
    expect(r.fechaDesde).toBe(f);
  });
});

describe('nombreTipo (hallazgo 3)', () => {
  it('usa la etiqueta genérica para tipos sensibles salvo titular o permiso', () => {
    expect(nombreTipo(tipoSalud, DIRECTIVO, 'doc-1')).toBe('Licencia con reserva');
    expect(nombreTipo(tipoSalud, TITULAR, 'doc-1')).toBe(tipoSalud.nombre);
    expect(nombreTipo(tipoSalud, RRHH, 'doc-1')).toBe(tipoSalud.nombre);
    expect(nombreTipo(tipoExamen, DIRECTIVO, 'doc-1')).toBe('Rendir examen');
  });
});

describe('auditoría (hallazgo 2)', () => {
  it('al registrar, los campos sensibles de solicitudes se guardan como "[modificado]"', () => {
    expect(sanearValoresAuditoria('solicitud', { motivo: 'Gripe', estado: 'BORRADOR' })).toEqual({ motivo: VALOR_AUDITORIA_SENSIBLE, estado: 'BORRADOR' });
    expect(sanearValoresAuditoria('solicitud', { motivo: null })).toEqual({ motivo: null });
    expect(sanearValoresAuditoria('docente', { observaciones: 'x' })).toEqual({ observaciones: 'x' });
  });

  it('GET /auditoria sanea también los registros históricos para quien no tiene datos_sensibles.ver', () => {
    const fila = { id: 'x', entidad: 'solicitud', valoresAnteriores: { motivo: 'Gripe' }, valoresNuevos: { motivo: 'Neumonía', estado: 'X' } };
    const r = redact('auditoria', { items: [fila] }, SUPERVISOR);
    expect(JSON.stringify(r)).not.toMatch(/Gripe|Neumonía/);
    expect(r.items[0].valoresNuevos).toEqual({ motivo: VALOR_AUDITORIA_SENSIBLE, estado: 'X' });
  });
});

describe('sensibilidadPorDefecto (hallazgo 11)', () => {
  it('salud, maternidad o cualquier tipo con certificado médico', () => {
    expect(sensibilidadPorDefecto('SALUD', [])).toBe(true);
    expect(sensibilidadPorDefecto('MATERNIDAD', [])).toBe(true);
    expect(sensibilidadPorDefecto('FAMILIAR', ['Certificado médico del familiar'])).toBe(true);
    expect(sensibilidadPorDefecto('ESTUDIO', ['Constancia de examen'])).toBe(false);
  });
});
