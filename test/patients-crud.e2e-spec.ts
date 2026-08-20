import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Patients CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.alert.deleteMany();
    await prisma.reading.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await prisma.device.deleteMany();
    await prisma.careTeamPatient.deleteMany();
    await prisma.careTeamMembership.deleteMany();
    await prisma.careTeam.deleteMany();
    await prisma.accessGrant.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();

    await request(app.getHttpServer()).post('/tenants/signup').send({
      tenantSlug: 'crud-tenant',
      tenantName: 'CRUD Tenant',
      email: 'doctor@crud-tenant.com',
      password: 'password123',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantSlug: 'crud-tenant', email: 'doctor@crud-tenant.com', password: 'password123' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  // Phase 4: viewing/editing a patient now requires care-team membership,
  // not just being in the same tenant. Grants relay through the outbox into
  // OpenFGA asynchronously (~500ms poll interval), so tests that need "can
  // view/edit" retry briefly instead of asserting immediately after the grant.
  async function grantEditorAccessAndWait(patientId: string) {
    const me = await request(app.getHttpServer()).get('/auth/me').set(auth());
    const team = await request(app.getHttpServer())
      .post('/care-teams')
      .set(auth())
      .send({ name: `Team for ${patientId}` });
    await request(app.getHttpServer())
      .post(`/care-teams/${team.body.id}/members`)
      .set(auth())
      .send({ userId: me.body.id });
    await request(app.getHttpServer())
      .post(`/care-teams/${team.body.id}/patients`)
      .set(auth())
      .send({ patientId });

    for (let attempt = 0; attempt < 20; attempt++) {
      const check = await request(app.getHttpServer()).get(`/patients/${patientId}`).set(auth());
      if (check.status === 200) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Timed out waiting for OpenFGA grant to relay via outbox');
  }

  it('creates, lists, updates, and soft-deletes a patient', async () => {
    const create = await request(app.getHttpServer())
      .post('/patients')
      .set(auth())
      .send({ firstName: 'Jane', lastName: 'Doe' });
    expect(create.status).toBe(201);
    const patientId = create.body.id;

    const list = await request(app.getHttpServer()).get('/patients').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.some((p: { id: string }) => p.id === patientId)).toBe(true);

    await grantEditorAccessAndWait(patientId);

    const update = await request(app.getHttpServer())
      .patch(`/patients/${patientId}`)
      .set(auth())
      .send({ lastName: 'Smith' });
    expect(update.status).toBe(200);
    expect(update.body.lastName).toBe('Smith');

    const del = await request(app.getHttpServer()).delete(`/patients/${patientId}`).set(auth());
    expect(del.status).toBe(204);

    const listAfter = await request(app.getHttpServer()).get('/patients').set(auth());
    expect(listAfter.body.some((p: { id: string }) => p.id === patientId)).toBe(false);

    const getAfter = await request(app.getHttpServer()).get(`/patients/${patientId}`).set(auth());
    expect(getAfter.status).toBe(404);
  });

  it('rejects a create body with an unexpected field (whitelist)', async () => {
    const res = await request(app.getHttpServer())
      .post('/patients')
      .set(auth())
      .send({ firstName: 'X', lastName: 'Y', tenantId: 'attacker-supplied' });
    expect(res.status).toBe(400);
  });

  it('links a patient to a care team and lists it back', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth())
      .send({ firstName: 'Linked', lastName: 'Patient' });

    const team = await request(app.getHttpServer())
      .post('/care-teams')
      .set(auth())
      .send({ name: 'Team X' });

    const link = await request(app.getHttpServer())
      .post(`/care-teams/${team.body.id}/patients`)
      .set(auth())
      .send({ patientId: patient.body.id });
    expect(link.status).toBe(201);

    const listPatients = await request(app.getHttpServer())
      .get(`/care-teams/${team.body.id}/patients`)
      .set(auth());
    expect(listPatients.body.some((cp: any) => cp.patientId === patient.body.id)).toBe(true);
  });

  it('rejects creating a device for a patientId that does not exist in this tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/devices')
      .set(auth())
      .send({ patientId: '00000000-0000-0000-0000-000000000000', serialNumber: 'X-1' });
    expect(res.status).toBe(404);
  });

  it('creates and resolves an alert for a patient', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth())
      .send({ firstName: 'Alert', lastName: 'Case' });

    const alert = await request(app.getHttpServer())
      .post('/alerts')
      .set(auth())
      .send({ patientId: patient.body.id, severity: 'high', message: 'test' });
    expect(alert.status).toBe(201);
    expect(alert.body.status).toBe('open');

    const resolved = await request(app.getHttpServer())
      .patch(`/alerts/${alert.body.id}`)
      .set(auth())
      .send({ status: 'resolved' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.resolvedAt).not.toBeNull();
  });
});
