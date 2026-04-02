import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs/promises';

import { eq } from 'drizzle-orm';

import { db as appDb } from '@/server/db';
import { cmsOptions } from '@/server/db/schema';
import { createQueue, createWorker } from '../queue';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export type TemplateName = 'welcome' | 'password-reset' | 'invitation';

export const TEMPLATE_NAMES: TemplateName[] = ['welcome', 'password-reset', 'invitation'];

interface TemplateVars {
  [key: string]: string;
}

const emailQueue = createQueue('email');

/** Load an email template — checks DB overrides first, falls back to file */
async function loadTemplate(
  name: TemplateName,
  vars: TemplateVars
): Promise<{ subject: string; html: string }> {
  // 1. Check for DB override in cms_options
  try {
    const optionKey = `email.template.${name}`;
    const [row] = await appDb
      .select({ value: cmsOptions.value })
      .from(cmsOptions)
      .where(eq(cmsOptions.key, optionKey))
      .limit(1);

    if (row?.value) {
      const override = row.value as { subject?: string; html?: string };
      if (override.html) {
        let html = override.html;
        const subject = override.subject ?? name;

        for (const [key, value] of Object.entries(vars)) {
          html = html.replaceAll(`{{${key}}}`, value);
        }

        return { subject, html };
      }
    }
  } catch {
    // DB not available — fall through to file
  }

  // 2. Fall back to file-based template
  const filePath = path.join(process.cwd(), 'emails', `${name}.html`);
  let html = await fs.readFile(filePath, 'utf-8');

  // Extract subject from <!-- Subject: ... --> comment
  const subjectMatch = html.match(/<!--\s*Subject:\s*(.+?)\s*-->/);
  const subject = subjectMatch?.[1] ?? name;

  // Interpolate {{var}} placeholders
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }

  return { subject, html };
}

/** Send a templated email via the queue */
export async function enqueueTemplateEmail(
  to: string,
  template: TemplateName,
  vars: TemplateVars
): Promise<void> {
  const { subject, html } = await loadTemplate(template, vars);
  await enqueueEmail({ to, subject, html });
}

/** Enqueue an email — never call sendEmail directly */
export async function enqueueEmail(payload: EmailPayload): Promise<void> {
  if (emailQueue) {
    await emailQueue.add('send', payload);
  } else {
    // No Redis — send synchronously in dev
    console.log(`[email] Sending directly (no Redis): ${payload.subject} → ${payload.to}`);
    await sendEmail(payload);
  }
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL } =
    process.env;

  if (!SMTP_HOST || !FROM_EMAIL) {
    console.log(`[email] SMTP not configured — skipping: ${payload.subject}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? '587', 10),
    secure: false,
    auth:
      SMTP_USER && SMTP_PASS
        ? { user: SMTP_USER, pass: SMTP_PASS }
        : undefined,
  });

  await transporter.sendMail({
    from: FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });
}

/** Initialize email worker (call from server.ts when BullMQ is enabled) */
export function startEmailWorker(): void {
  createWorker('email', async (job) => {
    await sendEmail(job.data as EmailPayload);
  });
}
