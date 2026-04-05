/**
 * SweetCMS Init Script
 *
 * Single command to fully set up and populate the database:
 *   bun run init
 *
 * What it does:
 * 1. Ensures .env exists (copies from .env.example if missing)
 * 2. Creates the database if it doesn't exist
 * 3. Runs Drizzle migrations
 * 4. Detects existing data — offers reset (TRUNCATE + re-seed)
 * 5. Creates superadmin user if none exists (interactive)
 * 6. Prompts for company info (legal page templates)
 * 7. Writes site name / URL back to .env
 * 8. Seeds default site options
 * 9. Selectively seeds: CMS content, billing demo data, extras (menus, forms, audit, notifications)
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { count, eq } from 'drizzle-orm';
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { hashPassword } from '@/lib/password';
import {
  log,
  prompt,
  promptPassword,
  promptWithDefault,
  promptYesNo,
  type CompanyInfo,
} from './seed/helpers';
import { seedMedia, seedCmsContent } from './seed/cms-content';
import { seedExtras } from './seed/extras';
import { MODULE_SEEDS } from '@/generated/module-seeds';

// ─── Config ───────────────────────────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(PROJECT_ROOT, '.env.example');

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
    process.exit(1);
  }
  return url;
}

// ─── All PostgreSQL table names (for TRUNCATE on reset) ───────────────────────

const ALL_TABLES = [
  // Auth
  '"user"', 'session', 'account', 'verification',
  // CMS
  'cms_posts', 'cms_post_attachments', 'cms_options',
  'cms_categories', 'cms_media', 'cms_terms', 'cms_term_relationships',
  'cms_menus', 'cms_menu_items', 'cms_audit_log', 'cms_webhooks',
  'cms_custom_field_definitions', 'cms_custom_field_values',
  'cms_forms', 'cms_form_submissions',
  'cms_portfolio', 'cms_showcase',
  'cms_content_revisions', 'cms_slug_redirects',
  'cms_reactions', 'cms_comments',
  'cms_translations', 'cms_user_preferences',
  // SaaS
  'saas_subscriptions', 'saas_subscription_events',
  'saas_payment_transactions', 'saas_discount_codes', 'saas_discount_usages',
  'saas_affiliates', 'saas_referrals', 'saas_affiliate_events',
  'saas_notifications', 'saas_projects', 'saas_task_queue',
  'saas_tickets', 'saas_ticket_messages',
  // Organizations
  'organization', 'member', 'invitation',
];

// ─── Step 1: Ensure .env ──────────────────────────────────────────────────────

/**
 * Returns true if .env already existed (ready to proceed).
 * Returns false if .env was just created (must restart for Bun to load it).
 */
function ensureEnvFile(): boolean {
  if (fs.existsSync(ENV_PATH)) {
    return true;
  }

  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    log('📄', 'Created .env from .env.example.');
    log('📝', 'Review the file, then re-run: bun run init');
    return false;
  }

  log('⚠️', 'No .env or .env.example found. Create .env with DATABASE_URL, then re-run.');
  return false;
}

// ─── Step 2: Create database ──────────────────────────────────────────────────

async function ensureDatabase() {
  const databaseUrl = getDatabaseUrl();
  const dbUrl = new URL(databaseUrl);
  const dbName = dbUrl.pathname.slice(1);
  const maintenanceUrl = `${dbUrl.protocol}//${dbUrl.username}${dbUrl.password ? ':' + dbUrl.password : ''}@${dbUrl.host}/postgres`;

  log('🗄️', `Checking database "${dbName}"...`);

  const sql = postgres(maintenanceUrl, { max: 1 });

  try {
    const result = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;

    if (result.length === 0) {
      log('📦', `Creating database "${dbName}"...`);
      await sql.unsafe(`CREATE DATABASE "${dbName}"`);
      log('✅', `Database "${dbName}" created.`);
    } else {
      log('✅', `Database "${dbName}" already exists.`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect to PostgreSQL: ${message}`);
    console.error('Make sure PostgreSQL is running and DATABASE_URL is correct.');
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// ─── Step 3: Run migrations ─────────────────────────────────────────────────

function runMigrations() {
  log('🔄', 'Running database migrations...');
  try {
    execSync('bunx drizzle-kit migrate', { stdio: 'inherit' });
    log('✅', 'Migrations applied.');
  } catch {
    console.error('Migration failed. Check the error above.');
    process.exit(1);
  }
}

// ─── Step 4: Check existing data & offer reset ──────────────────────────────

type ResetResult = 'no_data' | 'reset' | 'skip';

async function checkAndResetIfNeeded(
  db: ReturnType<typeof drizzle>,
  rawSql: ReturnType<typeof postgres>,
): Promise<ResetResult> {
  // Check multiple tables to detect ANY seeded data (not just CMS)
  const { cmsPosts } = await import('../server/db/schema/cms');
  const { saasSubscriptions } = await import('@/core-billing/schema/billing');
  const { cmsMenus } = await import('../server/db/schema/menu');

  const [postCount] = await db.select({ count: count() }).from(cmsPosts);
  const [subCount] = await db.select({ count: count() }).from(saasSubscriptions);
  const [menuCount] = await db.select({ count: count() }).from(cmsMenus);

  const hasData =
    (postCount?.count ?? 0) > 0 ||
    (subCount?.count ?? 0) > 0 ||
    (menuCount?.count ?? 0) > 0;

  if (!hasData) return 'no_data';

  console.log('');
  log('⚠️', 'Data already exists in the database.');
  const shouldReset = await promptYesNo('  Reset and re-seed all data?', false);

  if (!shouldReset) {
    log('⏭️', 'Keeping existing data.');
    return 'skip';
  }

  log('🗑️', 'Resetting all data...');

  // Use raw postgres connection for TRUNCATE (drizzle's execute is for DML)
  const tableList = ALL_TABLES.join(', ');
  await rawSql.unsafe(`TRUNCATE TABLE ${tableList} CASCADE`);

  // Remove seed media files
  const seedDir = path.join(PROJECT_ROOT, 'uploads', 'seed');
  if (fs.existsSync(seedDir)) {
    fs.rmSync(seedDir, { recursive: true, force: true });
  }

  log('✅', 'All data cleared.');
  return 'reset';
}

// ─── Step 5: Ensure superadmin exists ───────────────────────────────────────

async function ensureSuperadmin(db: ReturnType<typeof drizzle>): Promise<string> {
  const { user, account } = await import('../server/db/schema/auth');

  // Check if a superadmin already exists
  const [existingAdmin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'superadmin'))
    .limit(1);

  if (existingAdmin) {
    log('✅', 'Superadmin user exists.');
    return existingAdmin.id;
  }

  log('👤', 'No superadmin found. Creating one...');
  console.log('');

  const name = await prompt('  Admin name: ');
  const email = await prompt('  Admin email: ');
  const password = await promptPassword('  Admin password (min 6 chars): ');

  if (!name || !email || !password) {
    console.error('All fields are required.');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const hashedPassword = await hashPassword(password);
  const userId = crypto.randomUUID();

  await db.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role: 'superadmin',
  });

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: hashedPassword,
  });

  // Audit log the superadmin creation
  const { cmsAuditLog } = await import('../server/db/schema/audit');
  await db.insert(cmsAuditLog).values({
    userId,
    action: 'init.superadmin',
    entityType: 'user',
    entityId: userId,
    entityTitle: name,
  }).catch(() => {}); // Table may not have been migrated yet

  console.log('');
  log('✅', `Superadmin "${name}" <${email}> created.`);
  return userId;
}

// ─── Step 6: Prompt company info ────────────────────────────────────────────

async function promptCompanyInfo(): Promise<CompanyInfo> {
  log('🏢', 'Company info (used in legal page templates)...');
  console.log('');

  const envSiteName = process.env.NEXT_PUBLIC_SITE_NAME;
  const envSiteUrl = process.env.NEXT_PUBLIC_APP_URL;

  const siteName = envSiteName
    ? await promptWithDefault('  Site name', envSiteName)
    : (await prompt('  Site name: ')) || 'SweetCMS';

  const siteUrl = envSiteUrl
    ? await promptWithDefault('  Site URL', envSiteUrl)
    : (await prompt('  Site URL: ')) || 'http://localhost:3000';

  const companyName = (await prompt('  Company legal name (e.g. "Acme Corp s.r.o."): ')) || 'SweetCMS Inc.';
  const companyAddress = (await prompt('  Company address: ')) || '123 Main Street, City, Country';
  const companyId = (await prompt('  Company registration number: ')) || 'N/A';
  const companyJurisdiction =
    (await prompt('  Governing law jurisdiction (e.g. "the Slovak Republic", "England and Wales"): ')) ||
    'the United States';
  const contactEmail = (await prompt('  Contact email: ')) || 'info@example.com';

  console.log('');
  return { siteName, siteUrl, companyName, companyAddress, companyId, companyJurisdiction, contactEmail };
}

// ─── Step 7: Update .env with site values ───────────────────────────────────

function updateEnvFile(companyInfo: CompanyInfo) {
  if (!fs.existsSync(ENV_PATH)) return;

  let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  let changed = false;

  const updates: Record<string, string> = {
    NEXT_PUBLIC_SITE_NAME: companyInfo.siteName,
    NEXT_PUBLIC_APP_URL: companyInfo.siteUrl,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      const currentMatch = envContent.match(regex);
      if (currentMatch && currentMatch[0] !== `${key}=${value}`) {
        envContent = envContent.replace(regex, `${key}=${value}`);
        changed = true;
      }
    } else {
      envContent += `\n${key}=${value}`;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(ENV_PATH, envContent);
    log('📝', '.env updated with site name and URL.');
  }
}

// ─── Step 8: Seed options ───────────────────────────────────────────────────

async function seedOptions(db: ReturnType<typeof drizzle>, companyInfo: CompanyInfo) {
  const { cmsOptions } = await import('../server/db/schema/cms');

  const [existing] = await db.select({ count: count() }).from(cmsOptions);

  if ((existing?.count ?? 0) > 0) {
    log('⏭️', 'Options already seeded.');
    return;
  }

  log('⚙️', 'Seeding default site options...');

  const defaults: Record<string, unknown> = {
    'site.name': companyInfo.siteName,
    'site.tagline': 'AI Agent-driven T3 SaaS starter with integrated CMS',
    'site.description': '',
    'site.url': companyInfo.siteUrl,
    'site.logo': '',
    'site.favicon': '',
    'site.social.twitter': '',
    'site.social.github': '',
    'site.analytics.ga_id': '',
    'site.posts_per_page': 10,
    'site.allow_registration': true,
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(cmsOptions).values({
      key,
      value,
      updatedAt: new Date(),
    });
  }

  log('✅', `${Object.keys(defaults).length} default options created.`);

  // Audit log options seeding (best-effort — userId may not be available yet)
  const { cmsAuditLog } = await import('../server/db/schema/audit');
  await db.insert(cmsAuditLog).values({
    userId: 'system',
    action: 'init.options',
    entityType: 'system',
    entityId: crypto.randomUUID(),
    entityTitle: `Seeded ${Object.keys(defaults).length} default options`,
  }).catch(() => {});
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════╗');
  console.log('  ║     SweetCMS Initialization    ║');
  console.log('  ╚═══════════════════════════════╝');
  console.log('');

  // Step 1: Ensure .env (Bun loads .env at startup — if we just created it, must restart)
  if (!ensureEnvFile()) {
    process.exit(0);
  }

  // Step 2: Create database
  await ensureDatabase();

  // Step 3: Run migrations
  runMigrations();

  // Open single DB connection for all remaining steps
  const databaseUrl = getDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  try {
    // Step 4: Check for existing data, offer reset
    const resetResult = await checkAndResetIfNeeded(db, sql);

    // Step 5: Ensure superadmin
    const superadminUserId = await ensureSuperadmin(db);

    // Seed if: first run (no_data) or user chose to reset
    const needsSeed = resetResult !== 'skip';

    if (!needsSeed) {
      log('⏭️', 'Nothing to do.');
    } else {
      // Step 6: Company info
      const companyInfo = await promptCompanyInfo();

      // Step 7: Update .env
      updateEnvFile(companyInfo);

      // Step 8: Seed options
      await seedOptions(db, companyInfo);

      // Step 9: Ask what to seed
      console.log('');
      log('📋', 'What to seed:');
      const wantCms = await promptYesNo('  Seed CMS content (pages, blog, portfolio, showcase)?', true);

      // Module seeds — ask for each installed module that has seed data
      const moduleSeeds: { label: string; fn: typeof MODULE_SEEDS[number]['fn']; accepted: boolean }[] = [];
      for (const seed of MODULE_SEEDS) {
        const accepted = await promptYesNo(`  Seed ${seed.label}?`, true);
        moduleSeeds.push({ label: seed.label, fn: seed.fn, accepted });
      }

      const wantExtras = await promptYesNo('  Seed extras (menus, forms, audit log, notifications)?', true);
      console.log('');

      let cmsResult: Awaited<ReturnType<typeof seedCmsContent>> | undefined;
      const allUserIds: string[] = [];
      const allOrgIds: string[] = [];

      // Seed CMS content
      if (wantCms) {
        await seedMedia(db);
        cmsResult = await seedCmsContent(db, companyInfo);
      }

      // Run accepted module seeds
      const seededModules: string[] = [];
      for (const seed of moduleSeeds) {
        if (!seed.accepted) continue;
        const result = await seed.fn(db, superadminUserId);
        if (result?.userIds) allUserIds.push(...result.userIds);
        if (result?.orgIds) allOrgIds.push(...result.orgIds);
        seededModules.push(seed.label);
      }

      // Seed extras
      if (wantExtras) {
        await seedExtras(db, {
          superadminUserId,
          postIds: cmsResult?.postIds ?? [],
          categoryIds: cmsResult?.categoryIds ?? [],
          userIds: allUserIds,
          orgIds: allOrgIds,
        });
      }

      // Audit log seed completion
      const { cmsAuditLog } = await import('../server/db/schema/audit');
      const seeded = [
        wantCms && 'cms',
        ...seededModules,
        wantExtras && 'extras',
      ].filter(Boolean);
      if (seeded.length > 0) {
        await db.insert(cmsAuditLog).values({
          userId: superadminUserId,
          action: 'init.seed',
          entityType: 'system',
          entityId: crypto.randomUUID(),
          entityTitle: `Database seeded: ${seeded.join(', ')}`,
          metadata: { seeded },
        }).catch(() => {});
      }
    }
  } finally {
    await sql.end();
  }

  console.log('');
  log('🚀', 'SweetCMS is ready! Run `bun run dev` to start.');
  console.log('');
}

main().catch((err) => {
  console.error('Init failed:', err);
  process.exit(1);
});
