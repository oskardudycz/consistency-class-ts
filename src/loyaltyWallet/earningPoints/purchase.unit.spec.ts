import { describe, expect, test } from 'vitest';
import { LoyaltyPoints } from '../loyaltyPoints';
import { MemberId } from '../../membership';
import { Money, type PurchaseRecorded, purchaseInformation } from './purchase';

describe('purchaseInformation', () => {
  const recorded: PurchaseRecorded = {
    type: 'PurchaseRecorded',
    data: {
      purchaseValue: Money.of(1000),
      buyer: MemberId.random(),
      channel: 'MobileApp',
      at: new Date('2026-06-23T19:00:00'),
      promotionBonuses: [LoyaltyPoints.of(10)],
      beneficiaries: [{ member: MemberId.random(), role: 'Referrer' }],
    },
  };

  test('carries every recorded field through and attaches the tier', () => {
    const info = purchaseInformation(recorded, 'Gold');

    expect(info.purchaseValue).toBe(recorded.data.purchaseValue);
    expect(info.buyer).toBe(recorded.data.buyer);
    expect(info.channel).toBe(recorded.data.channel);
    expect(info.at).toBe(recorded.data.at);
    expect(info.promotionBonuses).toEqual(recorded.data.promotionBonuses);
    expect(info.beneficiaries).toEqual(recorded.data.beneficiaries);
    expect(info.tier).toBe('Gold');
  });
});
