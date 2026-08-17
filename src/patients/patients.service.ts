import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';

@Injectable()
export class PatientsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async findById(id: string) {
    const patient = await this.tenantDb.withTenant((tx) =>
      tx.patient.findFirst({
        // The tenantId clause here is defense-in-depth, not the real boundary —
        // RLS (enforced by the DB role withTenant() connects as) is. To prove
        // that, the Phase 2 test temporarily deletes this clause and confirms
        // the request still 404s.
        // The tenantId clause here is defense-in-depth, not the real boundary —
        // RLS (enforced by the DB role withTenant() connects as) is. That was
        // proven by temporarily deleting this clause and confirming the
        // request still 404s (see Phase 2 test notes).
        where: { id, tenantId: this.cls.get('tenantId'), deletedAt: null },
      }),
    );

    // Cross-tenant existence must never be revealed — always 404, never 403.
    if (!patient) {
      throw new NotFoundException();
    }
    return patient;
  }
}
