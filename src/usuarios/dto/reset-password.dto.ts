import { IsValidInitialPassword } from '../validation/password-policy.decorator.js';

export class ResetPasswordDto {
  @IsValidInitialPassword()
  password!: string;
}
