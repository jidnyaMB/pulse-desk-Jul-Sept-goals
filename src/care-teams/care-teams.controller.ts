import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CareTeamsService } from './care-teams.service';
import { AddMemberDto } from './dto/add-member.dto';
import { AddPatientDto } from './dto/add-patient.dto';
import { CreateCareTeamDto } from './dto/create-care-team.dto';
import { UpdateCareTeamDto } from './dto/update-care-team.dto';

@UseGuards(JwtAuthGuard)
@Controller('care-teams')
export class CareTeamsController {
  constructor(private readonly careTeamsService: CareTeamsService) {}

  @Post()
  create(@Body() dto: CreateCareTeamDto) {
    return this.careTeamsService.create(dto);
  }

  @Get()
  list() {
    return this.careTeamsService.list();
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.careTeamsService.findById(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCareTeamDto) {
    return this.careTeamsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.careTeamsService.remove(id);
  }

  @Get(':id/members')
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.careTeamsService.listMembers(id);
  }

  @Post(':id/members')
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    return this.careTeamsService.addMember(id, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.careTeamsService.removeMember(id, userId);
  }

  @Get(':id/patients')
  listPatients(@Param('id', ParseUUIDPipe) id: string) {
    return this.careTeamsService.listPatients(id);
  }

  @Post(':id/patients')
  addPatient(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddPatientDto) {
    return this.careTeamsService.addPatient(id, dto);
  }

  @Delete(':id/patients/:patientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePatient(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    await this.careTeamsService.removePatient(id, patientId);
  }
}
