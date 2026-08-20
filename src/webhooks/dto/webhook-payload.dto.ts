import { IsDateString, IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class WebhookPayloadDto {
  @IsString()
  @MinLength(1)
  eventId: string;

  @IsInt()
  @Min(0)
  @Max(300)
  heartRate: number;

  @IsDateString()
  recordedAt: string;
}
