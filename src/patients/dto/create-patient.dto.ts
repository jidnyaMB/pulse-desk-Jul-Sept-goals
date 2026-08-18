import { IsString, MinLength } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;
}
