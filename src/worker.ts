import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

// Separate OS process from the API (main.ts) — same codebase, no HTTP
// listener. Started with: npm run start:worker (or node dist/src/worker.js).
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log(`PulseDesk worker started (pid ${process.pid})`);
}

bootstrap();
