/**
 * SweetCMS Promote Script
 *
 * Promote a user to superadmin by email:
 *   bun run promote <email>
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: bun run promote <email>');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  try {
    const { user } = await import('../server/db/schema/auth');

    const [found] = await db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!found) {
      console.error(`No user found with email "${email}".`);
      process.exit(1);
    }

    if (found.role === 'superadmin') {
      console.log(`"${found.name}" <${found.email}> is already superadmin.`);
      return;
    }

    await db
      .update(user)
      .set({ role: 'superadmin', updatedAt: new Date() })
      .where(eq(user.id, found.id));

    console.log(`Promoted "${found.name}" <${found.email}> from "${found.role}" to superadmin.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
