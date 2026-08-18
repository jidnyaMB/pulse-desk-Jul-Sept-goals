import { IsString, MinLength } from 'class-validator';

export class UpdateCareTeamDto {
  @IsString()
  @MinLength(1)
  name: string;
}
