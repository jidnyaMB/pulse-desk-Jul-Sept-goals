import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@Injectable()
export class DevicesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  create(dto: CreateDeviceDto) {
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant(async (tx) => {
      // Even though the FK alone would reject a nonexistent patientId, it
      // does not know about tenant boundaries — explicitly confirm the
      // patient is in THIS tenant before letting a device attach to it.
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, tenantId: tenantId!, deletedAt: null },
      });
      if (!patient) {
        throw new NotFoundException('patientId not found in this tenant');
      }
      return tx.device.create({
        data: { tenantId: tenantId!, patientId: dto.patientId, serialNumber: dto.serialNumber },
      });
    });
  }

  list(patientId?: string) {
    return this.tenantDb.withTenant((tx) =>
      tx.device.findMany({
        where: { tenantId: this.cls.get('tenantId'), ...(patientId ? { patientId } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findById(id: string) {
    const device = await this.tenantDb.withTenant((tx) =>
      tx.device.findFirst({ where: { id, tenantId: this.cls.get('tenantId') } }),
    );
    if (!device) {
      throw new NotFoundException();
    }
    return device;
  }

  async update(id: string, dto: UpdateDeviceDto) {
    await this.findById(id);
    return this.tenantDb.withTenant((tx) => tx.device.update({ where: { id }, data: dto }));
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.tenantDb.withTenant((tx) => tx.device.delete({ where: { id } }));
  }
}
