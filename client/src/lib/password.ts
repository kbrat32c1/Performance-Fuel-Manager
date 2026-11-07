/** Sign-up and reset rules: 12+ characters with upper, lower, number and symbol. */
export function validatePassword(pwd: string): string | null {
  if (pwd.length < 12) return 'Password must be at least 12 characters';
  if (!/[A-Z]/.test(pwd)) return 'Password must include an uppercase letter';
  if (!/[a-z]/.test(pwd)) return 'Password must include a lowercase letter';
  if (!/[0-9]/.test(pwd)) return 'Password must include a number';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return 'Password must include a special character';
  return null;
}

export const PASSWORD_RULES_TEXT = 'At least 12 characters, with an uppercase and a lowercase letter, a number and a symbol.';
