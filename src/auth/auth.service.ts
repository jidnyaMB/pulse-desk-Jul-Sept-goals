import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private signAccessToken(user: { id: string; tenantId: string; role: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      jti: crypto.randomUUID(),
    };
    return this.jwtService.sign(payload);
  }

  private refreshTtlMs(): number {
    const days = this.configService.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    return days * 24 * 60 * 60 * 1000;
  }

  // Issues a brand-new refresh-token family. Used at login.
  private async issueNewFamily(user: { id: string; tenantId: string }) {
    const token = generateOpaqueToken();
    const familyId = crypto.randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        tenantId: user.tenantId,
        tokenHash: hashToken(token),
        familyId,
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    return token;
  }

  async login(user: AuthenticatedUser & { email?: string }) {
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueNewFamily(user);
    return { accessToken, refreshToken };
  }

  // Rotation with replay detection:
  //  - presented token not found at all -> reject (unknown / already deleted).
  //  - presented token found but already revoked -> this token was already
  //    rotated away once before. Someone is reusing a dead token: revoke the
  //    entire family (every token descended from the same login) and reject.
  //  - presented token found, live, not expired -> rotate: mark it revoked,
  //    issue a new token in the same family, return new access+refresh pair.
  async refresh(presentedToken: string) {
    const tokenHash = hashToken(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected, session revoked');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newToken = generateOpaqueToken();
    const newTokenId = crypto.randomUUID();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          id: newTokenId,
          userId: existing.userId,
          tenantId: existing.tenantId,
          tokenHash: hashToken(newToken),
          familyId: existing.familyId,
          rotatedFromId: existing.id,
          expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        },
      }),
    ]);

    const accessToken = this.signAccessToken({
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return { accessToken, refreshToken: newToken };
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = hashToken(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt) {
      // Already gone / already revoked — logout is idempotent, nothing to do.
      return;
    }
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
  }
}
