import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Access grants & break-glass (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let auth: { Authorization: string };
  let myUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.auditLog.deleteMany();
    await prisma.accessGrant.deleteMany();
    await prisma.alert.deleteMany();
    await prisma.device.deleteMany();
    await prisma.careTeamPatient.deleteMany();
    await prisma.careTeamMembership.deleteMany();
    await prisma.careTeam.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.outboxEvent.deleteMany();

    await request(app.getHttpServer()).post('/tenants/signup').send({
      tenantSlug: 'grants-tenant',
      tenantName: 'Grants Tenant',
      email: 'doctor@grants-tenant.com',
      password: 'password123',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantSlug: 'grants-tenant', email: 'doctor@grants-tenant.com', password: 'password123' });
    token = login.body.accessToken;
    auth = { Authorization: `Bearer ${token}` };

    const me = await request(app.getHttpServer()).get('/auth/me').set(auth);
    myUserId = me.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a temporary grant allows immediate access with no care-team membership', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'Grant', lastName: 'Case' });

    const denied = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(denied.status).toBe(403);

    const grant = await request(app.getHttpServer())
      .post(`/patients/${patient.body.id}/grants`)
      .set(auth)
      .send({
        userId: myUserId,
        relation: 'viewer',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: 'on_call',
      });
    expect(grant.status).toBe(201);

    // No outbox/relay involved for grants — access-grants are checked live
    // against Postgres via contextual tuples, so this should work immediately.
    const allowed = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(allowed.status).toBe(200);
  });

  it('a viewer-only grant does not allow editing (relation-specific)', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'ViewerOnly', lastName: 'Case' });

    await request(app.getHttpServer())
      .post(`/patients/${patient.body.id}/grants`)
      .set(auth)
      .send({
        userId: myUserId,
        relation: 'viewer',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

    const getRes = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(getRes.status).toBe(200);

    const patchRes = await request(app.getHttpServer())
      .patch(`/patients/${patient.body.id}`)
      .set(auth)
      .send({ lastName: 'ShouldFail' });
    expect(patchRes.status).toBe(403);
  });

  it('an expired grant denies access automatically, with no manual revocation', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'Expiring', lastName: 'Case' });

    await request(app.getHttpServer())
      .post(`/patients/${patient.body.id}/grants`)
      .set(auth)
      .send({
        userId: myUserId,
        relation: 'viewer',
        expiresAt: new Date(Date.now() + 1000).toISOString(), // expires in 1s
      });

    const beforeExpiry = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(beforeExpiry.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const afterExpiry = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(afterExpiry.status).toBe(403);
  });

  it('a manually revoked grant denies access before its natural expiry', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'Revoked', lastName: 'Case' });

    const grant = await request(app.getHttpServer())
      .post(`/patients/${patient.body.id}/grants`)
      .set(auth)
      .send({
        userId: myUserId,
        relation: 'viewer',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

    expect(
      (await request(app.getHttpServer()).get(`/patients/${patient.body.id}`).set(auth)).status,
    ).toBe(200);

    const revoke = await request(app.getHttpServer())
      .delete(`/patients/${patient.body.id}/grants/${grant.body.id}`)
      .set(auth);
    expect(revoke.status).toBe(204);

    expect(
      (await request(app.getHttpServer()).get(`/patients/${patient.body.id}`).set(auth)).status,
    ).toBe(403);
  });

  it('break-glass requires a justification', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'BreakGlass', lastName: 'NoJustification' });

    const res = await request(app.getHttpServer())
      .post(`/patients/${patient.body.id}/break-glass`)
      .set(auth)
      .send({});
    expect(res.status).toBe(400);
  });

  it('break-glass grants immediate emergency access and creates an audit record', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'BreakGlass', lastName: 'Case' });

    const denied = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(denied.status).toBe(403);

    const breakGlass = await request(app.getHttpServer())
      .post(`/patients/${patient.body.id}/break-glass`)
      .set(auth)
      .send({ justification: 'Patient deterioration requires immediate review.' });
    expect(breakGlass.status).toBe(201);

    const allowed = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(allowed.status).toBe(200);

    const editAllowed = await request(app.getHttpServer())
      .patch(`/patients/${patient.body.id}`)
      .set(auth)
      .send({ lastName: 'UpdatedViaBreakGlass' });
    expect(editAllowed.status).toBe(200);

    const auditRows = await prisma.auditLog.findMany({
      where: { action: 'grant.break_glass', resourceId: patient.body.id },
    });
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].actorUserId).toBe(myUserId);
  });
});
