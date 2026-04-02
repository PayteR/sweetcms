import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptions } from '@/server/db/schema';
import { organization } from '@/server/db/schema';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    });
  }
  return stripeClient;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  return stripe;
}

export async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
  const stripe = requireStripe();

  // Check existing subscription record
  const [existing] = await db
    .select({ stripeCustomerId: saasSubscriptions.stripeCustomerId })
    .from(saasSubscriptions)
    .where(eq(saasSubscriptions.organizationId, orgId))
    .limit(1);

  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  // Get org details
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  // Create Stripe customer
  const customer = await stripe.customers.create({
    name: org?.name ?? 'Unknown',
    metadata: { orgId },
  });

  return customer.id;
}

export async function createCheckoutSession(
  orgId: string,
  priceId: string,
  urls: { success: string; cancel: string }
): Promise<string> {
  const stripe = requireStripe();
  const customerId = await getOrCreateStripeCustomer(orgId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: urls.success,
    cancel_url: urls.cancel,
    metadata: { orgId },
  });

  return session.url!;
}

export async function createPortalSession(orgId: string, returnUrl: string): Promise<string> {
  const stripe = requireStripe();
  const customerId = await getOrCreateStripeCustomer(orgId);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

export async function getActiveSubscription(orgId: string) {
  const [sub] = await db
    .select()
    .from(saasSubscriptions)
    .where(eq(saasSubscriptions.organizationId, orgId))
    .limit(1);

  return sub ?? null;
}
