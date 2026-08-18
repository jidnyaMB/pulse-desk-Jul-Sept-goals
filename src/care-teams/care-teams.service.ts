import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { TenantDbService } from '../prisma/tenant-db.service';
import { AddMemberDto } from './dto/add-member.dto';
import { AddPatientDto } from './dto/add-patient.dto';
import { CreateCareTeamDto } from './dto/create-care-team.dto';
import { UpdateCareTeamDto } from './dto/update-care-team.dto';

@Injectable()
export class CareTeamsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  create(dto: CreateCareTeamDto) {
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant((tx) =>
      tx.careTeam.create({ data: { tenantId: tenantId!, name: dto.name } }),
    );
  }

  list() {
    return this.tenantDb.withTenant((tx) =>
      tx.careTeam.findMany({
        where: { tenantId: this.cls.get('tenantId') },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findById(id: string) {
    const careTeam = await this.tenantDb.withTenant((tx) =>
      tx.careTeam.findFirst({ where: { id, tenantId: this.cls.get('tenantId') } }),
    );
    if (!careTeam) {
      throw new NotFoundException();
    }
    return careTeam;
  }

  async update(id: string, dto: UpdateCareTeamDto) {
    await this.findById(id);
    return this.tenantDb.withTenant((tx) => tx.careTeam.update({ where: { id }, data: dto }));
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.tenantDb.withTenant(async (tx) => {
      await tx.careTeamMembership.deleteMany({ where: { careTeamId: id } });
      await tx.careTeamPatient.deleteMany({ where: { careTeamId: id } });
      await tx.careTeam.delete({ where: { id } });
    });
  }

  async listMembers(careTeamId: string) {
    await this.findById(careTeamId);
    return this.tenantDb.withTenant((tx) =>
      tx.careTeamMembership.findMany({ where: { careTeamId } }),
    );
  }

  async addMember(careTeamId: string, dto: AddMemberDto) {
    await this.findById(careTeamId);
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant((tx) =>
      tx.careTeamMembership.create({
        data: { tenantId: tenantId!, careTeamId, userId: dto.userId },
      }),
    );
  }

  async removeMember(careTeamId: string, userId: string): Promise<void> {
    await this.findById(careTeamId);
    await this.tenantDb.withTenant((tx) =>
      tx.careTeamMembership.deleteMany({ where: { careTeamId, userId } }),
    );
  }

  async listPatients(careTeamId: string) {
    await this.findById(careTeamId);
    return this.tenantDb.withTenant((tx) =>
      tx.careTeamPatient.findMany({ where: { careTeamId }, include: { patient: true } }),
    );
  }

  async addPatient(careTeamId: string, dto: AddPatientDto) {
    await this.findById(careTeamId);
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant((tx) =>
      tx.careTeamPatient.create({
        data: { tenantId: tenantId!, careTeamId, patientId: dto.patientId },
      }),
    );
  }

  async removePatient(careTeamId: string, patientId: string): Promise<void> {
    await this.findById(careTeamId);
    await this.tenantDb.withTenant((tx) =>
      tx.careTeamPatient.deleteMany({ where: { careTeamId, patientId } }),
    );
  }
}
