export function validateEmail(value: string) {
  if (!value.trim()) {
    return "Email is required.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validatePassword(value: string) {
  if (!value) {
    return "Password is required.";
  }
  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

export function validateName(value: string) {
  if (!value.trim()) {
    return "Name is required.";
  }
  if (value.trim().length < 2) {
    return "Enter your full name.";
  }
  return null;
}

export function validateConfirmPassword(password: string, confirm: string) {
  if (password !== confirm) {
    return "Passwords do not match.";
  }
  return null;
}

export function mapAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("database is temporarily unavailable") || normalized.includes("database_unavailable")) {
    return "The database is temporarily unavailable. Try again shortly.";
  }
  if (normalized.includes("api is not accepting") || normalized.includes("api_unavailable")) {
    return "The API is still starting. Try again shortly.";
  }
  if (
    normalized.includes("invalid email or password") ||
    normalized.includes("invalid_email_or_password") ||
    (normalized.includes("invalid") && normalized.includes("credential"))
  ) {
    return "Invalid email or password.";
  }
  if (
    normalized.includes("current password is incorrect") ||
    normalized.includes("invalid password") ||
    normalized.includes("invalid_password")
  ) {
    return "Current password is incorrect.";
  }
  if (normalized.includes("compromised") || normalized.includes("data breach")) {
    return "That password has appeared in a data breach. Choose a different password.";
  }
  if (normalized.includes("verify") || normalized.includes("not verified")) {
    return "Verify your email before signing in. Check your inbox for a verification link.";
  }
  if (normalized.includes("unable to complete the request")) {
    return "Unable to complete the request. Please try again.";
  }
  // Keep short, already user-facing API copy from our password routes.
  if (
    normalized.startsWith("choose a password") ||
    normalized.startsWith("password must") ||
    normalized.startsWith("passwords do not") ||
    normalized.startsWith("new password and confirmation") ||
    normalized.startsWith("password change failed") ||
    normalized.startsWith("invalid input")
  ) {
    return message.endsWith(".") ? message : `${message}.`;
  }
  return "Unable to complete the request. Please try again.";
}
