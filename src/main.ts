import { getQueueToken } from '@nestjs/bullmq';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { AppModule } from './app.module';
import { SCHEDULED_SWEEP_JOB_NAME, SCHEDULED_SWEEP_QUEUE } from './queue/queue.constants';

async function bootstrap() {
  // rawBody: true preserves the exact request bytes (req.rawBody) alongside
  // the parsed req.body — needed so HmacGuard can verify a webhook signature
  // computed over the untouched payload, not a re-serialized copy of it.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Registers the repeatable job definition in Redis. upsertJobScheduler is
  // idempotent by schedulerId — safe to call every time the API boots, even
  // across restarts/redeploys, without creating duplicate schedules. This is
  // ONLY a schedule registration — actual execution happens in worker.ts,
  // and BullMQ guarantees exactly one worker picks up each individual tick
  // no matter how many worker replicas are running.
  const sweepQueue = app.get<Queue>(getQueueToken(SCHEDULED_SWEEP_QUEUE));
  await sweepQueue.upsertJobScheduler(
    'rolling-average-sweep-scheduler',
    { every: 60_000 },
    { name: SCHEDULED_SWEEP_JOB_NAME },
  );

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
  console.log(`PulseDesk API listening on port ${port}`);
}

bootstrap();
