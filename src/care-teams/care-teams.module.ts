import { Module } from '@nestjs/common';
import { CareTeamsController } from './care-teams.controller';
import { CareTeamsService } from './care-teams.service';

@Module({
  controllers: [CareTeamsController],
  providers: [CareTeamsService],
})
export class CareTeamsModule {}
