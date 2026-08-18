import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @IsUUID()
  patientId: string;

  @IsString()
  @MinLength(1)
  serialNumber: string;
}
