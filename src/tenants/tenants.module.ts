import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [UsersModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
