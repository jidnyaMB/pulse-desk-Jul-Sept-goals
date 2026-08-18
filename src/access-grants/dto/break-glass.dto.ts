import { IsString, MinLength } from 'class-validator';

export class BreakGlassDto {
  @IsString()
  @MinLength(10)
  justification: string;
}
