import { Module } from '@nestjs/common';
import { AccessGrantsModule } from '../access-grants/access-grants.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [AccessGrantsModule],
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
