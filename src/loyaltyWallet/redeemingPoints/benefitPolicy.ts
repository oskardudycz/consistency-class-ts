import { LoyaltyPoints } from '../loyaltyPoints';
import { type Tier, tierProgram } from '../../membership';

/**
 * Redeem-side computational policy: a tier may burn fewer points than redeemed
 * (e.g. Gold redeems 100 but only 95 leaves the balance). A pure function applied
 * before the aggregate, which receives the final amount.
 */
export const BenefitPolicy = {
  apply: (redeemed: LoyaltyPoints, tier: Tier): LoyaltyPoints =>
    LoyaltyPoints.of(Math.round(redeemed * tierProgram(tier).benefitRate)),
} as const;
