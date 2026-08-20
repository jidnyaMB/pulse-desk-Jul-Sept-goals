import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateGrantDto {
  @IsUUID()
  userId: string;

  @IsIn(['viewer', 'editor'])
  relation: string;

  @IsDateString()
  expiresAt: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
