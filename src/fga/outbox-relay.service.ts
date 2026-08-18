import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FgaService } from './fga.service';

const POLL_INTERVAL_MS = 500;

// Drains outbox_events into OpenFGA. This is a plain setInterval poller in
// the API process for now — fine for a single instance. Phase 5 replaces
// this with a proper BullMQ repeatable job so it's correct once there are
// multiple worker replicas (see Rule: never use @Cron for cluster-wide jobs).
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fgaService: FgaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.processOnce(), POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processOnce(): Promise<number> {
    if (this.running) return 0; // avoid overlapping runs if OpenFGA is slow
    this.running = true;
    let processed = 0;
    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { processedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      for (const event of pending) {
        try {
          if (event.operation === 'write') {
            await this.fgaService.writeTuple(event.userObject, event.relation, event.targetObject);
          } else {
            await this.fgaService.deleteTuple(event.userObject, event.relation, event.targetObject);
          }
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date(), lastError: null },
          });
          processed++;
        } catch (err) {
          this.logger.error(`Failed to relay outbox event ${event.id}: ${err}`);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { lastError: String(err) },
          });
        }
      }
    } finally {
      this.running = false;
    }
    return processed;
  }
}
