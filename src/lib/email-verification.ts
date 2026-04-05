/** Grace period (ms) — unverified users can use the app for this long after registration */
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true if the user must verify their email before continuing.
 * False during the grace period or if already verified.
 */
export function isEmailVerificationRequired(user: {
  emailVerified: boolean;
  createdAt: Date | string;
}): boolean {
  if (user.emailVerified) return false;
  const created = new Date(user.createdAt).getTime();
  return Date.now() - created > GRACE_PERIOD_MS;
}

/**
 * Returns true if the user's email is unverified (regardless of grace period).
 * Used for showing the reminder banner during grace.
 */
export function isEmailUnverified(user: {
  emailVerified: boolean;
}): boolean {
  return !user.emailVerified;
}
