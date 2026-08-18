import { IsUUID } from 'class-validator';

export class AddPatientDto {
  @IsUUID()
  patientId: string;
}
