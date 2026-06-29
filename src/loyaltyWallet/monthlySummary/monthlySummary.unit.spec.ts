import { describe, expect, test } from 'vitest';
import { MemberId } from '../../membership';
import { LoyaltyPoints } from '../loyaltyPoints';
import {
  type LoyaltyPointsEarned,
  type LoyaltyPointsRedeemed,
  type RedemptionWindowReset,
  WalletNumber,
} from '../loyaltyWallet';
import { evolve, type MonthlySummary } from './monthlySummary';

type MonthlySummaryEvent =
  | LoyaltyPointsEarned
  | LoyaltyPointsRedeemed
  | RedemptionWindowReset;

describe('MonthlySummary projection', () => {
  const walletNumber = WalletNumber.random();
  const owner = MemberId.random();
  const june = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  const earned = (points: number, at: Date): LoyaltyPointsEarned => ({
    type: 'LoyaltyPointsEarned',
    data: {
      walletNumber,
      ownerId: owner,
      points: LoyaltyPoints.of(points),
      at,
    },
  });

  const redeemed = (
    points: number,
    at: Date,
    burned = points,
  ): LoyaltyPointsRedeemed => ({
    type: 'LoyaltyPointsRedeemed',
    data: {
      walletNumber,
      ownerId: owner,
      byMemberId: owner,
      points: LoyaltyPoints.of(points),
      burned: LoyaltyPoints.of(burned),
      at,
    },
  });

  const reset = (at: Date): RedemptionWindowReset => ({
    type: 'RedemptionWindowReset',
    data: { walletNumber, ownerId: owner, at },
  });

  const fold = (events: MonthlySummaryEvent[]): MonthlySummary =>
    events.reduce<MonthlySummary | null>(
      (document, event) => evolve(document, event),
      null,
    )!;

  test('aggregates earns, redemptions and closed windows for the month', () => {
    const summary = fold([
      earned(100, june),
      redeemed(40, june, 38),
      redeemed(10, june),
      reset(june),
    ]);

    expect(summary.month).toBe('2026-06');
    expect(summary._id).toBe(`${walletNumber}:2026-06`);
    expect(summary.ownerId).toBe(owner);
    expect(summary.totalEarned).toBe(100);
    expect(summary.totalRedeemed).toBe(50);
    expect(summary.totalBurned).toBe(48);
    expect(summary.redemptionCount).toBe(2);
    expect(summary.windowsClosed).toBe(1);
  });

  test('initialises the document on a redemption with no prior earn', () => {
    const summary = fold([redeemed(25, june)]);

    expect(summary.ownerId).toBe(owner);
    expect(summary.totalEarned).toBe(0);
    expect(summary.totalRedeemed).toBe(25);
    expect(summary.redemptionCount).toBe(1);
  });
});
