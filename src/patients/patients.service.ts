import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { FgaService } from '../fga/fga.service';
import { TenantDbService } from '../prisma/tenant-db.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly fgaService: FgaService,
  ) {}

  create(dto: CreatePatientDto) {
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant((tx) =>
      tx.patient.create({
        data: { tenantId: tenantId!, firstName: dto.firstName, lastName: dto.lastName },
      }),
    );
  }

  list() {
    return this.tenantDb.withTenant((tx) =>
      tx.patient.findMany({
        where: { tenantId: this.cls.get('tenantId'), deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  // Tenant-scoped existence only — no permission check. Deliberately kept
  // separate from findById() so callers that need a different relation
  // (editor vs viewer) can run the SAME existence check before branching on
  // permission, without duplicating the 404 logic.
  private async getOwnedOrThrow(id: string) {
    const patient = await this.tenantDb.withTenant((tx) =>
      tx.patient.findFirst({
        // The tenantId clause here is defense-in-depth, not the real boundary —
        // RLS (enforced by the DB role withTenant() connects as) is. That was
        // proven by temporarily deleting this clause and confirming the
        // request still 404s (see Phase 2 test notes).
        where: { id, tenantId: this.cls.get('tenantId'), deletedAt: null },
      }),
    );
    // Cross-tenant existence must never be revealed — always 404, never 403.
    // This is why permission (FGA) is checked AFTER this, not before: if we
    // checked FGA first, a cross-tenant id (which has no FGA relationship
    // either) would 403 instead of 404, leaking that "something" exists.
    if (!patient) {
      throw new NotFoundException();
    }
    return patient;
  }

  private async assertPermission(patientId: string, relation: 'viewer' | 'editor') {
    const userId = this.cls.get('userId');
    const allowed = await this.fgaService.check(userId!, relation, 'patient', patientId);
    if (!allowed) {
      throw new ForbiddenException();
    }
  }

  async findById(id: string) {
    const patient = await this.getOwnedOrThrow(id);
    await this.assertPermission(id, 'viewer');
    return patient;
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.getOwnedOrThrow(id);
    await this.assertPermission(id, 'editor');
    return this.tenantDb.withTenant((tx) =>
      tx.patient.update({
        where: { id },
        data: dto,
      }),
    );
  }

  async softDelete(id: string): Promise<void> {
    // Deletion isn't granted by "editor" — see Phase 4 milestone notes:
    // a real owner/admin relation for delete is a follow-up model change.
    // For now this stays tenant-scoped only, same as before Phase 4.
    await this.getOwnedOrThrow(id);
    await this.tenantDb.withTenant((tx) =>
      tx.patient.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    );
  }
}
