import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  APP_DATABASE_URL: string;

  @IsInt()
  @Min(1)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL: string;

  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS: number;

  @IsString()
  @IsNotEmpty()
  FGA_API_URL: string;

  @IsString()
  @IsNotEmpty()
  FGA_STORE_ID: string;

  @IsString()
  @IsNotEmpty()
  FGA_MODEL_ID: string;

  @IsInt()
  @Min(1)
  BREAK_GLASS_TTL_HOURS: number;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsInt()
  @Min(1)
  HEART_RATE_ALERT_THRESHOLD: number;

  @IsInt()
  @Min(1)
  HEART_RATE_WINDOW_MINUTES: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }
  return validated;
}
