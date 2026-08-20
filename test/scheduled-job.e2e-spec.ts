import { ChildProcess, spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import * as path from 'path';

// Proves the Phase 5 "cluster-safe scheduling" requirement directly: start
// THREE separate worker processes (not three in-process fakes — real
// `node dist/src/worker.js` processes, exactly like a real deployment would
// run), register the repeatable job once, let one tick fire, and check
// Postgres. If the requirement were violated (each worker ran its own timer)
// we'd see 3 rows for that tick. We assert exactly 1.
describe('Cluster-safe scheduling (e2e)', () => {
  jest.setTimeout(90_000);
  let workers: ChildProcess[] = [];
  let prisma: PrismaClient;
  let queue: Queue;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.scheduledJobRun.deleteMany();

    queue = new Queue('scheduled-sweep', { connection: { url: process.env.REDIS_URL } });
    // Remove any pre-existing schedule from the API process so this test
    // controls the exact tick timing.
    const schedulers = await queue.getJobSchedulers();
    await Promise.all(schedulers.map((s) => queue.removeJobScheduler(s.key)));

    const workerPath = path.join(__dirname, '..', 'dist', 'src', 'worker.js');
    workers = [
      spawn('node', [workerPath], { env: process.env, stdio: 'ignore' }),
      spawn('node', [workerPath], { env: process.env, stdio: 'ignore' }),
      spawn('node', [workerPath], { env: process.env, stdio: 'ignore' }),
    ];
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // One-off tick, fired once, picked up by whichever of the 3 workers is free.
    await queue.upsertJobScheduler('test-tick', { every: 5000, limit: 1 }, { name: 'rolling-average-sweep' });
  });

  afterAll(async () => {
    workers.forEach((w) => w.kill());
    await queue.close();
    await prisma.$disconnect();
  });

  it('exactly one of three worker replicas executes a given scheduled tick', async () => {
    let runs: Awaited<ReturnType<typeof prisma.scheduledJobRun.findMany>> = [];
    for (let i = 0; i < 30; i++) {
      runs = await prisma.scheduledJobRun.findMany();
      if (runs.length >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(runs.length).toBe(1);
    // Give any (incorrect) duplicate executions from the other two workers a
    // chance to land before asserting the count is still exactly 1.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const finalRuns = await prisma.scheduledJobRun.findMany();
    expect(finalRuns.length).toBe(1);
  });
});
