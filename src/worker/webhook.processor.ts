import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { ClsService, ClsServiceManager } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';
import { WEBHOOK_PROCESSING_QUEUE } from '../queue/queue.constants';

interface WebhookJobData {
  webhookEventId: string;
  tenantId: string;
}

@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { webhookEventId, tenantId } = job.data;

    // No HTTP request means no ClsMiddleware ran — open a fresh CLS context
    // for the lifetime of this one job and set tenantId manually, the same
    // role TenantContextInterceptor plays for HTTP requests.
    const cls: ClsService<AppClsStore> = ClsServiceManager.getClsService();
    await cls.run(async () => {
      cls.set('tenantId', tenantId);
      await this.handle(webhookEventId);
    });
  }

  private async handle(webhookEventId: string): Promise<void> {
    const webhookEvent = await this.tenantDb.withTenant((tx) =>
      tx.webhookEvent.findUnique({ where: { id: webhookEventId } }),
    );
    if (!webhookEvent) {
      this.logger.warn(`webhook_event ${webhookEventId} not found — skipping`);
      return;
    }
    if (webhookEvent.processedAt) {
      this.logger.debug(`webhook_event ${webhookEventId} already processed — skipping`);
      return;
    }

    const payload = webhookEvent.payload as { heartRate: number; recordedAt: string };

    let insertedNewReading = true;
    try {
      await this.tenantDb.withTenant(async (tx) => {
        const device = await tx.device.findUniqueOrThrow({ where: { id: webhookEvent.deviceId } });
        return tx.reading.create({
          data: {
            tenantId: webhookEvent.tenantId,
            patientId: device.patientId,
            deviceId: webhookEvent.deviceId,
            webhookEventId: webhookEvent.id,
            heartRate: payload.heartRate,
            recordedAt: new Date(payload.recordedAt),
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Reading for this webhook event already exists — a retried job
        // landing on already-completed work. Idempotent no-op.
        insertedNewReading = false;
      } else {
        throw err;
      }
    }

    if (insertedNewReading) {
      await this.scoreAndMaybeAlert(webhookEvent.tenantId, webhookEvent.deviceId);
    }

    await this.tenantDb.withTenant((tx) =>
      tx.webhookEvent.update({ where: { id: webhookEventId }, data: { processedAt: new Date() } }),
    );
  }

  private async scoreAndMaybeAlert(_tenantId: string, deviceId: string): Promise<void> {
    const threshold = this.configService.getOrThrow<number>('HEART_RATE_ALERT_THRESHOLD');
    const windowMinutes = this.configService.getOrThrow<number>('HEART_RATE_WINDOW_MINUTES');
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    await this.tenantDb.withTenant(async (tx) => {
      const device = await tx.device.findUniqueOrThrow({ where: { id: deviceId } });
      const readings = await tx.reading.findMany({
        where: { patientId: device.patientId, recordedAt: { gte: windowStart } },
        select: { heartRate: true },
      });
      if (readings.length === 0) return;

      const average = readings.reduce((sum, r) => sum + r.heartRate, 0) / readings.length;
      if (average <= threshold) return;

      try {
        await tx.alert.create({
          data: {
            tenantId: device.tenantId,
            patientId: device.patientId,
            severity: 'high',
            message: `${windowMinutes}-minute average heart rate (${Math.round(average)}bpm) exceeds ${threshold}bpm`,
            dedupeKey: 'high_heart_rate',
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Partial unique index (patient_id, dedupe_key) WHERE status='open'
          // already has an open alert for this condition — that's the point,
          // don't open a second one.
          return;
        }
        throw err;
      }
    });
  }
}
