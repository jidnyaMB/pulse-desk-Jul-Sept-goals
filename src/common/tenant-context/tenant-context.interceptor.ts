import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as crypto from 'crypto';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { AppClsStore } from '../cls/app-cls-store.interface';

// Runs after guards (so req.user is populated when a JwtAuthGuard protects the
// route) and before the handler. Public routes (login/signup) have no
// req.user — we just skip setting tenant/user context for those, we don't fail.
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();

    this.cls.set('requestId', req.headers['x-request-id'] ?? crypto.randomUUID());

    const user = req.user as { id: string; tenantId: string } | undefined;
    if (user) {
      this.cls.set('tenantId', user.tenantId);
      this.cls.set('userId', user.id);
    }

    return next.handle();
  }
}
