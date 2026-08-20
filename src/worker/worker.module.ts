import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { validateEnv } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { ScheduledSweepProcessor } from './scheduled-sweep.processor';
import { WebhookProcessor } from './webhook.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // No HTTP layer here, so ClsModule's request middleware never mounts —
    // each processor instead opens its own CLS context per job via
    // cls.run(), see WebhookProcessor.
    ClsModule.forRoot({ global: true }),
    PrismaModule,
    QueueModule,
  ],
  providers: [WebhookProcessor, ScheduledSweepProcessor],
})
export class WorkerModule {}
