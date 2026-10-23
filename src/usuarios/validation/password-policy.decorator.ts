import { ValidateBy } from 'class-validator';
import { PASSWORD_POLICY_MESSAGES, validatePasswordPolicy } from './password-policy.js';

export function IsValidInitialPassword(): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidInitialPassword',
      validator: {
        validate: (value: unknown) => validatePasswordPolicy(value).length === 0,
        defaultMessage: () =>
          Object.values(PASSWORD_POLICY_MESSAGES).join(' '),
      },
    },
    { message: () => Object.values(PASSWORD_POLICY_MESSAGES).join(' ') },
  );
}
