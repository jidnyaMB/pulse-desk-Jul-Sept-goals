import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tenant isolation / RLS (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantAToken: string;
  let patientAId: string;
  let patientBId: string;

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
    await prisma.patient.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();

    await request(app.getHttpServer()).post('/tenants/signup').send({
      tenantSlug: 'iso-tenant-a',
      tenantName: 'Iso Tenant A',
      email: 'doctor@iso-a.com',
      password: 'password123',
    });
    const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'iso-tenant-a' } });

    const signupB = await request(app.getHttpServer()).post('/tenants/signup').send({
      tenantSlug: 'iso-tenant-b',
      tenantName: 'Iso Tenant B',
      email: 'doctor@iso-b.com',
      password: 'password123',
    });
    const tenantBId = signupB.body.tenant.id;

    const patientA = await prisma.patient.create({
      data: { tenantId: tenantA.id, firstName: 'Alice', lastName: 'A' },
    });
    const patientB = await prisma.patient.create({
      data: { tenantId: tenantBId, firstName: 'Bob', lastName: 'B' },
    });
    patientAId = patientA.id;
    patientBId = patientB.id;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantSlug: 'iso-tenant-a', email: 'doctor@iso-a.com', password: 'password123' });
    tenantAToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows a tenant to read its own patient', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientAId}`)
      .set('Authorization', `Bearer ${tenantAToken}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 (never 403) for another tenant patient by exact UUID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientBId}`)
      .set('Authorization', `Bearer ${tenantAToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects the request entirely with no auth', async () => {
    const res = await request(app.getHttpServer()).get(`/patients/${patientAId}`);
    expect(res.status).toBe(401);
  });

  it('fails closed at the database when tenant context is never set (RLS, not app code)', async () => {
    // Talk to the restricted app_database_url role directly, bypassing
    // withTenant()/ALS entirely — app.tenant_id is never set for this
    // connection. If RLS is doing its job, this sees nothing, even though
    // rows exist for both tenants.
    const restrictedClient = new PrismaClient({
      datasources: { db: { url: process.env.APP_DATABASE_URL! } },
    });
    try {
      const rows = await restrictedClient.patient.findMany();
      expect(rows.length).toBe(0);
    } finally {
      await restrictedClient.$disconnect();
    }
  });
});
