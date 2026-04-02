import type { PricingPlan, PricingFaq } from '@/engine/config/pricing';

export type { PricingPlan, PricingFaq } from '@/engine/config/pricing';

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For personal projects and trying things out',
    priceMonthly: '$0',
    priceYearly: '$0',
    features: ['1 team member', '100 MB storage', 'Community support', 'Basic CMS features'],
    cta: 'Get Started',
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams getting started',
    priceMonthly: '$19',
    priceYearly: '$190',
    features: ['5 team members', '1 GB storage', 'API access', 'Email support', 'All CMS features'],
    cta: 'Start Free Trial',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For growing teams that need more',
    priceMonthly: '$49',
    priceYearly: '$490',
    features: [
      '20 team members',
      '10 GB storage',
      'Custom domain',
      'API access',
      'Priority email support',
      'Advanced analytics',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams with advanced needs',
    priceMonthly: '$99',
    priceYearly: '$990',
    features: [
      '100 team members',
      '100 GB storage',
      'Custom domain',
      'API access',
      'Priority support',
      'SLA guarantee',
      'SSO',
    ],
    cta: 'Contact Sales',
  },
];

export const PRICING_FAQ: PricingFaq[] = [
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we prorate the difference.',
  },
  {
    question: 'What happens when my trial ends?',
    answer:
      'After your 14-day trial, you can choose to subscribe to a paid plan or continue with the Free plan with limited features.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'Yes, we offer a 30-day money-back guarantee. Contact support if you are not satisfied.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards (Visa, Mastercard, American Express) through Stripe. We also accept cryptocurrency payments via NOWPayments for yearly plans. Wire transfers are available for Enterprise plans.',
  },
  {
    question: 'Is there a discount for annual billing?',
    answer:
      'Yes! Annual billing saves you roughly 2 months compared to monthly billing.',
  },
];
