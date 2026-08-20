import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChildProcess, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let deviceId: string;
  let serialNumber: string;
  let hmacSecret: string;
  let workerProcess: ChildProcess;

  function sign(body: object, secret: string): { raw: string; signature: string } {
    const raw = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return { raw, signature };
  }

  async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, attempts = 30) {
    let value: T;
    for (let i = 0; i < attempts; i++) {
      value = await fn();
      if (predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return value!;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true } as any);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.alert.deleteMany();
    await prisma.reading.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await prisma.device.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.accessGrant.deleteMany();
    await prisma.careTeamPatient.deleteMany();
    await prisma.careTeamMembership.deleteMany();
    await prisma.careTeam.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();

    await request(app.getHttpServer()).post('/tenants/signup').send({
      tenantSlug: 'webhook-tenant',
      tenantName: 'Webhook Tenant',
      email: 'doctor@webhook-tenant.com',
      password: 'password123',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantSlug: 'webhook-tenant', email: 'doctor@webhook-tenant.com', password: 'password123' });
    auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'Webhook', lastName: 'Patient' });

    serialNumber = `HR-${crypto.randomUUID()}`;
    const device = await request(app.getHttpServer())
      .post('/devices')
      .set(auth)
      .send({ patientId: patient.body.id, serialNumber });
    deviceId = device.body.id;
    hmacSecret = device.body.hmacSecret;

    // The worker genuinely runs as a separate OS process here, exactly like
    // production — not an in-process fake. dist/src/worker.js must be built
    // (npm run build) before this suite runs.
    workerProcess = spawn('node', [path.join(__dirname, '..', 'dist', 'src', 'worker.js')], {
      env: process.env,
      stdio: 'ignore',
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    workerProcess?.kill();
    await app.close();
  });

  it('device creation returns hmacSecret once, but it is never returned again', async () => {
    expect(hmacSecret).toBeDefined();
    const get = await request(app.getHttpServer()).get(`/devices/${deviceId}`).set(auth);
    expect(get.body.hmacSecret).toBeUndefined();
  });

  it('rejects a webhook with a bad signature', async () => {
    const body = { eventId: crypto.randomUUID(), heartRate: 80, recordedAt: new Date().toISOString() };
    const res = await request(app.getHttpServer())
      .post(`/webhooks/devices/${serialNumber}`)
      .set('X-Signature', 'not-a-real-signature'.repeat(3))
      .send(body);
    expect(res.status).toBe(401);
  });

  it('rejects an unknown device serial number', async () => {
    const body = { eventId: crypto.randomUUID(), heartRate: 80, recordedAt: new Date().toISOString() };
    const { signature } = sign(body, hmacSecret);
    const res = await request(app.getHttpServer())
      .post('/webhooks/devices/does-not-exist')
      .set('X-Signature', signature)
      .send(body);
    expect(res.status).toBe(401);
  });

  it('rejects a malformed payload', async () => {
    const body = { eventId: '', heartRate: 'not-a-number', recordedAt: 'not-a-date' };
    const { raw, signature } = sign(body, hmacSecret);
    const res = await request(app.getHttpServer())
      .post(`/webhooks/devices/${serialNumber}`)
      .set('X-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(raw);
    expect(res.status).toBe(400);
  });

  it('accepts a valid webhook and responds quickly', async () => {
    const body = { eventId: crypto.randomUUID(), heartRate: 80, recordedAt: new Date().toISOString() };
    const { signature } = sign(body, hmacSecret);
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post(`/webhooks/devices/${serialNumber}`)
      .set('X-Signature', signature)
      .send(body);
    const elapsedMs = Date.now() - start;
    expect(res.status).toBe(200);
    // Generous bound for CI/dev jitter; the point is "fast", not "exactly 50ms".
    expect(elapsedMs).toBeLessThan(500);
  });

  it('sending the SAME webhook 10 times creates exactly 1 webhook_event row', async () => {
    const eventId = crypto.randomUUID();
    const body = { eventId, heartRate: 82, recordedAt: new Date().toISOString() };
    const { signature } = sign(body, hmacSecret);

    const requests = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post(`/webhooks/devices/${serialNumber}`)
        .set('X-Signature', signature)
        .send(body),
    );
    const responses = await Promise.all(requests);
    responses.forEach((res) => expect(res.status).toBe(200));

    const events = await prisma.webhookEvent.findMany({
      where: { deviceId, externalEventId: eventId },
    });
    expect(events.length).toBe(1);
  });

  it('the worker (running separately) processes a webhook into exactly one reading', async () => {
    const eventId = crypto.randomUUID();
    const body = { eventId, heartRate: 90, recordedAt: new Date().toISOString() };
    const { signature } = sign(body, hmacSecret);

    await request(app.getHttpServer())
      .post(`/webhooks/devices/${serialNumber}`)
      .set('X-Signature', signature)
      .send(body);

    const event = await pollUntil(
      () => prisma.webhookEvent.findFirstOrThrow({ where: { deviceId, externalEventId: eventId } }),
      (e) => e.processedAt !== null,
    );
    expect(event.processedAt).not.toBeNull();

    const readings = await prisma.reading.findMany({ where: { webhookEventId: event.id } });
    expect(readings.length).toBe(1);
    expect(readings[0].heartRate).toBe(90);
  });

  it('a sustained high rolling average creates exactly one open alert, not one per reading', async () => {
    const now = Date.now();
    // Six readings, all recent, all well above the 115bpm threshold.
    for (let i = 0; i < 6; i++) {
      const eventId = crypto.randomUUID();
      const body = {
        eventId,
        heartRate: 140,
        recordedAt: new Date(now - i * 60_000).toISOString(),
      };
      const { signature } = sign(body, hmacSecret);
      await request(app.getHttpServer())
        .post(`/webhooks/devices/${serialNumber}`)
        .set('X-Signature', signature)
        .send(body);
    }

    const patient = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });

    const openAlerts = await pollUntil(
      () =>
        prisma.alert.findMany({
          where: { patientId: patient.patientId, dedupeKey: 'high_heart_rate', status: 'open' },
        }),
      (alerts) => alerts.length >= 1,
    );
    expect(openAlerts.length).toBe(1);
  });
});
