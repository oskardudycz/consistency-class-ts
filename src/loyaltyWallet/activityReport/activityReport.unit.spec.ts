import { describe, expect, test } from 'vitest';
import { MemberId } from '../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../loyaltyPoints';
import { type LoyaltyWalletEvent, WalletNumber } from '../loyaltyWallet';
import { type ActivityReport, evolve } from './activityReport';

describe('ActivityReport projection', () => {
  const walletNumber = WalletNumber.random();
  const owner = MemberId.random();
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  const opened: LoyaltyWalletEvent = {
    type: 'LoyaltyWalletOpened',
    data: {
      walletNumber,
      ownerId: owner,
      cadence: 'Monthly',
      maxRedemptionCount: RedemptionLimit.of(5),
      earnedPoints: LoyaltyPoints.ZERO,
      redeemedPoints: LoyaltyPoints.ZERO,
    },
  };

  const earned = (points: number): LoyaltyWalletEvent => ({
    type: 'LoyaltyPointsEarned',
    data: {
      walletNumber,
      ownerId: owner,
      points: LoyaltyPoints.of(points),
      at,
    },
  });

  const redeemed = (points: number, burned = points): LoyaltyWalletEvent => ({
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

  const reset: LoyaltyWalletEvent = {
    type: 'RedemptionWindowReset',
    data: { walletNumber, ownerId: owner, at },
  };

  const fold = (events: LoyaltyWalletEvent[]): ActivityReport | null =>
    events.reduce<ActivityReport | null>(
      (document, event) => evolve(document, event),
      null,
    );

  test('opens an empty report in its first window', () => {
    const report = fold([opened]);

    expect(report).not.toBeNull();
    expect(report!.walletNumber).toBe(walletNumber);
    expect(report!.ownerId).toBe(owner);
    expect(report!.currentWindow.windowNumber).toBe(1);
    expect(report!.currentWindow.hadActivity).toBe(false);
    expect(report!.closedWindows).toHaveLength(0);
  });

  test('groups earns and redemptions into the current window', () => {
    const report = fold([opened, earned(100), redeemed(40, 38)]);

    expect(report!.currentWindow.earned).toBe(100);
    expect(report!.currentWindow.redeemed).toBe(40);
    expect(report!.currentWindow.burned).toBe(38);
    expect(report!.currentWindow.redemptionCount).toBe(1);
    expect(report!.currentWindow.hadActivity).toBe(true);
    expect(report!.currentWindow.entries).toEqual([
      { kind: 'Earned', points: 100, at },
      { kind: 'Redeemed', points: 40, at },
    ]);
  });

  test('closes the current window and opens the next on reset', () => {
    const report = fold([
      opened,
      earned(100),
      redeemed(40, 38),
      reset,
      earned(20),
    ]);

    expect(report!.closedWindows).toHaveLength(1);
    expect(report!.closedWindows[0].windowNumber).toBe(1);
    expect(report!.closedWindows[0].earned).toBe(100);
    expect(report!.closedWindows[0].redeemed).toBe(40);
    expect(report!.closedWindows[0].burned).toBe(38);
    expect(report!.currentWindow.windowNumber).toBe(2);
    expect(report!.currentWindow.earned).toBe(20);
    expect(report!.currentWindow.redeemed).toBe(0);
  });

  test('ignores activity before the report is opened', () => {
    const report = fold([earned(100)]);

    expect(report).toBeNull();
  });
});
