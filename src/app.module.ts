import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { CareTeamsModule } from './care-teams/care-teams.module';
import { TenantContextInterceptor } from './common/tenant-context/tenant-context.interceptor';
import { validateEnv } from './config/env.validation';
import { DevicesModule } from './devices/devices.module';
import { FgaModule } from './fga/fga.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    PrismaModule,
    FgaModule,
    QueueModule,
    UsersModule,
    TenantsModule,
    AuthModule,
    PatientsModule,
    CareTeamsModule,
    DevicesModule,
    AlertsModule,
    WebhooksModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule {}
