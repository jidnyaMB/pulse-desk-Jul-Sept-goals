import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

// A SEPARATE Prisma client, connected as a restricted, non-superuser Postgres
// role (pulsedesk_app — see prisma/migrations/*_enable_rls). Only this client
// is used for tenant-scoped data. Even if application code forgets to call
// withTenant(), RLS still applies because this role cannot bypass it — unlike
// the default PrismaService, which connects as the migration/admin role.
@Injectable()
export class TenantPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: { url: configService.getOrThrow<string>('APP_DATABASE_URL') },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
