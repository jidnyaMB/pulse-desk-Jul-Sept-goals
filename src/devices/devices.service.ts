import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import * as crypto from 'crypto';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

function omitSecret<T extends { hmacSecret: string }>(device: T): Omit<T, 'hmacSecret'> {
  const { hmacSecret: _hmacSecret, ...rest } = device;
  return rest;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  // hmacSecret is generated here and returned ONLY in this response — every
  // other read of a device (list/findById) strips it. Whoever provisions the
  // physical device needs to see it once to configure the device's signing key.
  async create(dto: CreateDeviceDto) {
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, tenantId: tenantId!, deletedAt: null },
      });
      if (!patient) {
        throw new NotFoundException('patientId not found in this tenant');
      }
      return tx.device.create({
        data: {
          tenantId: tenantId!,
          patientId: dto.patientId,
          serialNumber: dto.serialNumber,
          hmacSecret: crypto.randomBytes(32).toString('hex'),
        },
      });
    });
  }

  async list(patientId?: string) {
    const devices = await this.tenantDb.withTenant((tx) =>
      tx.device.findMany({
        where: { tenantId: this.cls.get('tenantId'), ...(patientId ? { patientId } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return devices.map(omitSecret);
  }

  async findById(id: string) {
    const device = await this.tenantDb.withTenant((tx) =>
      tx.device.findFirst({ where: { id, tenantId: this.cls.get('tenantId') } }),
    );
    if (!device) {
      throw new NotFoundException();
    }
    return omitSecret(device);
  }

  async update(id: string, dto: UpdateDeviceDto) {
    await this.findById(id);
    const device = await this.tenantDb.withTenant((tx) =>
      tx.device.update({ where: { id }, data: dto }),
    );
    return omitSecret(device);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.tenantDb.withTenant((tx) => tx.device.delete({ where: { id } }));
  }
}
