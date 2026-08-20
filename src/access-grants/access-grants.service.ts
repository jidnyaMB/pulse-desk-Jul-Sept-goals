import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../common/cls/app-cls-store.interface';
import { ContextualTuple } from '../fga/fga.service';
import { TenantDbService } from '../prisma/tenant-db.service';
import { BreakGlassDto } from './dto/break-glass.dto';
import { CreateGrantDto } from './dto/create-grant.dto';

@Injectable()
export class AccessGrantsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly configService: ConfigService,
  ) {}

  private async assertPatientInTenant(tx: any, patientId: string) {
    const tenantId = this.cls.get('tenantId');
    const patient = await tx.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException();
    }
  }

  async createGrant(patientId: string, dto: CreateGrantDto) {
    const tenantId = this.cls.get('tenantId');
    return this.tenantDb.withTenant(async (tx) => {
      await this.assertPatientInTenant(tx, patientId);
      return tx.accessGrant.create({
        data: {
          tenantId: tenantId!,
          patientId,
          userId: dto.userId,
          relation: dto.relation,
          reason: dto.reason ?? 'manual_grant',
          expiresAt: new Date(dto.expiresAt),
        },
      });
    });
  }

  async listGrants(patientId: string) {
    return this.tenantDb.withTenant((tx) =>
      tx.accessGrant.findMany({
        where: { tenantId: this.cls.get('tenantId'), patientId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async revokeGrant(patientId: string, grantId: string): Promise<void> {
    const grant = await this.tenantDb.withTenant((tx) =>
      tx.accessGrant.findFirst({
        where: { id: grantId, patientId, tenantId: this.cls.get('tenantId') },
      }),
    );
    if (!grant) {
      throw new NotFoundException();
    }
    await this.tenantDb.withTenant((tx) =>
      tx.accessGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } }),
    );
  }

  // Turns currently-valid (not expired, not revoked) grant rows into
  // contextual tuples for a single OpenFGA check call. Nothing here is ever
  // written into the OpenFGA store — expiry/revocation just means a row
  // silently stops matching this query, no cleanup needed anywhere.
  async getValidContextualTuples(userId: string, patientId: string): Promise<ContextualTuple[]> {
    const grants = await this.tenantDb.withTenant((tx) =>
      tx.accessGrant.findMany({
        where: {
          tenantId: this.cls.get('tenantId'),
          userId,
          patientId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    );
    return grants.map((g) => ({
      user: `user:${userId}`,
      relation: `granted_${g.relation}`,
      object: `patient:${patientId}`,
    }));
  }

  // Emergency self-service access: grants the CALLER viewer+editor on this
  // patient for a short, configured window, bypassing care-team membership
  // entirely. Mandatory justification, always audited.
  async breakGlass(patientId: string, dto: BreakGlassDto) {
    const tenantId = this.cls.get('tenantId');
    const userId = this.cls.get('userId');
    const ttlHours = this.configService.getOrThrow<number>('BREAK_GLASS_TTL_HOURS');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    return this.tenantDb.withTenant(async (tx) => {
      await this.assertPatientInTenant(tx, patientId);
      const grants = await Promise.all(
        (['viewer', 'editor'] as const).map((relation) =>
          tx.accessGrant.create({
            data: {
              tenantId: tenantId!,
              patientId,
              userId: userId!,
              relation,
              reason: 'break_glass',
              justification: dto.justification,
              expiresAt,
            },
          }),
        ),
      );

      await tx.auditLog.create({
        data: {
          tenantId: tenantId!,
          actorUserId: userId!,
          action: 'grant.break_glass',
          resourceType: 'patient',
          resourceId: patientId,
          metadata: { justification: dto.justification, expiresAt: expiresAt.toISOString() },
        },
      });

      return { grants, expiresAt };
    });
  }
}
