/**
 * Grace period (ms) — unverified users can use the app for this long after registration.
 * OAuth users (Google, Discord) get emailVerified=true from their provider, so this
 * only affects email/password signups. If adding a new OAuth provider, verify it
 * returns emailVerified in its userInfo response.
 */
export const EMAIL_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

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
  return Date.now() - created > EMAIL_GRACE_PERIOD_MS;
}
