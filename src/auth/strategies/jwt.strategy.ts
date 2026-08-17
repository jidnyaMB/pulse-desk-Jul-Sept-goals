import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtPayload } from '../jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // Whatever this returns becomes req.user. We intentionally only trust the
  // claims that were in the signed token — no DB lookup here (that's the point
  // of a stateless access token). tid/role are exactly what Phase 2's tenant
  // context (ALS) will read from req.user.
  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
    };
  }
}
