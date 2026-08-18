import { IsString, MinLength } from 'class-validator';

export class CreateCareTeamDto {
  @IsString()
  @MinLength(1)
  name: string;
}
