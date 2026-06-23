import { describe, expect, test } from 'vitest';
import { LoyaltyPoints } from '../loyaltyPoints';
import { MemberId } from '../../membership';
import { buyerPoints, PointsCalculator } from './pointsCalculator';
import { Money, type PurchaseInformation } from './purchase';

describe('PointsCalculator', () => {
  const buyer = MemberId.random();
  const referrer = MemberId.random();
  const operator = MemberId.random();

  const purchase = (
    overrides: Partial<PurchaseInformation> = {},
  ): PurchaseInformation => ({
    purchaseValue: Money.of(1000),
    buyer,
    tier: 'Standard',
    channel: 'InStore',
    at: new Date('2026-06-23T12:00:00'),
    promotionBonuses: [],
    beneficiaries: [],
    ...overrides,
  });

  describe('buyerPoints', () => {
    test.each<[number, number]>([
      [80, 4], // < 100  -> 0.05
      [200, 14], // < 500  -> 0.07
      [1000, 100], // >= 500 -> 0.10
    ])('applies the rate bracket for a purchase of %i', (value, expected) => {
      expect(buyerPoints(purchase({ purchaseValue: Money.of(value) }))).toBe(
        expected,
      );
    });

    test.each<[PurchaseInformation['tier'], number]>([
      ['Standard', 100],
      ['Silver', 110],
      ['Gold', 125],
      ['Platinum', 150],
    ])('applies the %s tier multiplier', (tier, expected) => {
      expect(buyerPoints(purchase({ tier }))).toBe(expected);
    });

    test.each<[PurchaseInformation['channel'], number]>([
      ['InStore', 100],
      ['MobileApp', 120],
      ['Web', 110],
    ])('applies the %s channel multiplier', (channel, expected) => {
      expect(buyerPoints(purchase({ channel }))).toBe(expected);
    });

    test('applies the evening multiplier between 18:00 and 22:00', () => {
      expect(
        buyerPoints(purchase({ at: new Date('2026-06-23T19:00:00') })),
      ).toBe(150);
      expect(
        buyerPoints(purchase({ at: new Date('2026-06-23T12:00:00') })),
      ).toBe(100);
    });

    test('adds the promotion bonuses', () => {
      expect(
        buyerPoints(
          purchase({
            promotionBonuses: [LoyaltyPoints.of(10), LoyaltyPoints.of(5)],
          }),
        ),
      ).toBe(115);
    });
  });

  describe('calculate', () => {
    test('credits only the buyer when there are no beneficiaries', () => {
      const breakdown = PointsCalculator.calculate(purchase());

      expect(breakdown.components).toEqual([
        { member: buyer, role: 'Buyer', amount: 100 },
      ]);
    });

    test('fans out to one component per recipient, count not predetermined', () => {
      const breakdown = PointsCalculator.calculate(
        purchase({
          beneficiaries: [
            { member: referrer, role: 'Referrer' },
            { member: operator, role: 'Operator' },
          ],
        }),
      );

      expect(breakdown.components).toHaveLength(3);
      expect(breakdown.components).toEqual([
        { member: buyer, role: 'Buyer', amount: 100 },
        { member: referrer, role: 'Referrer', amount: 10 }, // 10% of buyer
        { member: operator, role: 'Operator', amount: 5 }, // 5% of buyer
      ]);
    });

    test('rounds each beneficiary share', () => {
      // buyer earns 14 -> referrer 14 * 0.1 = 1.4 -> 1
      const breakdown = PointsCalculator.calculate(
        purchase({
          purchaseValue: Money.of(200),
          beneficiaries: [{ member: referrer, role: 'Referrer' }],
        }),
      );

      expect(breakdown.components).toEqual([
        { member: buyer, role: 'Buyer', amount: 14 },
        { member: referrer, role: 'Referrer', amount: 1 },
      ]);
    });
  });
});
