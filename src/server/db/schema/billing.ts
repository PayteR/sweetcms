import { boolean, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { organization } from './organization';

// ─── saas_subscriptions ──────────────────────────────────────────────────────
// Tracks Stripe subscriptions per organization.

export const saasSubscriptions = pgTable('saas_subscriptions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripePriceId: text('stripe_price_id'),
  planId: varchar('plan_id', { length: 50 }).notNull().default('free'),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  trialEnd: timestamp('trial_end'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── saas_subscription_events ────────────────────────────────────────────────
// Idempotency log for processed Stripe webhook events.

export const saasSubscriptionEvents = pgTable('saas_subscription_events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  stripeEventId: text('stripe_event_id').notNull().unique(),
  type: varchar('type', { length: 100 }).notNull(),
  data: jsonb('data'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
