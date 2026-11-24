import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { entorno } from '../../config/entorno';

export const DIAS_RETENCION_SESIONES = 30;
const COLA = 'mantenimiento';
const TAREA = 'purgar-sesiones';

/**
 * Hallazgo 32: purga diaria de sesiones revocadas o vencidas hace más de 30 días.
 * Con REDIS_URL (obligatoria en producción) es un job repetible de BullMQ: corre una sola vez aunque haya varias réplicas.
 * Sin Redis (solo desarrollo) se usa el cron local.
 */
@Injectable()
export class SesionesPurgaService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('SesionesPurga');
  private cola?: Queue;
  private worker?: Worker;
  private redis?: Redis;

  constructor(private prisma: PrismaService) {}

  async purgar(ahora = new Date()) {
    const limite = new Date(ahora.getTime() - DIAS_RETENCION_SESIONES * 86_400_000);
    const r = await this.prisma.sesion.deleteMany({ where: { OR: [{ revocadaEn: { lt: limite } }, { expiraEn: { lt: limite } }] } });
    this.log.log(`Sesiones purgadas: ${r.count}`);
    return r.count;
  }

  async onModuleInit() {
    const url = entorno().REDIS_URL;
    if (!url || entorno().NODE_ENV === 'test') return;
    const connection = (this.redis = new Redis(url, { maxRetriesPerRequest: null }));
    this.cola = new Queue(COLA, { connection });
    await this.cola.upsertJobScheduler(TAREA, { pattern: '30 3 * * *', tz: 'America/Argentina/Buenos_Aires' }, { name: TAREA, opts: { removeOnComplete: 30, removeOnFail: 100 } });
    this.worker = new Worker(COLA, async (job) => (job.name === TAREA ? this.purgar() : undefined), { connection, concurrency: 1 });
    this.worker.on('failed', (_job, err) => this.log.error(`Falló la purga de sesiones: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.cola?.close();
    this.redis?.disconnect();
  }

  /** Respaldo para desarrollo sin Redis. */
  @Cron('30 3 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async purgaLocal() {
    if (this.cola) return;
    await this.purgar();
  }
}
