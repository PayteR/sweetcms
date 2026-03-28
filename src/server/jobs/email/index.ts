import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs/promises';

import { createQueue, createWorker } from '../queue';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

type TemplateName = 'welcome' | 'password-reset';

interface TemplateVars {
  [key: string]: string;
}

const emailQueue = createQueue('email');

/** Load an email template and interpolate variables */
async function loadTemplate(
  name: TemplateName,
  vars: TemplateVars
): Promise<{ subject: string; html: string }> {
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
