import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('OpenFGA relationship authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let auth: { Authorization: string };

  async function pollUntil(fn: () => Promise<number>, expected: number, attempts = 20) {
    let status = -1;
    for (let i = 0; i < attempts; i++) {
      status = await fn();
      if (status === expected) return status;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return status;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.alert.deleteMany();
    await prisma.device.deleteMany();
    await prisma.careTeamPatient.deleteMany();
    await prisma.careTeamMembership.deleteMany();
    await prisma.careTeam.deleteMany();
    await prisma.accessGrant.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.outboxEvent.deleteMany();

    await request(app.getHttpServer()).post('/tenants/signup').send({
      tenantSlug: 'fga-tenant',
      tenantName: 'FGA Tenant',
      email: 'doctor@fga-tenant.com',
      password: 'password123',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantSlug: 'fga-tenant', email: 'doctor@fga-tenant.com', password: 'password123' });
    token = login.body.accessToken;
    auth = { Authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies GET /patients/:id when the clinician is on no covering care team', async () => {
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'No', lastName: 'Team' });

    const res = await request(app.getHttpServer())
      .get(`/patients/${patient.body.id}`)
      .set(auth);
    expect(res.status).toBe(403);
  });

  it('grants view access once the clinician joins a covering care team, and revokes it the moment they leave — no restart, no redeploy', async () => {
    const me = await request(app.getHttpServer()).get('/auth/me').set(auth);
    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set(auth)
      .send({ firstName: 'Revocation', lastName: 'Case' });
    const team = await request(app.getHttpServer())
      .post('/care-teams')
      .set(auth)
      .send({ name: 'Cardiology A' });

    await request(app.getHttpServer())
      .post(`/care-teams/${team.body.id}/members`)
      .set(auth)
      .send({ userId: me.body.id });
    await request(app.getHttpServer())
      .post(`/care-teams/${team.body.id}/patients`)
      .set(auth)
      .send({ patientId: patient.body.id });

    const grantedStatus = await pollUntil(
      async () =>
        (await request(app.getHttpServer()).get(`/patients/${patient.body.id}`).set(auth)).status,
      200,
    );
    expect(grantedStatus).toBe(200);

    // Remove the clinician from the team — access must stop immediately,
    // without any deploy and without waiting for the JWT to expire.
    await request(app.getHttpServer())
      .delete(`/care-teams/${team.body.id}/members/${me.body.id}`)
      .set(auth);

    const revokedStatus = await pollUntil(
      async () =>
        (await request(app.getHttpServer()).get(`/patients/${patient.body.id}`).set(auth)).status,
      403,
    );
    expect(revokedStatus).toBe(403);
  });
});
