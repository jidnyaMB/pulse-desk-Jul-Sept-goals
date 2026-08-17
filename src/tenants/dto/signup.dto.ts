import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'tenantSlug may only contain lowercase letters, numbers, and hyphens',
  })
  tenantSlug: string;

  @IsString()
  @MinLength(2)
  tenantName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
