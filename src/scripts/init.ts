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
 * 4. Prompts for company info (used in legal page templates)
 * 5. Seeds default site options
 * 6. Generates placeholder images + cms_media records
 * 7. Seeds content: 6 categories, 12 tags, legal pages (from templates),
 *    3 standard pages, 101 blog posts, 4 portfolio items, 5 showcase items,
 *    and all term relationships
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';
import { execSync } from 'child_process';
import * as readline from 'readline';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { deflateSync } from 'zlib';
import { fileURLToPath } from 'url';
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

// ─── Types ─────────────────────────────────────────────────────────────────

interface CompanyInfo {
  siteName: string;
  siteUrl: string;
  companyName: string;
  companyAddress: string;
  companyId: string;
  companyJurisdiction: string;
  contactEmail: string;
}

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
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptWithDefault(question: string, defaultValue: string): Promise<string> {
  const answer = await prompt(`${question} [${defaultValue}]: `);
  return answer || defaultValue;
}

function log(emoji: string, msg: string) {
  console.log(`${emoji} ${msg}`);
}

function simpleSlugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── PNG Generation ─────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]!) & 0xFF]!;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crcBuf]);
}

function createPlaceholderPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    raw[offset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

const SEED_IMAGES = [
  { filename: 'blog-header-01.png', width: 1200, height: 630, r: 230, g: 126, b: 100, alt: 'Placeholder image — warm coral' },
  { filename: 'blog-header-02.png', width: 1200, height: 630, r: 100, g: 149, b: 230, alt: 'Placeholder image — cool blue' },
  { filename: 'blog-header-03.png', width: 1200, height: 630, r: 100, g: 190, b: 130, alt: 'Placeholder image — green' },
  { filename: 'blog-header-04.png', width: 1200, height: 630, r: 160, g: 120, b: 210, alt: 'Placeholder image — purple' },
  { filename: 'blog-header-05.png', width: 1200, height: 630, r: 220, g: 170, b: 80, alt: 'Placeholder image — amber' },
  { filename: 'blog-header-06.png', width: 1200, height: 630, r: 80, g: 180, b: 200, alt: 'Placeholder image — teal' },
  { filename: 'portfolio-01.png', width: 800, height: 600, r: 70, g: 140, b: 200, alt: 'Placeholder image — ocean blue' },
  { filename: 'portfolio-02.png', width: 800, height: 600, r: 200, g: 100, b: 160, alt: 'Placeholder image — magenta' },
  { filename: 'portfolio-03.png', width: 800, height: 600, r: 140, g: 180, b: 70, alt: 'Placeholder image — lime' },
  { filename: 'portfolio-04.png', width: 800, height: 600, r: 200, g: 140, b: 80, alt: 'Placeholder image — orange' },
  { filename: 'showcase-01.png', width: 540, height: 960, r: 180, g: 80, b: 160, alt: 'Placeholder image — deep magenta' },
  { filename: 'showcase-02.png', width: 540, height: 960, r: 80, g: 160, b: 190, alt: 'Placeholder image — cyan' },
];

const CATEGORIES_DATA = [
  { name: 'Tutorials', slug: 'tutorials', title: 'Tutorials', text: 'Step-by-step guides and walkthroughs for developers of all skill levels. Learn practical techniques through hands-on examples and detailed explanations.', order: 1 },
  { name: 'News', slug: 'news', title: 'News & Updates', text: 'Latest announcements, release notes, and industry news. Stay informed about new features, breaking changes, and ecosystem developments.', order: 2 },
  { name: 'Development', slug: 'development', title: 'Development', text: 'Technical articles covering web development, software architecture, and programming best practices. Deep dives into TypeScript, React, and the T3 Stack.', order: 3 },
  { name: 'Design', slug: 'design', title: 'Design & UX', text: 'User experience, interface design, and visual design patterns. Practical advice on creating intuitive and accessible digital products.', order: 4 },
  { name: 'Business', slug: 'business', title: 'Business & SaaS', text: 'Entrepreneurship, SaaS growth strategies, and product management. Insights on building and scaling software businesses.', order: 5 },
  { name: 'DevOps', slug: 'devops', title: 'DevOps & Infrastructure', text: 'Cloud infrastructure, CI/CD pipelines, containerization, and deployment strategies. Practical guides for reliable and scalable systems.', order: 6 },
];

const TAGS_DATA = [
  'Next.js', 'TypeScript', 'React', 'Tailwind CSS', 'PostgreSQL', 'tRPC',
  'Authentication', 'Performance', 'Testing', 'Docker', 'SEO', 'Accessibility',
];

const TOPICS = [
  'TypeScript', 'Next.js', 'React', 'Tailwind CSS', 'PostgreSQL',
  'API Design', 'Authentication', 'Web Performance', 'Unit Testing',
  'CI/CD', 'SEO', 'Accessibility', 'State Management', 'Database Design',
  'Docker',
];

const TITLE_PATTERNS = [
  'Getting Started with {topic}',
  '{topic}: A Comprehensive Guide',
  'Best Practices for {topic}',
  'Common {topic} Mistakes and How to Fix Them',
  'Advanced {topic} Patterns for Production Apps',
  '{topic} for Beginners: What You Need to Know',
  'Mastering {topic} Step by Step',
  'Why {topic} Matters for Modern Web Development',
  '{topic} Tips and Tricks for Experienced Developers',
  'The Ultimate {topic} Reference',
  'How to Improve Your {topic} Workflow',
  '{topic} in Practice: Real-World Examples',
  'Building Scalable Applications with {topic}',
  'A Practical Guide to {topic}',
];

const LOREM_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.',
  'Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula.',
  'Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat. Aliquam erat volutpat. Nam dui mi, tincidunt quis, accumsan porttitor, facilisis luctus, metus. Phasellus ultrices nulla quis nibh. Quisque a lectus.',
  'Fusce convallis metus id felis luctus adipiscing. Pellentesque egestas, neque sit amet convallis pulvinar, justo nulla eleifend augue, ac auctor orci leo non est. Quisque id mi. Ut tincidunt tincidunt erat. Etiam vestibulum volutpat enim. Diam quis enim lobortis scelerisque fermentum.',
  'Morbi in sem quis dui placerat ornare. Pellentesque odio nisi, euismod in, pharetra a, ultricies in, diam. Sed arcu. Cras consequat. Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat.',
  'Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Morbi lacinia molestie dui. Praesent blandit dolor. Sed non quam. In vel mi sit amet augue congue elementum. Morbi in ipsum sit amet pede facilisis laoreet.',
  'Donec lacus nunc, viverra nec, blandit vel, egestas et, augue. Vestibulum tincidunt malesuada tellus. Ut ultrices ultrices enim. Curabitur sit amet mauris. Morbi in dui quis est pulvinar ullamcorper. Nulla facilisi. Integer lacinia sollicitudin massa.',
  'Etiam iaculis nunc ac metus. Ut id nisl quis enim dignissim sagittis. Etiam sollicitudin, ipsum eu pulvinar rutrum, tellus ipsum laoreet sapien, quis venenatis ante odio sit amet eros. Proin magna. Duis vel nibh at velit scelerisque suscipit.',
  'Maecenas malesuada elit lectus felis, malesuada ultricies. Curabitur et ligula. Ut molestie a, ultricies porta urna. Vestibulum commodo volutpat a, convallis ac, laoreet enim. Phasellus fermentum in, dolor. Pellentesque facilisis. Nulla imperdiet sit amet magna.',
  'Sed lectus. Integer euismod lacus luctus magna. Quisque cursus, metus vitae pharetra auctor, sem massa mattis sem, at interdum magna augue eget diam. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Morbi lacinia molestie dui.',
  'Nunc nec neque. Phasellus leo dolor, tempus non, auctor et, hendrerit quis, nisi. Curabitur ligula sapien, tincidunt non, euismod vitae, posuere imperdiet, leo. Maecenas malesuada. Praesent congue erat at massa. Sed cursus turpis vitae tortor.',
  'Suspendisse potenti. Fusce ac felis sit amet ligula pharetra condimentum. Maecenas egestas arcu quis ligula mattis placerat. Duis lobortis massa imperdiet quam. Suspendisse potenti. Pellentesque commodo eros a enim. Vestibulum turpis sem, aliquet eget.',
  'Aliquam erat volutpat. Nunc fermentum tortor ac porta dapibus. In rutrum ac purus sit amet tempus. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nulla facilisi. Cras non velit nec nisi vulputate nonummy. Maecenas tincidunt lacus at velit.',
  'Vivamus vestibulum ntulla nec ante. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos hymenaeos. Curabitur sodales ligula in libero. Sed dignissim lacinia nunc. Curabitur tortor. Pellentesque nibh. Aenean quam.',
];

const SECTION_HEADINGS = [
  'Overview', 'Key Concepts', 'Getting Started', 'Configuration',
  'Basic Usage', 'Advanced Features', 'Best Practices', 'Common Patterns',
  'Error Handling', 'Performance Considerations', 'Testing Strategies',
  'Deployment', 'Troubleshooting', 'Summary', 'Next Steps',
  'Architecture', 'Implementation Details', 'Security Considerations',
  'Monitoring and Observability', 'Migration Guide',
];

function generateBlogPost(index: number) {
  const topicIdx = index % TOPICS.length;
  const patternIdx = Math.floor(index / TOPICS.length) % TITLE_PATTERNS.length;
  const topic = TOPICS[topicIdx]!;
  const title = TITLE_PATTERNS[patternIdx]!.replace('{topic}', topic);
  const slug = simpleSlugify(title);

  // Generate content with 2-5 sections
  const sectionCount = 2 + (index % 4);
  let content = LOREM_PARAGRAPHS[index % LOREM_PARAGRAPHS.length]! + '\n\n';
  for (let s = 0; s < sectionCount; s++) {
    const hIdx = (index * 7 + s * 3) % SECTION_HEADINGS.length;
    content += `## ${SECTION_HEADINGS[hIdx]!}\n\n`;
    content += LOREM_PARAGRAPHS[(index * 3 + s * 5) % LOREM_PARAGRAPHS.length]! + '\n\n';
    if ((index + s) % 3 === 0) {
      content += LOREM_PARAGRAPHS[(index * 3 + s * 5 + 7) % LOREM_PARAGRAPHS.length]! + '\n\n';
    }
  }

  // Assign category (deterministic)
  const categoryIdx = index % CATEGORIES_DATA.length;

  // Assign 2-3 tags
  const tagCount = 2 + (index % 2);
  const tagIndices: number[] = [];
  for (let t = 0; t < tagCount; t++) {
    const tagIdx = (index * 3 + t * 7) % TAGS_DATA.length;
    if (!tagIndices.includes(tagIdx)) {
      tagIndices.push(tagIdx);
    }
  }

  // Status: 90 published, 3 scheduled, 8 draft
  let status = 1; // published
  if (index >= 93) status = 0;       // draft (last 8)
  else if (index >= 90) status = 2;  // scheduled (3)

  // Spread published dates over 6 months
  const daysAgo = Math.floor((100 - index) * 1.8);
  const publishedAt = index < 90
    ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    : status === 2
      ? new Date(Date.now() + (index - 89) * 7 * 24 * 60 * 60 * 1000)
      : null;

  // Featured image (cycle through 6 blog headers)
  const imageIdx = (index % 6) + 1;
  const featuredImage = `/api/uploads/seed/blog-header-${String(imageIdx).padStart(2, '0')}.png`;

  const metaDescription = `A comprehensive article about ${topic}. ${LOREM_PARAGRAPHS[0]!.slice(0, 100)}...`;

  return { title, slug, content, categoryIdx, tagIndices, status, publishedAt, featuredImage, metaDescription, topic };
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
    const { user } = await import('../server/db/schema/auth');

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

    const userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      role: 'superadmin',
    });

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

// ─── Step 4: Prompt for company info ────────────────────────────────────────

async function promptCompanyInfo(): Promise<CompanyInfo> {
  log('🏢', 'Company info (used in legal page templates)...');
  console.log('');

  const envSiteName = process.env.NEXT_PUBLIC_SITE_NAME;
  const envSiteUrl = process.env.NEXT_PUBLIC_APP_URL;

  const siteName = envSiteName
    ? await promptWithDefault('  Site name', envSiteName)
    : await prompt('  Site name: ') || 'SweetCMS';

  const siteUrl = envSiteUrl
    ? await promptWithDefault('  Site URL', envSiteUrl)
    : await prompt('  Site URL: ') || 'http://localhost:3000';

  const companyName = await prompt('  Company legal name (e.g. "Acme Corp s.r.o."): ') || 'SweetCMS Inc.';
  const companyAddress = await prompt('  Company address: ') || '123 Main Street, City, Country';
  const companyId = await prompt('  Company registration number: ') || 'N/A';
  const companyJurisdiction = await prompt('  Governing law jurisdiction (e.g. "the Slovak Republic", "England and Wales"): ') || 'the United States';
  const contactEmail = await prompt('  Contact email: ') || 'info@example.com';

  console.log('');
  return { siteName, siteUrl, companyName, companyAddress, companyId, companyJurisdiction, contactEmail };
}

// ─── Step 5: Seed options ───────────────────────────────────────────────────

async function seedOptions(companyInfo: CompanyInfo) {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  try {
    const { cmsOptions } = await import('../server/db/schema/cms');

    const [existing] = await db
      .select({ count: count() })
      .from(cmsOptions);

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
  } finally {
    await sql.end();
  }
}

// ─── Step 6: Seed media ─────────────────────────────────────────────────────

interface MediaRecord {
  id: string;
  filename: string;
  filepath: string;
}

async function seedMedia(): Promise<MediaRecord[]> {
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'seed');

  if (fs.existsSync(uploadsDir)) {
    log('⏭️', 'uploads/seed/ already exists. Skipping media generation.');
    // Still need to return media records from DB for content seeding
    const sql = postgres(DATABASE_URL!, { max: 1 });
    const db = drizzle(sql);
    try {
      const { cmsMedia } = await import('../server/db/schema/media');
      const records = await db.select({
        id: cmsMedia.id,
        filename: cmsMedia.filename,
        filepath: cmsMedia.filepath,
      }).from(cmsMedia).limit(50);
      return records;
    } finally {
      await sql.end();
    }
  }

  log('🖼️', 'Generating placeholder images...');

  fs.mkdirSync(uploadsDir, { recursive: true });

  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);
  const mediaRecords: MediaRecord[] = [];

  try {
    const { cmsMedia } = await import('../server/db/schema/media');

    for (const img of SEED_IMAGES) {
      const pngBuffer = createPlaceholderPng(img.width, img.height, img.r, img.g, img.b);
      const filePath = path.join(uploadsDir, img.filename);
      fs.writeFileSync(filePath, pngBuffer);

      const [record] = await db.insert(cmsMedia).values({
        filename: img.filename,
        filepath: `uploads/seed/${img.filename}`,
        fileType: 1, // IMAGE
        mimeType: 'image/png',
        fileSize: pngBuffer.length,
        altText: img.alt,
        width: img.width,
        height: img.height,
      }).returning();

      if (record) {
        mediaRecords.push({ id: record.id, filename: record.filename, filepath: record.filepath });
      }
    }

    log('✅', `${SEED_IMAGES.length} placeholder images generated and ${mediaRecords.length} media records created.`);
  } finally {
    await sql.end();
  }

  return mediaRecords;
}

// ─── Step 7: Seed content ───────────────────────────────────────────────────

async function seedContent(companyInfo: CompanyInfo) {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  try {
    const { cmsPosts } = await import('../server/db/schema/cms');
    const { cmsCategories } = await import('../server/db/schema/categories');
    const { cmsTermRelationships } = await import('../server/db/schema/term-relationships');
    const { cmsTerms } = await import('../server/db/schema/terms');
    const { cmsPortfolio } = await import('../server/db/schema/portfolio');
    const { cmsShowcase } = await import('../server/db/schema/showcase');

    // Check if any posts exist
    const [existing] = await db
      .select({ count: count() })
      .from(cmsPosts);

    if ((existing?.count ?? 0) > 0) {
      log('⏭️', 'Content already exists.');
      return;
    }

    log('📝', 'Seeding content...');
    const now = Date.now();

    // ── 7a. Categories (6) ──────────────────────────────────────────

    const categoryRecords = await db.insert(cmsCategories).values(
      CATEGORIES_DATA.map((cat) => ({
        name: cat.name,
        slug: cat.slug,
        lang: 'en',
        title: cat.title,
        text: cat.text,
        status: 1,
        order: cat.order,
        publishedAt: new Date(),
        previewToken: crypto.randomBytes(32).toString('hex'),
      }))
    ).returning();

    log('  📂', `${categoryRecords.length} categories created.`);

    // ── 7b. Tags (12) ───────────────────────────────────────────────

    const tagRecords = await db.insert(cmsTerms).values(
      TAGS_DATA.map((tagName) => ({
        taxonomyId: 'tag',
        name: tagName,
        slug: simpleSlugify(tagName),
        lang: 'en',
        status: 1,
      }))
    ).returning();

    log('  🏷️', `${tagRecords.length} tags created.`);

    // ── 7c. Legal pages (from templates) ────────────────────────────

    const templateDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'seed-templates', 'en');
    let legalPageCount = 0;

    if (fs.existsSync(templateDir)) {
      const templateFiles = fs.readdirSync(templateDir).filter((f: string) => f.endsWith('.md')).sort();

      for (const filename of templateFiles) {
        const filePath = path.join(templateDir, filename);
        let fileContent = fs.readFileSync(filePath, 'utf-8');

        // Replace placeholders
        fileContent = fileContent
          .replace(/\{\{SITE_NAME\}\}/g, companyInfo.siteName)
          .replace(/\{\{SITE_URL\}\}/g, companyInfo.siteUrl)
          .replace(/\{\{COMPANY_NAME\}\}/g, companyInfo.companyName)
          .replace(/\{\{COMPANY_ADDRESS\}\}/g, companyInfo.companyAddress)
          .replace(/\{\{COMPANY_ID\}\}/g, companyInfo.companyId)
          .replace(/\{\{COMPANY_JURISDICTION\}\}/g, companyInfo.companyJurisdiction)
          .replace(/\{\{CONTACT_EMAIL\}\}/g, companyInfo.contactEmail)
          .replace(/\{\{CURRENT_DATE\}\}/g, formatDate(new Date()));

        // Extract title from first line (remove # prefix)
        const lines = fileContent.split('\n');
        const title = (lines[0] ?? '').replace(/^#\s+/, '').trim();
        const content = lines.slice(1).join('\n').trim();
        const slug = filename.replace(/\.md$/, '');

        await db.insert(cmsPosts).values({
          type: 1, // PAGE
          status: 1,
          lang: 'en',
          slug,
          title,
          content,
          metaDescription: `${title} for ${companyInfo.siteName}.`,
          noindex: true,
          publishedAt: new Date(),
          previewToken: crypto.randomBytes(32).toString('hex'),
        });

        legalPageCount++;
      }

      log('  📜', `${legalPageCount} legal pages created from templates.`);
    } else {
      log('  ⚠️', 'No seed-templates/en/ directory found. Skipping legal pages.');
    }

    // ── 7d. Standard pages (3) ──────────────────────────────────────

    await db.insert(cmsPosts).values({
      type: 1,
      status: 1,
      lang: 'en',
      slug: 'welcome',
      title: 'Welcome to SweetCMS',
      content: `## Your CMS is ready!

This is a sample page created by the init script. You can edit or delete it from the [admin panel](/dashboard/cms/pages).

### Getting Started

- Create pages and blog posts from the dashboard
- Upload media files to the media library
- Configure site settings under Settings
- Manage users and roles from the Users section
- Set up categories and tags to organize your content

Check out the [blog](/blog) for your latest posts, or explore the [portfolio](/portfolio) to see project showcases.`,
      metaDescription: `Welcome to ${companyInfo.siteName} — an agent-driven headless CMS for T3 Stack.`,
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    await db.insert(cmsPosts).values({
      type: 1,
      status: 1,
      lang: 'en',
      slug: 'about',
      title: 'About SweetCMS',
      content: `## What is SweetCMS?

SweetCMS is an open-source, agent-driven headless CMS built on the T3 Stack. It combines Next.js, tRPC, Drizzle ORM, and Better Auth into a cohesive content management system that is optimized for AI-assisted development.

### Key Features

- **Agent-Driven Development** — CLAUDE.md serves as the comprehensive project guide, enabling AI agents to understand and modify the codebase effectively
- **Modern Stack** — Built with Next.js 16, TypeScript, and Tailwind CSS v4
- **Flexible Content** — Pages, blog posts, portfolio items, showcase cards, categories, and tags
- **Role-Based Access** — User, editor, admin, and superadmin roles with policy-based permissions
- **Media Management** — Upload, organize, and serve media files with automatic thumbnails
- **SEO Optimized** — Meta descriptions, OG images, JSON-LD, dynamic sitemaps, and slug redirects
- **SaaS Primitives** — Organizations, Stripe billing, notifications, WebSocket real-time

### Open Source

SweetCMS is open source (AGPL-3.0) and available on GitHub. Commercial licenses available for proprietary use. Contributions are welcome!`,
      metaDescription: 'SweetCMS is an open-source, agent-driven headless CMS built on the T3 Stack (Next.js + tRPC + Drizzle).',
      seoTitle: 'About SweetCMS — Agent-Driven Headless CMS',
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    await db.insert(cmsPosts).values({
      type: 1,
      status: 1,
      lang: 'en',
      slug: 'faq',
      title: 'Frequently Asked Questions',
      content: `## General Questions

### What is SweetCMS?

SweetCMS is an open-source, AI agent-driven CMS and SaaS starter built on the T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). It provides a complete content management system with SaaS primitives like organizations, billing, and real-time notifications.

### Who is SweetCMS for?

SweetCMS is designed for developers and teams building SaaS products, marketing sites, blogs, or any content-driven application. It is especially well-suited for projects that leverage AI-assisted development workflows.

### Is SweetCMS free to use?

Yes. SweetCMS is open source under the AGPL-3.0 license. You can use it freely for any project. Commercial licenses are available if you need proprietary deployment without the AGPL requirements.

## Technical Questions

### What tech stack does SweetCMS use?

SweetCMS is built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL, and Better Auth. It also supports Redis for caching and rate limiting, BullMQ for background jobs, and WebSockets for real-time features.

### How do I deploy SweetCMS?

SweetCMS can be deployed anywhere that supports Node.js. Popular choices include Vercel, Railway, Fly.io, and any VPS with Docker. You will need a PostgreSQL database and optionally Redis for full functionality.

### Can I customize the design?

Absolutely. SweetCMS uses an OKLCH design token system with Tailwind CSS v4. You can rebrand the entire application by changing a few CSS custom properties for hue, lightness, and chroma values.

## Content Management

### What content types are supported?

Out of the box, SweetCMS supports pages, blog posts, portfolio items, showcase cards, categories, and tags. The content type registry is config-driven, so adding new types requires minimal code changes.

### Does SweetCMS support multiple languages?

Yes. SweetCMS has built-in i18n with proxy-rewrite locale routing, translation groups for content, and a translation bar in the admin panel. Add new locales by updating a single config array.

### Can I use a rich text editor?

Yes. The admin panel includes a Tiptap-based rich text editor with support for headings, lists, images, links, code blocks, and custom shortcodes. Content is stored as Markdown for portability.`,
      metaDescription: 'Frequently asked questions about SweetCMS — installation, customization, content management, and deployment.',
      seoTitle: 'FAQ — SweetCMS',
      publishedAt: new Date(),
      previewToken: crypto.randomBytes(32).toString('hex'),
    });

    log('  📄', '3 standard pages created (Welcome, About, FAQ).');

    // ── 7e. Blog posts (101) ────────────────────────────────────────

    const BATCH_SIZE = 20;
    const allBlogPosts: Array<{ id: string; categoryIdx: number; tagIndices: number[] }> = [];

    for (let batchStart = 0; batchStart < 101; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, 101);
      const batchData = [];

      for (let i = batchStart; i < batchEnd; i++) {
        batchData.push(generateBlogPost(i));
      }

      const inserted = await db.insert(cmsPosts).values(
        batchData.map((post) => ({
          type: 2, // BLOG
          status: post.status,
          lang: 'en',
          slug: post.slug,
          title: post.title,
          content: post.content,
          metaDescription: post.metaDescription,
          featuredImage: post.featuredImage,
          featuredImageAlt: `Header image for ${post.title}`,
          noindex: false,
          publishedAt: post.publishedAt,
          previewToken: crypto.randomBytes(32).toString('hex'),
        }))
      ).returning();

      for (let j = 0; j < inserted.length; j++) {
        const record = inserted[j]!;
        const postData = batchData[j]!;
        allBlogPosts.push({
          id: record.id,
          categoryIdx: postData.categoryIdx,
          tagIndices: postData.tagIndices,
        });
      }
    }

    log('  📰', `${allBlogPosts.length} blog posts created (90 published, 3 scheduled, 8 drafts).`);

    // ── 7f. Portfolio items (4) ─────────────────────────────────────

    const portfolioRecords = await db.insert(cmsPortfolio).values([
      {
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
        featuredImage: '/api/uploads/seed/portfolio-01.png',
        featuredImageAlt: 'SweetCMS Website screenshot',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
      {
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
        featuredImage: '/api/uploads/seed/portfolio-02.png',
        featuredImageAlt: 'E-Commerce Dashboard screenshot',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
      {
        name: 'Mobile Banking App',
        slug: 'mobile-banking-app',
        lang: 'en',
        title: 'Mobile Banking Application',
        text: `## Project Overview

Developed a cross-platform mobile banking application for FinTech Corp. The app enables customers to manage accounts, transfer funds, pay bills, and track spending with real-time notifications.

## Features

- Biometric authentication (Face ID, fingerprint)
- Real-time push notifications for transactions
- Budget tracking with visual spending breakdowns
- Bill payment scheduling and recurring transfers
- Multi-currency support with live exchange rates`,
        status: 1,
        publishedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
        completedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
        clientName: 'FinTech Corp',
        techStack: ['React Native', 'TypeScript', 'Node.js', 'PostgreSQL'],
        metaDescription: 'Cross-platform mobile banking application with biometric auth, real-time notifications, and budget tracking.',
        featuredImage: '/api/uploads/seed/portfolio-03.png',
        featuredImageAlt: 'Mobile Banking App screenshot',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
      {
        name: 'SaaS Analytics Platform',
        slug: 'saas-analytics-platform',
        lang: 'en',
        title: 'SaaS Analytics Platform',
        text: `## Project Overview

Built a comprehensive analytics platform for DataViz Inc that processes millions of events daily. The platform provides real-time dashboards, custom report builders, and automated insights powered by machine learning.

## Features

- Real-time event streaming and aggregation pipeline
- Drag-and-drop custom dashboard builder
- Automated anomaly detection and alerting
- Data export in multiple formats (CSV, JSON, Parquet)
- Team collaboration with shared dashboards and annotations`,
        status: 1,
        publishedAt: new Date(now - 40 * 24 * 60 * 60 * 1000),
        completedAt: new Date(now - 40 * 24 * 60 * 60 * 1000),
        clientName: 'DataViz Inc',
        projectUrl: 'https://dataviz-demo.example.com',
        techStack: ['Next.js', 'PostgreSQL', 'Redis', 'ClickHouse', 'Python'],
        metaDescription: 'SaaS analytics platform with real-time dashboards, custom reports, and ML-powered anomaly detection.',
        featuredImage: '/api/uploads/seed/portfolio-04.png',
        featuredImageAlt: 'SaaS Analytics Platform screenshot',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
    ]).returning();

    log('  💼', `${portfolioRecords.length} portfolio items created.`);

    // ── 7g. Showcase items (5) ──────────────────────────────────────

    const showcaseRecords = await db.insert(cmsShowcase).values([
      {
        title: 'Welcome to Showcase',
        slug: 'welcome-to-showcase',
        lang: 'en',
        description: `This is a **rich text** showcase card. Use it for testimonials, quotes, feature highlights, or any text-first content.\n\nSwipe up or press the arrow keys to see more.`,
        cardType: 'richtext',
        status: 1,
        sortOrder: 0,
        publishedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
        metaDescription: 'Introduction to the SweetCMS showcase feed.',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
      {
        title: 'Video Embed Demo',
        slug: 'video-embed-demo',
        lang: 'en',
        description: 'Showcase supports YouTube and Vimeo embeds. Videos auto-play when scrolled into view and pause when you swipe away.',
        cardType: 'video',
        mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        status: 1,
        sortOrder: 1,
        publishedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
        metaDescription: 'Video embed demonstration in the SweetCMS showcase.',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
      {
        title: 'Image Card Example',
        slug: 'image-card-example',
        lang: 'en',
        description: 'Full-bleed images with text overlay. Perfect for product shots, team photos, or hero visuals.',
        cardType: 'image',
        mediaUrl: '/api/uploads/seed/showcase-01.png',
        thumbnailUrl: '/api/uploads/seed/showcase-01.png',
        status: 1,
        sortOrder: 2,
        publishedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
        metaDescription: 'Image card showcase demonstration.',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
      {
        title: 'Client Testimonial',
        slug: 'client-testimonial',
        lang: 'en',
        description: `> "SweetCMS transformed our content workflow. The AI-driven approach means our team ships features twice as fast, and the built-in CMS handles all our marketing pages beautifully."\n\n— **Jane Smith**, CTO at TechStartup Inc.\n\nShowcase cards are perfect for highlighting customer success stories and building social proof.`,
        cardType: 'richtext',
        status: 1,
        sortOrder: 3,
        publishedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
        metaDescription: 'Customer testimonial showcasing SweetCMS benefits.',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
      {
        title: 'Product Feature Highlight',
        slug: 'product-feature-highlight',
        lang: 'en',
        description: `## Real-Time Collaboration\n\nSweetCMS supports WebSocket-powered real-time features out of the box:\n\n- **Live notifications** — instant alerts for content updates\n- **Presence indicators** — see who is editing what\n- **Organization channels** — scoped broadcasts per team\n\nAll backed by Redis pub/sub for multi-instance deployments.`,
        cardType: 'richtext',
        status: 1,
        sortOrder: 4,
        publishedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
        metaDescription: 'Highlighting real-time collaboration features in SweetCMS.',
        previewToken: crypto.randomBytes(32).toString('hex'),
      },
    ]).returning();

    log('  🎴', `${showcaseRecords.length} showcase items created.`);

    // ── 7h. Relationships ───────────────────────────────────────────

    log('  🔗', 'Wiring up term relationships...');

    const relationships: Array<{ objectId: string; termId: string; taxonomyId: string }> = [];

    // Blog post -> category and tag relationships
    for (const post of allBlogPosts) {
      const category = categoryRecords[post.categoryIdx];
      if (category) {
        relationships.push({
          objectId: post.id,
          termId: category.id,
          taxonomyId: 'category',
        });
      }

      for (const tagIdx of post.tagIndices) {
        const tag = tagRecords[tagIdx];
        if (tag) {
          relationships.push({
            objectId: post.id,
            termId: tag.id,
            taxonomyId: 'tag',
          });
        }
      }
    }

    // Portfolio -> tag relationships
    // Portfolio 1 (SweetCMS Website) -> Next.js, TypeScript, Tailwind CSS
    const tagNextjs = tagRecords.find((t) => t.slug === 'nextjs');
    const tagTypescript = tagRecords.find((t) => t.slug === 'typescript');
    const tagTailwind = tagRecords.find((t) => t.slug === 'tailwind-css');
    const tagPostgresql = tagRecords.find((t) => t.slug === 'postgresql');
    const tagDocker = tagRecords.find((t) => t.slug === 'docker');
    const tagReact = tagRecords.find((t) => t.slug === 'react');
    const tagPerformance = tagRecords.find((t) => t.slug === 'performance');

    if (portfolioRecords[0] && tagNextjs) relationships.push({ objectId: portfolioRecords[0].id, termId: tagNextjs.id, taxonomyId: 'tag' });
    if (portfolioRecords[0] && tagTypescript) relationships.push({ objectId: portfolioRecords[0].id, termId: tagTypescript.id, taxonomyId: 'tag' });
    if (portfolioRecords[0] && tagTailwind) relationships.push({ objectId: portfolioRecords[0].id, termId: tagTailwind.id, taxonomyId: 'tag' });

    // Portfolio 2 (E-Commerce Dashboard) -> TypeScript, React, Performance
    if (portfolioRecords[1] && tagTypescript) relationships.push({ objectId: portfolioRecords[1].id, termId: tagTypescript.id, taxonomyId: 'tag' });
    if (portfolioRecords[1] && tagReact) relationships.push({ objectId: portfolioRecords[1].id, termId: tagReact.id, taxonomyId: 'tag' });
    if (portfolioRecords[1] && tagPerformance) relationships.push({ objectId: portfolioRecords[1].id, termId: tagPerformance.id, taxonomyId: 'tag' });

    // Portfolio 3 (Mobile Banking) -> React, TypeScript
    if (portfolioRecords[2] && tagReact) relationships.push({ objectId: portfolioRecords[2].id, termId: tagReact.id, taxonomyId: 'tag' });
    if (portfolioRecords[2] && tagTypescript) relationships.push({ objectId: portfolioRecords[2].id, termId: tagTypescript.id, taxonomyId: 'tag' });

    // Portfolio 4 (SaaS Analytics) -> Next.js, PostgreSQL, Docker
    if (portfolioRecords[3] && tagNextjs) relationships.push({ objectId: portfolioRecords[3].id, termId: tagNextjs.id, taxonomyId: 'tag' });
    if (portfolioRecords[3] && tagPostgresql) relationships.push({ objectId: portfolioRecords[3].id, termId: tagPostgresql.id, taxonomyId: 'tag' });
    if (portfolioRecords[3] && tagDocker) relationships.push({ objectId: portfolioRecords[3].id, termId: tagDocker.id, taxonomyId: 'tag' });

    // Batch insert relationships
    const REL_BATCH_SIZE = 50;
    for (let i = 0; i < relationships.length; i += REL_BATCH_SIZE) {
      const batch = relationships.slice(i, i + REL_BATCH_SIZE);
      await db.insert(cmsTermRelationships).values(batch);
    }

    log('  ✅', `${relationships.length} term relationships created.`);

    // ── Summary ─────────────────────────────────────────────────────

    console.log('');
    log('✅', `Content seeded: ${categoryRecords.length} categories, ${tagRecords.length} tags, ${legalPageCount} legal pages, 3 standard pages, ${allBlogPosts.length} blog posts, ${portfolioRecords.length} portfolio items, ${showcaseRecords.length} showcase items.`);
  } finally {
    await sql.end();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function needsContentSeeding(): Promise<boolean> {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);
  try {
    const { cmsPosts } = await import('../server/db/schema/cms');
    const [existing] = await db.select({ count: count() }).from(cmsPosts);
    return (existing?.count ?? 0) === 0;
  } finally {
    await sql.end();
  }
}

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════╗');
  console.log('  ║     SweetCMS Initialization    ║');
  console.log('  ╚═══════════════════════════════╝');
  console.log('');

  // Step 1: Create database
  await ensureDatabase();

  // Step 2: Run migrations
  runMigrations();

  // Step 3: Create superadmin
  await createSuperadmin();

  // Step 4-7: Only prompt for company info and seed if content doesn't exist yet
  const needsSeed = await needsContentSeeding();

  if (needsSeed) {
    // Step 4: Prompt for company info
    const companyInfo = await promptCompanyInfo();

    // Step 5: Seed options
    await seedOptions(companyInfo);

    // Step 6: Seed media
    await seedMedia();

    // Step 7: Seed content
    await seedContent(companyInfo);
  } else {
    log('⏭️', 'Content already exists. Skipping company info prompts, options, media, and content seeding.');
  }

  console.log('');
  log('🚀', 'SweetCMS is ready! Run `bun run dev` to start.');
  console.log('');
}

main().catch((err) => {
  console.error('Init failed:', err);
  process.exit(1);
});
