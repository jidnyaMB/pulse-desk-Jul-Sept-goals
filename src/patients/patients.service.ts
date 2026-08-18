import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
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

  async findById(id: string) {
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
    if (!patient) {
      throw new NotFoundException();
    }
    return patient;
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findById(id); // 404s if missing/cross-tenant before attempting the write
    return this.tenantDb.withTenant((tx) =>
      tx.patient.update({
        where: { id },
        data: dto,
      }),
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await this.tenantDb.withTenant((tx) =>
      tx.patient.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    );
  }
}
