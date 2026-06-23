import { describe, expect, test } from 'vitest';
import { type RedemptionCadence } from '../loyaltyWallet/loyaltyWallet';
import { type Tier, tierProgram } from './tierProgram';

describe('tierProgram', () => {
  test.each<[Tier, number, RedemptionCadence, number]>([
    ['Standard', 1.0, 'Weekly', 3],
    ['Silver', 0.97, 'Weekly', 5],
    ['Gold', 0.95, 'Monthly', 10],
    ['Platinum', 0.9, 'Monthly', 20],
  ])(
    '%s maps to its benefit rate, cadence and redemption limit',
    (tier, benefitRate, cadence, maxRedemptionCount) => {
      const program = tierProgram(tier);

      expect(program.benefitRate).toBe(benefitRate);
      expect(program.cadence).toBe(cadence);
      expect(program.maxRedemptionCount).toBe(maxRedemptionCount);
    },
  );
});
