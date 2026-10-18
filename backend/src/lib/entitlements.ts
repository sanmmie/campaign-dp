export type PlanTier =
  | 'supporter'
  | 'candidate'
  | 'campaign_pro'
  | 'state'
  | 'national';

export interface TierEntitlements {
  plan: PlanTier;
  name: string;
  description: string;
  priceMonthlyNaira: number;
  priceYearlyNaira: number | null;
  generationLimitPerMonth: number;
  storageMb: number;
  teamSeats: number;
  campaignLimit: number;
  features: string[];
  isPaid: boolean;
  isEnterprise: boolean;
}

export const TIER_ENTITLEMENTS: Record<PlanTier, TierEntitlements> = {
  supporter: {
    plan: 'supporter',
    name: 'Supporter',
    description: 'Free tier for individual supporters creating campaign materials.',
    priceMonthlyNaira: 0,
    priceYearlyNaira: null,
    generationLimitPerMonth: 10,
    storageMb: 100,
    teamSeats: 1,
    campaignLimit: 1,
    features: [
      'Up to 10 generations per month',
      '100 MB storage',
      '1 team seat',
      '1 campaign',
      'Community templates',
      'Standard support',
    ],
    isPaid: false,
    isEnterprise: false,
  },
  candidate: {
    plan: 'candidate',
    name: 'Candidate',
    description: 'For individual candidates and small campaign teams.',
    priceMonthlyNaira: 9900,
    priceYearlyNaira: 99000,
    generationLimitPerMonth: 100,
    storageMb: 1024,
    teamSeats: 3,
    campaignLimit: 5,
    features: [
      'Up to 100 generations per month',
      '1 GB storage',
      '3 team seats',
      '5 campaigns',
      'Premium templates',
      'Priority support',
    ],
    isPaid: true,
    isEnterprise: false,
  },
  campaign_pro: {
    plan: 'campaign_pro',
    name: 'Campaign Pro',
    description: 'For organized campaign teams.',
    priceMonthlyNaira: 29900,
    priceYearlyNaira: 299000,
    generationLimitPerMonth: 500,
    storageMb: 5120,
    teamSeats: 10,
    campaignLimit: 20,
    features: [
      'Up to 500 generations per month',
      '5 GB storage',
      '10 team seats',
      '20 campaigns',
      'All templates',
      'Priority support',
      'Analytics dashboard',
    ],
    isPaid: true,
    isEnterprise: false,
  },
  state: {
    plan: 'state',
    name: 'State Campaign',
    description: 'For state-level campaign organizations.',
    priceMonthlyNaira: 149000,
    priceYearlyNaira: 1490000,
    generationLimitPerMonth: 2000,
    storageMb: 20480,
    teamSeats: 50,
    campaignLimit: 100,
    features: [
      'Up to 2,000 generations per month',
      '20 GB storage',
      '50 team seats',
      '100 campaigns',
      'All templates',
      'Dedicated support',
      'Analytics dashboard',
      'Custom branding',
    ],
    isPaid: true,
    isEnterprise: false,
  },
  national: {
    plan: 'national',
    name: 'National / Party',
    description: 'For large political organizations and parties.',
    priceMonthlyNaira: 0,
    priceYearlyNaira: 5000000,
    generationLimitPerMonth: -1, // unlimited
    storageMb: -1, // unlimited
    teamSeats: -1, // unlimited
    campaignLimit: -1, // unlimited
    features: [
      'Unlimited generations',
      'Unlimited storage',
      'Unlimited team seats',
      'Unlimited campaigns',
      'All templates',
      'Dedicated support',
      'Analytics dashboard',
      'Custom branding',
      'White-label options',
      'Enterprise SLA',
    ],
    isPaid: true,
    isEnterprise: true,
  },
};

export function getTierEntitlements(plan: string): TierEntitlements {
  return TIER_ENTITLEMENTS[plan as PlanTier] ?? TIER_ENTITLEMENTS.supporter;
}

export function isLimitUnlimited(value: number): boolean {
  return value <= -1;
}

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
