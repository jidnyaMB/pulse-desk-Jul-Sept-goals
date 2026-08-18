import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Clean slate so this suite is repeatable against a persistent dev DB.
    // Order matters: child tables (FK to patients/tenants) before parents.
    await prisma.alert.deleteMany();
    await prisma.device.deleteMany();
    await prisma.careTeamPatient.deleteMany();
    await prisma.careTeamMembership.deleteMany();
    await prisma.careTeam.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signup(tenantSlug: string, email = 'doctor@example.com', password = 'password123') {
    return request(app.getHttpServer())
      .post('/tenants/signup')
      .send({ tenantSlug, tenantName: `${tenantSlug} clinic`, email, password });
  }

  async function login(tenantSlug: string, email = 'doctor@example.com', password = 'password123') {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantSlug, email, password });
  }

  it('signs up a new tenant + admin user', async () => {
    const res = await signup('riverside');
    expect(res.status).toBe(201);
    expect(res.body.tenant.slug).toBe('riverside');
    expect(res.body.user.email).toBe('doctor@example.com');
  });

  it('rejects a duplicate tenant slug', async () => {
    const res = await signup('riverside');
    expect(res.status).toBe(409);
  });

  it('allows the same email in a different tenant (per-tenant uniqueness)', async () => {
    const res = await signup('lakeside');
    expect(res.status).toBe(201);
  });

  it('logs in with valid credentials', async () => {
    const res = await login('riverside');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects an invalid password', async () => {
    const res = await login('riverside', 'doctor@example.com', 'wrong-password');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await login('riverside', 'nobody@example.com', 'password123');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown tenant slug', async () => {
    const res = await login('does-not-exist');
    expect(res.status).toBe(401);
  });

  it('returns the current user from /auth/me with a valid access token', async () => {
    const { body } = await login('riverside');
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('doctor@example.com');
    expect(res.body.tenantId).toBeDefined();
  });

  it('rejects /auth/me with no token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects /auth/me with a garbage token', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token on /auth/refresh, and the old one stops working', async () => {
    const { body: loginBody } = await login('riverside');

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.refreshToken).not.toBe(loginBody.refreshToken);

    const reuseRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    expect(reuseRes.status).toBe(401);
  });

  it('detects refresh-token replay and revokes the whole family, including the newest token', async () => {
    const { body: loginBody } = await login('riverside');

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    const newToken = rotated.body.refreshToken;

    // Replay the dead (already-rotated) token — this should revoke the family.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });

    // The newest, otherwise-valid token from the same family must now be dead too.
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: newToken });
    expect(res.status).toBe(401);
  });

  it('logs out and invalidates the refresh token', async () => {
    const { body: loginBody } = await login('riverside');

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: loginBody.refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('rejects a login body with an unexpected extra field', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantSlug: 'riverside', email: 'doctor@example.com', password: 'password123', extra: 'nope' });
    expect(res.status).toBe(400);
  });
});
