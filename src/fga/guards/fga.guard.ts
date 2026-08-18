import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { FgaService } from '../fga.service';

@Injectable()
export class FgaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly fgaService: FgaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );
    // No @RequirePermission on this route — nothing to check, let it through
    // (JwtAuthGuard/tenant isolation still apply independently).
    if (!required) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id;
    const objectId: string | undefined = req.params?.[required.paramName];

    if (!userId || !objectId) {
      throw new ForbiddenException();
    }

    const allowed = await this.fgaService.check(
      userId,
      required.relation,
      required.objectType,
      objectId,
    );
    if (!allowed) {
      // 403 here does not leak existence — PatientsService still separately
      // 404s for cross-tenant/nonexistent ids. This guard only fires once
      // we're already inside the caller's own tenant.
      throw new ForbiddenException();
    }
    return true;
  }
}
