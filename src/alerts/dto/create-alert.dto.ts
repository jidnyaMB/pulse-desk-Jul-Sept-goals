import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAlertDto {
  @IsUUID()
  patientId: string;

  @IsIn(['low', 'medium', 'high'])
  severity: string;

  @IsString()
  @MinLength(1)
  message: string;
}
