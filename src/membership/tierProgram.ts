import { RedemptionLimit } from '../loyaltyWallet/loyaltyPoints';
import { type RedemptionCadence } from '../loyaltyWallet/loyaltyWallet';

export type Tier = 'Standard' | 'Silver' | 'Gold' | 'Platinum';

export type TierProgram = Readonly<{
  benefitRate: number;
  cadence: RedemptionCadence;
  maxRedemptionCount: RedemptionLimit;
}>;

const PROGRAMS = {
  Standard: {
    benefitRate: 1.0,
    cadence: 'Weekly',
    maxRedemptionCount: RedemptionLimit.of(3),
  },
  Silver: {
    benefitRate: 0.97,
    cadence: 'Weekly',
    maxRedemptionCount: RedemptionLimit.of(5),
  },
  Gold: {
    benefitRate: 0.95,
    cadence: 'Monthly',
    maxRedemptionCount: RedemptionLimit.of(10),
  },
  Platinum: {
    benefitRate: 0.9,
    cadence: 'Monthly',
    maxRedemptionCount: RedemptionLimit.of(20),
  },
} as const satisfies Record<Tier, TierProgram>;

export const tierProgram = (tier: Tier): TierProgram => PROGRAMS[tier];
