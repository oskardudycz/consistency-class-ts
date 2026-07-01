import { describe, expect, test } from 'vitest';
import { LoyaltyPoints } from '../../loyaltyPoints';
import { BenefitPolicy } from './benefitPolicy';
import { type Tier } from '../../../membership';

describe('BenefitPolicy', () => {
  test.each<[Tier, number, number]>([
    ['Standard', 100, 100],
    ['Silver', 100, 97],
    ['Gold', 100, 95],
    ['Platinum', 100, 90],
  ])('burns the %s rate of the redeemed points', (tier, redeemed, burned) => {
    expect(BenefitPolicy.apply(LoyaltyPoints.of(redeemed), tier)).toBe(burned);
  });

  test('rounds the burned amount', () => {
    // 99 * 0.95 = 94.05 -> 94
    expect(BenefitPolicy.apply(LoyaltyPoints.of(99), 'Gold')).toBe(94);
  });

  test('never burns more than redeemed', () => {
    const tiers: Tier[] = ['Standard', 'Silver', 'Gold', 'Platinum'];
    const redeemed = LoyaltyPoints.of(250);

    for (const tier of tiers) {
      expect(BenefitPolicy.apply(redeemed, tier)).toBeLessThanOrEqual(redeemed);
    }
  });
});
