export const MIN_PASSWORD_LENGTH = 8;

export interface SignUpInput {
  email: string;
  password: string;
  confirmPassword: string;
  isAdult: boolean;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Enter your email address.";
  if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) {
    return "That doesn't look like a valid email address.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 128) return "Password is too long (max 128).";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Mix letters and at least one number.";
  }
  return null;
}

export function validateLogin(
  email: string,
  password: string,
): FieldErrors<{ email: string; password: string }> {
  const errors: FieldErrors<{ email: string; password: string }> = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = "Enter your password.";
  return errors;
}

export function validateSignUp(input: SignUpInput): FieldErrors<SignUpInput> {
  const errors: FieldErrors<SignUpInput> = {};
  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;
  const passwordError = validatePassword(input.password);
  if (passwordError) errors.password = passwordError;
  if (!errors.password && input.password !== input.confirmPassword) {
    errors.confirmPassword = "Passwords don't match.";
  }
  if (!input.isAdult) errors.isAdult = "You must confirm you are 18 or older.";
  return errors;
}
