import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

// Runs BEFORE any tenant context exists — the device's serial number (public,
// in the URL) is how we find which tenant this webhook even belongs to, so
// this guard necessarily uses the admin PrismaService, not the tenant-scoped
// one. It looks up the device (to get its signing secret), verifies the
// signature over the exact raw request bytes, and attaches the resolved
// device onto the request for the controller to use.
@Injectable()
export class HmacGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const serialNumber: string | undefined = req.params?.serialNumber;
    const signature: string | undefined = req.headers['x-signature'];
    const rawBody: Buffer | undefined = req.rawBody;

    if (!serialNumber || !signature || !rawBody) {
      throw new UnauthorizedException('Missing signature');
    }

    const device = await this.prisma.device.findUnique({ where: { serialNumber } });
    if (!device) {
      throw new UnauthorizedException('Unknown device');
    }

    const expected = crypto
      .createHmac('sha256', device.hmacSecret)
      .update(rawBody)
      .digest('hex');

    const provided = Buffer.from(signature, 'hex');
    const computed = Buffer.from(expected, 'hex');
    if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
      throw new UnauthorizedException('Invalid signature');
    }

    req.device = device;
    return true;
  }
}
