'use server';

import { auth } from '@/lib/auth';

interface ResetResult {
  success: boolean;
  error?: string;
}

export async function requestReset(email: string): Promise<ResetResult> {
  try {
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: '/dashboard/reset-password',
      },
    });
    return { success: true };
  } catch {
    // Always return success to not leak user existence
    return { success: true };
  }
}
