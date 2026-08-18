import { Global, Module } from '@nestjs/common';
import { FgaGuard } from './guards/fga.guard';
import { FgaService } from './fga.service';
import { OutboxRelayService } from './outbox-relay.service';

@Global()
@Module({
  providers: [FgaService, FgaGuard, OutboxRelayService],
  exports: [FgaService, FgaGuard],
})
export class FgaModule {}
