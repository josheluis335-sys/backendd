export const PASSWORD_POLICY_MESSAGES = {
  length: 'La contraseña debe tener al menos 10 caracteres.',
  letter: 'La contraseña debe incluir al menos una letra.',
  number: 'La contraseña debe incluir al menos un número.',
  bytes: 'La contraseña no puede superar 72 bytes.',
  trim: 'La contraseña no puede iniciar ni terminar con espacios.',
} as const;

export function validatePasswordPolicy(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [PASSWORD_POLICY_MESSAGES.length];
  }
  const errors: string[] = [];
  if (value.length < 10) errors.push(PASSWORD_POLICY_MESSAGES.length);
  if (!/\p{L}/u.test(value)) errors.push(PASSWORD_POLICY_MESSAGES.letter);
  if (!/\d/.test(value)) errors.push(PASSWORD_POLICY_MESSAGES.number);
  if (Buffer.byteLength(value, 'utf8') > 72) errors.push(PASSWORD_POLICY_MESSAGES.bytes);
  if (value !== value.trim()) errors.push(PASSWORD_POLICY_MESSAGES.trim);
  return errors;
}
