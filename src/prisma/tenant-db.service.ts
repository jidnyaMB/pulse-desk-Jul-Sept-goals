import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantPrismaService } from './tenant-prisma.service';

@Injectable()
export class TenantDbService {
  constructor(
    private readonly cls: ClsService<AppClsStore>,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  // Every tenant-scoped DB operation must go through here. It opens a
  // transaction, sets app.tenant_id for THIS transaction only (SET LOCAL /
  // set_config(..., true) — never a session-level SET, which would leak
  // across pooled connections), then runs the callback inside it. tenantId
  // comes from ALS, never from a caller-supplied argument.
  async withTenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const tenantId = this.cls.get('tenantId');
    if (!tenantId) {
      throw new UnauthorizedException('Missing tenant context');
    }

    return this.tenantPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
