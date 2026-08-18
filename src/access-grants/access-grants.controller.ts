import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessGrantsService } from './access-grants.service';
import { BreakGlassDto } from './dto/break-glass.dto';
import { CreateGrantDto } from './dto/create-grant.dto';

@UseGuards(JwtAuthGuard)
@Controller('patients/:patientId')
export class AccessGrantsController {
  constructor(private readonly accessGrantsService: AccessGrantsService) {}

  @Post('grants')
  createGrant(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: CreateGrantDto) {
    return this.accessGrantsService.createGrant(patientId, dto);
  }

  @Get('grants')
  listGrants(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.accessGrantsService.listGrants(patientId);
  }

  @Delete('grants/:grantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeGrant(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    await this.accessGrantsService.revokeGrant(patientId, grantId);
  }

  @Post('break-glass')
  breakGlass(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: BreakGlassDto) {
    return this.accessGrantsService.breakGlass(patientId, dto);
  }
}
