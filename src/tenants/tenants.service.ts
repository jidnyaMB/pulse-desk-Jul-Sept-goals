import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (existing) {
      throw new ConflictException('A tenant with this slug already exists');
    }

    const tenant = await this.prisma.tenant.create({
      data: { slug: dto.tenantSlug, name: dto.tenantName },
    });

    const user = await this.usersService.createUser({
      tenantId: tenant.id,
      email: dto.email,
      password: dto.password,
      role: 'admin',
    });

    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
