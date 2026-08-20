import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { HmacGuard } from './guards/hmac.guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [QueueModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, HmacGuard],
})
export class WebhooksModule {}
