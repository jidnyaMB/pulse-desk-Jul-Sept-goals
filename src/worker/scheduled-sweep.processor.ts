import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULED_SWEEP_QUEUE } from '../queue/queue.constants';

// Demonstration job for cluster-safe scheduling (see main.ts's
// upsertJobScheduler call). Its only real job is to prove — with a row you
// can literally count in Postgres — that one tick produces exactly one
// execution, no matter how many worker processes are running. In a fuller
// build this same repeatable-job mechanism would drive real periodic work
// (e.g. re-sweeping rolling averages independent of new webhook arrivals).
@Processor(SCHEDULED_SWEEP_QUEUE)
export class ScheduledSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledSweepProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    // Truncate to the minute using the tick's own scheduled timestamp (not
    // wall-clock at execution time) so retries/delays still map to the same tick.
    const tickKey = new Date(Math.floor(job.timestamp / 60_000) * 60_000).toISOString();

    try {
      await this.prisma.scheduledJobRun.create({
        data: { tickKey, runByPid: process.pid },
      });
      this.logger.log(`Scheduled sweep tick ${tickKey} executed by pid ${process.pid}`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Another worker (or a duplicate delivery) already claimed this
        // exact tick — expected under normal operation, not an error.
        this.logger.debug(`Tick ${tickKey} already claimed — skipping`);
        return;
      }
      throw err;
    }
  }
}
