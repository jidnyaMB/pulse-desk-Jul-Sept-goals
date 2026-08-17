import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import * as argon2 from 'argon2';
import { Request } from 'express';
import { Strategy } from 'passport-local';
import { UsersService } from '../../users/users.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, email: string, password: string) {
    const tenantSlug: string | undefined = req.body?.tenantSlug;
    if (!tenantSlug) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tenant = await this.usersService.findTenantBySlug(tenantSlug);
    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.usersService.findByTenantAndEmail(tenant.id, email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
  }
}
