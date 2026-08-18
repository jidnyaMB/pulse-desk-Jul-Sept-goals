import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  create(dto: CreateAlertDto) {
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, tenantId: tenantId!, deletedAt: null },
      });
      if (!patient) {
        throw new NotFoundException('patientId not found in this tenant');
      }
      return tx.alert.create({
        data: {
          tenantId: tenantId!,
          patientId: dto.patientId,
          severity: dto.severity,
          message: dto.message,
        },
      });
    });
  }

  list(patientId?: string) {
    return this.tenantDb.withTenant((tx) =>
      tx.alert.findMany({
        where: { tenantId: this.cls.get('tenantId'), ...(patientId ? { patientId } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findById(id: string) {
    const alert = await this.tenantDb.withTenant((tx) =>
      tx.alert.findFirst({ where: { id, tenantId: this.cls.get('tenantId') } }),
    );
    if (!alert) {
      throw new NotFoundException();
    }
    return alert;
  }

  async update(id: string, dto: UpdateAlertDto) {
    await this.findById(id);
    return this.tenantDb.withTenant((tx) =>
      tx.alert.update({
        where: { id },
        data: { status: dto.status, resolvedAt: dto.status === 'resolved' ? new Date() : null },
      }),
    );
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.tenantDb.withTenant((tx) => tx.alert.delete({ where: { id } }));
  }
}
