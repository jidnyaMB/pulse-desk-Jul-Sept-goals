import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(params: {
    tenantId: string;
    email: string;
    password: string;
    role?: string;
  }) {
    const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });
    return this.prisma.user.create({
      data: {
        tenantId: params.tenantId,
        email: params.email.toLowerCase(),
        passwordHash,
        role: params.role ?? 'admin',
      },
    });
  }

  findByTenantAndEmail(tenantId: string, email: string) {
    return this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findTenantBySlug(slug: string) {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }
}
