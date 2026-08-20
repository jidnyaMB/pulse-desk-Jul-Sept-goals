import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WEBHOOK_PROCESSING_QUEUE, SCHEDULED_SWEEP_QUEUE } from './queue.constants';

// Shared BullMQ setup, used by BOTH the API process (producer — enqueues jobs
// and registers the repeatable schedule) and the worker process (consumer —
// actually runs job handlers). Same Redis connection config either way.
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: { url: configService.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE }, { name: SCHEDULED_SWEEP_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
