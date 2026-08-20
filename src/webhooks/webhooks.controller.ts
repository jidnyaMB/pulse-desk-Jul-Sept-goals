import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Device } from '@prisma/client';
import { Request } from 'express';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { HmacGuard } from './guards/hmac.guard';
import { WebhooksService } from './webhooks.service';

// Public route — no JWT. A device isn't a logged-in user; HmacGuard is the
// entire authentication story here, using a per-device secret instead.
@UseGuards(HmacGuard)
@Controller('webhooks/devices')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':serialNumber')
  @HttpCode(HttpStatus.OK)
  handle(@Param('serialNumber') _serialNumber: string, @Body() dto: WebhookPayloadDto, @Req() req: Request) {
    return this.webhooksService.handleWebhook((req as Request & { device: Device }).device, dto);
  }
}
