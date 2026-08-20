// Dev-only fixture generator for the Phase 2 mandatory RLS test.
// Run with: npx ts-node -r tsconfig-paths/register prisma/seed-tenant-isolation-test.ts
//
// Creates Tenant A (+ a doctor login) and Tenant B (+ a patient), using the
// admin/superuser connection directly — RLS does not apply to this script,
// which is fine: seeding fixtures is not the thing under test.
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.patient.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany({ where: { slug: { in: ['tenant-a', 'tenant-b'] } } });

  const tenantA = await prisma.tenant.create({ data: { slug: 'tenant-a', name: 'Tenant A Clinic' } });
  const tenantB = await prisma.tenant.create({ data: { slug: 'tenant-b', name: 'Tenant B Clinic' } });

  const passwordHash = await argon2.hash('password123', { type: argon2.argon2id });
  const doctorA = await prisma.user.create({
    data: { tenantId: tenantA.id, email: 'doctor@tenant-a.com', passwordHash, role: 'doctor' },
  });

  const patientA = await prisma.patient.create({
    data: { tenantId: tenantA.id, firstName: 'Alice', lastName: 'InTenantA' },
  });
  const patientB = await prisma.patient.create({
    data: { tenantId: tenantB.id, firstName: 'Bob', lastName: 'InTenantB' },
  });

  console.log('Seed complete.\n');
  console.log('Login as the Tenant A doctor:');
  console.log(
    `  curl -s -X POST localhost:3001/auth/login -H 'Content-Type: application/json' -d '{"tenantSlug":"tenant-a","email":"doctor@tenant-a.com","password":"password123"}'`,
  );
  console.log(`\nTenant A doctor id: ${doctorA.id}`);
  console.log(`Patient A (belongs to Tenant A) id: ${patientA.id}  -> GET should 403 initially`);
  console.log(
    '  (as of Phase 4, viewing needs care-team membership too — this patient has no team yet.',
  );
  console.log(
    '   Create a care team, POST the doctor as a member, POST this patient into the team, then GET should return 200.',
  );
  console.log(
    '   Or use POST /patients/:id/grants or /patients/:id/break-glass for temporary access instead.)',
  );
  console.log(`Patient B (belongs to Tenant B) id: ${patientB.id}  -> GET should 404 (cross-tenant, always)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
