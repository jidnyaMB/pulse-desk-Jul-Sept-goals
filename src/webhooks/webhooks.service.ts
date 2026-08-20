import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Device } from '@prisma/client';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';
import { WEBHOOK_PROCESSING_QUEUE } from '../queue/queue.constants';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  // Fast path: one INSERT (idempotent via the DB unique constraint), one
  // Redis enqueue, done. No scoring/rolling-average work happens here — that
  // belongs to the worker process, off the request's critical path.
  async handleWebhook(device: Device, dto: WebhookPayloadDto) {
    // Guard resolved the device before we had any tenant context — set it
    // now so TenantDbService.withTenant() (RLS) works for this request.
    this.cls.set('tenantId', device.tenantId);

    let webhookEventId: string;
    try {
      const event = await this.tenantDb.withTenant((tx) =>
        tx.webhookEvent.create({
          data: {
            tenantId: device.tenantId,
            deviceId: device.id,
            externalEventId: dto.eventId,
            payload: { eventId: dto.eventId, heartRate: dto.heartRate, recordedAt: dto.recordedAt },
          },
        }),
      );
      webhookEventId = event.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Same (deviceId, externalEventId) already recorded — this exact
        // event was already accepted (and already enqueued) once. Idempotent
        // no-op: still 200, do NOT enqueue a second job for it.
        this.logger.debug(`Duplicate webhook event ${dto.eventId} for device ${device.id}`);
        return { duplicate: true };
      }
      throw err;
    }

    // Job payload is a POINTER ONLY — webhookEventId + tenantId, never the
    // heart-rate value itself. The worker re-reads the real data from
    // Postgres. Redis is not part of our PHI security boundary.
    await this.queue.add(
      'process-webhook',
      { webhookEventId, tenantId: device.tenantId },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    return { duplicate: false };
  }
}
