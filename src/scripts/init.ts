/**
 * SweetCMS Init Script
 *
 * Run once after cloning the repo to set up everything:
 *   bun run init
 *
 * What it does:
 * 1. Creates the database if it doesn't exist
 * 2. Runs Drizzle migrations
 * 3. Creates a superadmin user (interactive)
 * 4. Seeds default site options
 * 5. Creates a sample "Welcome" page
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, count } from 'drizzle-orm';
import { execSync } from 'child_process';
import * as readline from 'readline';
import crypto from 'crypto';
import { hashPassword } from '@/lib/password';

// Parse DATABASE_URL to extract DB name and base connection
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  process.exit(1);
}

const dbUrl = new URL(DATABASE_URL);
const dbName = dbUrl.pathname.slice(1); // remove leading /
const maintenanceUrl = `${dbUrl.protocol}//${dbUrl.username}${dbUrl.password ? ':' + dbUrl.password : ''}@${dbUrl.host}/postgres`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptPassword(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  // Note: password is visible in terminal. For true hidden input, need raw mode.
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function log(emoji: string, msg: string) {
  console.log(`${emoji} ${msg}`);
}

// ─── Step 1: Create database ────────────────────────────────────────────────

async function ensureDatabase() {
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

// ─── Step 2: Run migrations ─────────────────────────────────────────────────

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

// ─── Step 3: Create superadmin ──────────────────────────────────────────────

async function createSuperadmin() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  try {
    // Dynamically import schema (avoid triggering env validation at top level)
    const { user } = await import('../server/db/schema/auth');

    // Check if any users exist
    const [existing] = await db
      .select({ count: count() })
      .from(user);

    if ((existing?.count ?? 0) > 0) {
      log('⏭️', 'Users already exist. Skipping superadmin creation.');
      log('💡', 'To promote an existing user, run: bun run src/scripts/promote.ts <email>');
      return;
    }

    log('👤', 'No users found. Creating superadmin account...');
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

    // Create user
    const userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      role: 'superadmin',
    });

    // Create credential account with password
    const { account } = await import('../server/db/schema/auth');
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashedPassword,
    });

    console.log('');
    log('✅', `Superadmin "${name}" <${email}> created.`);
  } finally {
    await sql.end();
  }
}

// ─── Step 4: Seed default options ───────────────────────────────────────────

async function seedOptions() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  try {
    const { cmsOptions } = await import('../server/db/schema/cms');

    // Check if options already exist
    const [existing] = await db
      .select({ count: count() })
      .from(cmsOptions);

    if ((existing?.count ?? 0) > 0) {
      log('⏭️', 'Options already seeded.');
      return;
    }

    log('⚙️', 'Seeding default site options...');

    const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? 'SweetCMS';
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const defaults: Record<string, unknown> = {
      'site.name': siteName,
      'site.tagline': 'AI Agent-driven T3 SaaS starter with integrated CMS',
      'site.description': '',
      'site.url': siteUrl,
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
  } finally {
    await sql.end();
  }
}

// ─── Step 5: Seed sample content ────────────────────────────────────────────

async function seedContent() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  try {
    const { cmsPosts } = await import('../server/db/schema/cms');
    const { cmsCategories } = await import('../server/db/schema/categories');
    const { cmsTermRelationships } = await import('../server/db/schema/term-relationships');
    const { cmsTerms } = await import('../server/db/schema/terms');

    // Check if any posts exist
    const [existing] = await db
      .select({ count: count() })
      .from(cmsPosts);

    if ((existing?.count ?? 0) > 0) {
      log('⏭️', 'Content already exists.');
      return;
    }

    log('📝', 'Creating sample content...');

    // ── Categories ────────────────────────────────────────────────

    const [catTutorials] = await db.insert(cmsCategories).values({
      name: 'Tutorials',
      slug: 'tutorials',
      lang: 'en',
      title: 'Tutorials',
      text: '<p>Step-by-step guides to help you get the most out of SweetCMS.</p>',
      status: 1,
      order: 1,
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    const [catNews] = await db.insert(cmsCategories).values({
      name: 'News',
      slug: 'news',
      lang: 'en',
      title: 'News & Updates',
      text: '<p>Latest news and announcements about SweetCMS.</p>',
      status: 1,
      order: 2,
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    await db.insert(cmsCategories).values({
      name: 'Development',
      slug: 'development',
      lang: 'en',
      title: 'Development',
      text: '<p>Technical articles about web development, TypeScript, and the T3 Stack.</p>',
      status: 1,
      order: 3,
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    // ── Pages ─────────────────────────────────────────────────────

    await db.insert(cmsPosts).values({
      type: 1,
      status: 1,
      lang: 'en',
      slug: 'welcome',
      title: 'Welcome to SweetCMS',
      content: `<h2>Your CMS is ready!</h2>
<p>This is a sample page created by the init script. You can edit or delete it from the <a href="/dashboard/cms/pages">admin panel</a>.</p>
<h3>Getting Started</h3>
<ul>
  <li>Create pages and blog posts from the dashboard</li>
  <li>Upload media files to the media library</li>
  <li>Configure site settings</li>
  <li>Manage users and roles</li>
</ul>
<p>Check out the <a href="/blog">blog</a> for your latest posts.</p>`,
      metaDescription: 'Welcome to SweetCMS — an agent-driven headless CMS for T3 Stack.',
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    await db.insert(cmsPosts).values({
      type: 1,
      status: 1,
      lang: 'en',
      slug: 'about',
      title: 'About SweetCMS',
      content: `<h2>What is SweetCMS?</h2>
<p>SweetCMS is an open-source, agent-driven headless CMS built on the T3 Stack. It combines Next.js, tRPC, Drizzle ORM, and Better Auth into a cohesive content management system that is optimized for AI-assisted development.</p>
<h3>Key Features</h3>
<ul>
  <li><strong>Agent-Driven Development</strong> — CLAUDE.md serves as the comprehensive project guide, enabling AI agents to understand and modify the codebase effectively</li>
  <li><strong>Modern Stack</strong> — Built with Next.js 16, TypeScript, and Tailwind CSS v4</li>
  <li><strong>Flexible Content</strong> — Pages, blog posts, categories with rich text editing</li>
  <li><strong>Role-Based Access</strong> — User, editor, admin, and superadmin roles</li>
  <li><strong>Media Management</strong> — Upload, organize, and serve media files</li>
  <li><strong>SEO Optimized</strong> — Meta descriptions, OG images, JSON-LD, sitemaps</li>
</ul>
<h3>Open Source</h3>
<p>SweetCMS is open source (AGPL-3.0) and available on GitHub. Commercial licenses available for proprietary use. Contributions are welcome!</p>`,
      metaDescription: 'SweetCMS is an open-source, agent-driven headless CMS built on the T3 Stack (Next.js + tRPC + Drizzle).',
      seoTitle: 'About SweetCMS — Agent-Driven Headless CMS',
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    await db.insert(cmsPosts).values({
      type: 1,
      status: 1,
      lang: 'en',
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      content: `<h2>Privacy Policy</h2>
<p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
<p>This is a sample privacy policy page. Replace this content with your actual privacy policy.</p>
<h3>Information We Collect</h3>
<p>We collect information you provide directly, such as when you create an account, submit content, or contact us.</p>
<h3>How We Use Information</h3>
<p>We use collected information to provide and improve our services, communicate with you, and ensure security.</p>
<h3>Contact Us</h3>
<p>If you have questions about this privacy policy, please contact us through the admin panel.</p>`,
      metaDescription: 'Privacy policy for this website.',
      noindex: true,
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    // ── Blog posts ────────────────────────────────────────────────

    const now = Date.now();

    const [post1] = await db.insert(cmsPosts).values({
      type: 2,
      status: 1,
      lang: 'en',
      slug: 'hello-world',
      title: 'Hello World — Your First Blog Post',
      content: `<p>Welcome to your new blog powered by SweetCMS! This is your first post.</p>
<p>SweetCMS makes it easy to manage your content with a clean admin interface. You can:</p>
<ul>
  <li>Write rich text content with the built-in Tiptap editor</li>
  <li>Organize posts with categories</li>
  <li>Set featured images from the media library</li>
  <li>Schedule posts for future publication</li>
  <li>Preview drafts before publishing</li>
</ul>
<p>Head to the <a href="/dashboard/cms/blog">dashboard</a> to edit this post or create new ones.</p>`,
      metaDescription: 'Welcome to our blog! This is the first post on our new SweetCMS-powered site.',
      publishedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      previewToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    const [post2] = await db.insert(cmsPosts).values({
      type: 2,
      status: 1,
      lang: 'en',
      slug: 'getting-started-with-sweetcms',
      title: 'Getting Started with SweetCMS',
      content: `<h2>Quick Start Guide</h2>
<p>This guide walks you through the basics of managing content in SweetCMS.</p>
<h3>1. Navigate the Dashboard</h3>
<p>The admin dashboard is your central hub. The sidebar gives you access to:</p>
<ul>
  <li><strong>Content</strong> — Manage pages, blog posts, and categories</li>
  <li><strong>Media</strong> — Upload and organize images and documents</li>
  <li><strong>Users</strong> — Manage user accounts and roles</li>
  <li><strong>Settings</strong> — Configure site-wide options</li>
</ul>
<h3>2. Create Your First Page</h3>
<p>Click "Pages" in the sidebar, then "New Page". Give it a title, write your content using the rich text editor, and hit Publish.</p>
<h3>3. Write a Blog Post</h3>
<p>Blog posts work the same way as pages. You can also assign categories and set a featured image to make your posts stand out.</p>
<h3>4. Customize Settings</h3>
<p>Visit Settings to update your site name, tagline, social media links, and other configuration options.</p>
<h3>Next Steps</h3>
<p>Explore the admin panel and create your first piece of original content. Happy publishing!</p>`,
      metaDescription: 'A quick start guide to managing content, media, and settings in SweetCMS.',
      publishedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      previewToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    const [post3] = await db.insert(cmsPosts).values({
      type: 2,
      status: 1,
      lang: 'en',
      slug: 'why-agent-driven-cms',
      title: 'Why an Agent-Driven CMS?',
      content: `<h2>The Problem with Traditional CMS Platforms</h2>
<p>Most content management systems were designed for human developers working alone. They have complex codebases, sparse documentation, and implicit conventions that make it difficult for AI assistants to help effectively.</p>
<h3>The Agent-Driven Approach</h3>
<p>SweetCMS takes a different approach. At its core, the project is designed to be understood and modified by AI agents just as easily as by human developers. The key innovation is the <code>CLAUDE.md</code> file.</p>
<h3>What is CLAUDE.md?</h3>
<p>CLAUDE.md is a comprehensive project guide that documents:</p>
<ul>
  <li>Architecture decisions and patterns</li>
  <li>File structure and naming conventions</li>
  <li>Shared utilities and when to use them</li>
  <li>Coding standards and anti-patterns</li>
  <li>Troubleshooting common issues</li>
</ul>
<p>This enables AI agents to make informed, consistent changes to the codebase — reducing bugs and maintaining quality across contributions.</p>
<h3>The Future of Development</h3>
<p>We believe that AI-assisted development will become the norm. By building for this future today, SweetCMS is positioned to be one of the most maintainable and extensible CMS platforms available.</p>`,
      metaDescription: 'Why SweetCMS is built as an agent-driven CMS and how CLAUDE.md enables effective AI-assisted development.',
      publishedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      previewToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    // Draft post (not published)
    await db.insert(cmsPosts).values({
      type: 2,
      status: 0,
      lang: 'en',
      slug: 'upcoming-features',
      title: 'Upcoming Features in SweetCMS',
      content: `<p>This is a draft post about upcoming features. Edit and publish it when ready!</p>
<h3>Planned Features</h3>
<ul>
  <li>Image optimization pipeline</li>
  <li>Multi-language content (i18n)</li>
</ul>`,
      metaDescription: 'A preview of upcoming features planned for SweetCMS.',
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    // ── Tags ──────────────────────────────────────────────────────

    const [tagNextjs] = await db.insert(cmsTerms).values({
      taxonomyId: 'tag',
      name: 'Next.js',
      slug: 'nextjs',
      lang: 'en',
      status: 1,
    }).returning();

    const [tagTypescript] = await db.insert(cmsTerms).values({
      taxonomyId: 'tag',
      name: 'TypeScript',
      slug: 'typescript',
      lang: 'en',
      status: 1,
    }).returning();

    const [tagTutorial] = await db.insert(cmsTerms).values({
      taxonomyId: 'tag',
      name: 'Tutorial',
      slug: 'tutorial',
      lang: 'en',
      status: 1,
    }).returning();

    const [tagAnnouncement] = await db.insert(cmsTerms).values({
      taxonomyId: 'tag',
      name: 'Announcement',
      slug: 'announcement',
      lang: 'en',
      status: 1,
    }).returning();

    // ── Post-Category & Post-Tag associations ────────────────────

    if (catTutorials && catNews && post1 && post2 && post3) {
      await db.insert(cmsTermRelationships).values([
        { objectId: post1.id, termId: catNews!.id, taxonomyId: 'category' },
        { objectId: post2.id, termId: catTutorials!.id, taxonomyId: 'category' },
        { objectId: post3.id, termId: catNews!.id, taxonomyId: 'category' },
      ]);
    }

    if (tagNextjs && tagTypescript && tagTutorial && tagAnnouncement && post1 && post2 && post3) {
      await db.insert(cmsTermRelationships).values([
        { objectId: post1.id, termId: tagAnnouncement!.id, taxonomyId: 'tag' },
        { objectId: post2.id, termId: tagTutorial!.id, taxonomyId: 'tag' },
        { objectId: post2.id, termId: tagNextjs!.id, taxonomyId: 'tag' },
        { objectId: post3.id, termId: tagTypescript!.id, taxonomyId: 'tag' },
        { objectId: post3.id, termId: tagNextjs!.id, taxonomyId: 'tag' },
      ]);
    }

    // ── Portfolio items ─────────────────────────────────────────
    const { cmsPortfolio } = await import('../server/db/schema/portfolio');

    const [portfolio1] = await db.insert(cmsPortfolio).values({
      name: 'SweetCMS Website',
      slug: 'sweetcms-website',
      lang: 'en',
      title: 'SweetCMS — Official Website',
      text: `## Project Overview

Built the official website and documentation for the SweetCMS open-source project. The site showcases the CMS features, provides getting-started guides, and hosts the project blog.

## Highlights

- Server-side rendered with Next.js App Router for optimal SEO
- Full-text search across all documentation
- Dynamic sitemap generation
- Responsive design with dark mode support`,
      status: 1,
      publishedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      clientName: 'SweetAI',
      projectUrl: 'https://github.com/sweetai/sweetcms',
      techStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'PostgreSQL', 'tRPC'],
      metaDescription: 'Official website for the SweetCMS open-source headless CMS, built with Next.js and TypeScript.',
      previewToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    const [portfolio2] = await db.insert(cmsPortfolio).values({
      name: 'E-Commerce Dashboard',
      slug: 'ecommerce-dashboard',
      lang: 'en',
      title: 'E-Commerce Analytics Dashboard',
      text: `## Project Overview

Designed and built a real-time analytics dashboard for an e-commerce platform. The dashboard provides insights into sales, customer behavior, and inventory management.

## Features

- Real-time sales tracking with WebSocket updates
- Interactive charts and data visualization
- Inventory alerts and automated reporting
- Role-based access for store managers and executives`,
      status: 1,
      publishedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      clientName: 'Acme Corp',
      techStack: ['React', 'TypeScript', 'D3.js', 'Node.js', 'Redis'],
      metaDescription: 'Real-time e-commerce analytics dashboard with interactive charts and automated reporting.',
      previewToken: crypto.randomBytes(32).toString('hex'),
    }).returning();

    // Link portfolio items to tags
    if (tagNextjs && tagTypescript && portfolio1 && portfolio2) {
      await db.insert(cmsTermRelationships).values([
        { objectId: portfolio1.id, termId: tagNextjs!.id, taxonomyId: 'tag' },
        { objectId: portfolio1.id, termId: tagTypescript!.id, taxonomyId: 'tag' },
        { objectId: portfolio2.id, termId: tagTypescript!.id, taxonomyId: 'tag' },
      ]);
    }

    log('✅', '3 pages, 4 blog posts (1 draft), 3 categories, 4 tags, and 2 portfolio items created.');
  } finally {
    await sql.end();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════╗');
  console.log('  ║     SweetCMS Initialization    ║');
  console.log('  ╚═══════════════════════════════╝');
  console.log('');

  await ensureDatabase();
  runMigrations();
  await createSuperadmin();
  await seedOptions();
  await seedContent();

  console.log('');
  log('🚀', 'SweetCMS is ready! Run `bun run dev` to start.');
  console.log('');
}

main().catch((err) => {
  console.error('Init failed:', err);
  process.exit(1);
});
