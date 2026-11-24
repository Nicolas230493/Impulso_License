import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Actor, tienePermiso } from '../../common/actor';
import { P } from '../../common/permisos';
import { validarEstructura } from './validacion-archivos';
import { AntivirusNoDisponibleError, escanearConClamd } from './antivirus';
import { cifrar, claveDesdeHex, descifrar, estaCifrado } from '../../common/cifrado';
import { entorno } from '../../config/entorno';

/** Tipos admitidos, verificados por firma binaria (no se confía en el mimetype del cliente). */
const FIRMAS: { mime: string; ext: string; firma: number[] }[] = [
  { mime: 'application/pdf', ext: 'pdf', firma: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/png', ext: 'png', firma: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', ext: 'jpg', firma: [0xff, 0xd8, 0xff] },
];

export interface ArchivoSubido { originalname: string; buffer: Buffer; size: number }

/** Archivo validado y listo para registrar; todavía no se escribió en disco. */
export interface ArchivoPreparado {
  buffer: Buffer;
  relativa: string;
  absoluta: string;
  nombreOriginal: string;
  mimeType: string;
  tamanio: number;
  sha256: string;
  institucionId: string;
}

@Injectable()
export class ArchivosService {
  private dir: string;
  private log = new Logger('Archivos');
  private clave: Buffer | null;
  constructor(private prisma: PrismaService, private auditoria: AuditoriaService, config: ConfigService) {
    this.dir = resolve(config.get('STORAGE_DIR') ?? './storage');
    this.clave = claveDesdeHex(entorno().CLAVE_CIFRADO);
    if (!this.clave) this.log.warn('CLAVE_CIFRADO no está definida: los archivos nuevos se guardan sin cifrar (solo admitido fuera de producción)');
    if (!entorno().CLAMAV_HOST) this.log.warn('CLAMAV_HOST no está definido: los archivos subidos no se escanean (solo admitido fuera de producción)');
  }

  /** Escanea con ClamAV si está configurado. Falla cerrada: sin respuesta del antivirus, el archivo no se acepta. */
  private async escanear(actor: Actor, buffer: Buffer, nombre: string) {
    const { CLAMAV_HOST, CLAMAV_PORT } = entorno();
    if (!CLAMAV_HOST) return;
    let r;
    try {
      r = await escanearConClamd(buffer, CLAMAV_HOST, CLAMAV_PORT);
    } catch (e) {
      if (e instanceof AntivirusNoDisponibleError) {
        this.log.error(e.message);
        throw new ServiceUnavailableException('No se pudo verificar el archivo con el antivirus. Intente nuevamente más tarde.');
      }
      throw e;
    }
    if (!r.limpio) {
      this.log.warn(`Archivo rechazado por el antivirus (${r.amenaza}) subido por ${actor.usuarioId}`);
      await this.auditoria.registrar(actor, 'ARCHIVO_MALICIOSO_RECHAZADO', 'archivo', null, null, { amenaza: r.amenaza, nombre });
      throw new BadRequestException('El archivo fue rechazado por el antivirus');
    }
  }

  detectarTipo(buffer: Buffer) {
    return FIRMAS.find((t) => t.firma.every((b, i) => buffer[i] === b));
  }

  /** Valida firma y estructura del archivo y calcula su ubicación. No escribe nada. */
  async preparar(actor: Actor, file: ArchivoSubido | undefined): Promise<ArchivoPreparado> {
    if (!file) throw new BadRequestException('Debe adjuntar un archivo');
    const tipo = this.detectarTipo(file.buffer);
    if (!tipo) throw new BadRequestException('Formato no admitido. Se aceptan PDF, PNG o JPG.');
    const error = validarEstructura(tipo.mime, file.buffer);
    if (error) throw new BadRequestException(error);
    await this.escanear(actor, file.buffer, file.originalname);
    const ahora = new Date();
    const relativa = join(actor.institucionId, `${ahora.getFullYear()}`, `${ahora.getMonth() + 1}`.padStart(2, '0'), `${randomUUID()}.${tipo.ext}`);
    return {
      buffer: file.buffer,
      relativa,
      absoluta: join(this.dir, relativa),
      nombreOriginal: file.originalname.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 200),
      mimeType: tipo.mime,
      tamanio: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      institucionId: actor.institucionId,
    };
  }

  /** Crea el registro del archivo dentro de la transacción que lo vincula. */
  registrar(actor: Actor, p: ArchivoPreparado, confidencial: boolean, tx: Prisma.TransactionClient) {
    return tx.archivo.create({
      data: {
        institucionId: p.institucionId,
        nombreOriginal: p.nombreOriginal,
        mimeType: p.mimeType,
        tamanio: p.tamanio,
        ruta: p.relativa,
        sha256: p.sha256,
        confidencial,
        subidoPorId: actor.usuarioId,
      },
    });
  }

  /**
   * Escribe el archivo en disco. Se llama recién después de confirmar la transacción en la base;
   * si la escritura falla, `compensar` elimina los registros creados y se informa el error.
   */
  async persistir(p: ArchivoPreparado, compensar: () => Promise<unknown>) {
    try {
      await mkdir(join(p.absoluta, '..'), { recursive: true });
      // Cifrado en reposo (AES-256-GCM); el hash SHA-256 registrado es el del contenido original.
      await writeFile(p.absoluta, this.clave ? cifrar(p.buffer, this.clave) : p.buffer, { mode: 0o600, flag: 'wx' });
    } catch (e) {
      this.log.error(`No se pudo guardar el archivo ${p.relativa}: ${(e as Error).message}`);
      await unlink(p.absoluta).catch(() => undefined);
      await compensar().catch((err) => this.log.error(`No se pudo revertir el registro de ${p.relativa}: ${(err as Error).message}`));
      throw new InternalServerErrorException('No se pudo guardar el archivo. Intente nuevamente.');
    }
  }

  async eliminarFisico(ruta: string) {
    await unlink(join(this.dir, ruta)).catch(() => undefined);
  }

  /** Control de acceso a un archivo según titularidad, permisos y confidencialidad. */
  async abrir(actor: Actor, id: string) {
    const archivo = await this.prisma.archivo.findFirst({
      where: { id, institucionId: actor.institucionId },
      include: {
        documentoLicencia: { select: { solicitud: { select: { docenteId: true } } } },
        documentoPersonal: { select: { docenteId: true } },
        instrumento: { select: { solicitud: { select: { docenteId: true } } } },
      },
    });
    if (!archivo) throw new NotFoundException('Archivo no encontrado');
    // Dictámenes y resoluciones también son del titular de la solicitud.
    const titular = archivo.documentoLicencia?.solicitud.docenteId ?? archivo.documentoPersonal?.docenteId ?? archivo.instrumento?.solicitud?.docenteId ?? null;
    const esTitular = !!titular && titular === actor.docenteId;
    const permitido =
      esTitular ||
      (archivo.confidencial
        ? tienePermiso(actor, P.DATOS_SENSIBLES_VER)
        : [P.DOCENTES_VER, P.LICENCIAS_VER_TODAS, P.LICENCIAS_REVISAR].some((p) => tienePermiso(actor, p)));
    if (!permitido) throw new ForbiddenException('No tiene acceso a este documento');
    if (archivo.confidencial && !esTitular) {
      await this.auditoria.registrar(actor, 'ACCESO_DOCUMENTO_CONFIDENCIAL', 'archivo', archivo.id);
    }
    return { archivo, contenido: await this.leerContenido(archivo) };
  }

  /** Lee el archivo de disco, lo descifra si corresponde y verifica que coincida con el hash registrado. */
  private async leerContenido(archivo: { id: string; ruta: string; sha256: string }) {
    const crudo = await readFile(join(this.dir, archivo.ruta)).catch(() => { throw new NotFoundException('El archivo no está disponible'); });
    let contenido = crudo;
    if (estaCifrado(crudo)) {
      if (!this.clave) throw new InternalServerErrorException('Falta CLAVE_CIFRADO para leer archivos cifrados');
      try { contenido = descifrar(crudo, this.clave); } catch {
        this.log.error(`El archivo ${archivo.id} no se pudo descifrar (alterado o clave incorrecta)`);
        throw new InternalServerErrorException('El archivo no pasó la verificación de integridad');
      }
    }
    if (createHash('sha256').update(contenido).digest('hex') !== archivo.sha256) {
      this.log.error(`El archivo ${archivo.id} no coincide con su hash registrado`);
      throw new InternalServerErrorException('El archivo no pasó la verificación de integridad');
    }
    return contenido;
  }
}
