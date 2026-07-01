import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openLoyaltyWalletHandler } from '.';
import { MemberId } from '../membership';
import { activityReportCollection } from './activityReport';
import { LoyaltyPoints, RedemptionLimit } from './loyaltyPoints';
import { WalletNumber } from './loyaltyWallet';
import {
  testLoyaltyWalletStore,
  type TestLoyaltyWalletStore,
} from './loyaltyWalletStore.testStore';
import { monthlySummaryCollection } from './monthlySummary';
import {
  closeRedemptionWindowHandler,
  earnLoyaltyPoints,
  openRedemptionWindowOnProgressed,
  progressWalletOnRedemptionWindowClosed,
  redeemLoyaltyPoints,
  type RedemptionWindowClosed,
} from './redemptionWindow';

describe('Loyalty wallet store', () => {
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  let store: TestLoyaltyWalletStore['store'];
  let windowStore: TestLoyaltyWalletStore['windowStore'];
  let client: TestLoyaltyWalletStore['client'];
  let close: TestLoyaltyWalletStore['close'];

  beforeEach(async () => {
    ({ store, windowStore, client, close } = await testLoyaltyWalletStore());
  });

  afterEach(async () => {
    await close();
  });

  const walletDeps = () => ({
    getLoyaltyWallet: store.getLoyaltyWallet,
    saveLoyaltyWallet: store.saveLoyaltyWallet,
  });

  const windowDeps = () => ({
    currentWindowOf: windowStore.currentWindowOf,
    getRedemptionWindow: windowStore.getRedemptionWindow,
    saveRedemptionWindow: windowStore.saveRedemptionWindow,
  });

  const open = async (ownerId: MemberId): Promise<WalletNumber> => {
    const walletNumber = WalletNumber.random();
    await openLoyaltyWalletHandler(walletDeps(), {
      type: 'OpenLoyaltyWallet',
      data: {
        walletNumber,
        ownerId,
        cadence: 'Monthly',
        maxRedemptionCount: RedemptionLimit.of(5),
      },
    });
    await openRedemptionWindowOnProgressed(windowDeps(), {
      type: 'RedemptionWindowProgressed',
      data: {
        walletNumber,
        windowNumber: 1,
        openingBalance: LoyaltyPoints.ZERO,
        ownerId,
        access: [ownerId],
        maxRedemptionCount: RedemptionLimit.of(5),
      },
    });
    return walletNumber;
  };

  const earn = async (walletNumber: WalletNumber, points: number) => {
    const pointer = await windowStore.currentWindowOf(walletNumber);
    const window = await windowStore.getRedemptionWindow(
      walletNumber,
      pointer!.windowNumber,
    );
    await windowStore.saveRedemptionWindow(
      walletNumber,
      pointer!.windowNumber,
      earnLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(points), at },
        window,
      ),
    );
  };

  const redeem = async (
    walletNumber: WalletNumber,
    memberId: MemberId,
    points: number,
  ) => {
    const pointer = await windowStore.currentWindowOf(walletNumber);
    const window = await windowStore.getRedemptionWindow(
      walletNumber,
      pointer!.windowNumber,
    );
    await windowStore.saveRedemptionWindow(
      walletNumber,
      pointer!.windowNumber,
      redeemLoyaltyPoints(
        {
          walletNumber,
          memberId,
          points: LoyaltyPoints.of(points),
          burned: LoyaltyPoints.of(points),
          at,
        },
        window,
      ),
    );
  };

  const closeWindow = async (walletNumber: WalletNumber, ownerId: MemberId) => {
    await closeRedemptionWindowHandler(windowDeps(), {
      type: 'CloseRedemptionWindow',
      data: { walletNumber, closedAt: at },
    });
    await progressWalletOnRedemptionWindowClosed(walletDeps(), {
      type: 'RedemptionWindowClosed',
      data: { walletNumber, closedAt: at },
    } as RedemptionWindowClosed);

    await openRedemptionWindowOnProgressed(windowDeps(), {
      type: 'RedemptionWindowProgressed',
      data: {
        access: [ownerId],
        ownerId,
        walletNumber,
        maxRedemptionCount: RedemptionLimit.of(5),
        windowNumber: 2,
        openingBalance: LoyaltyPoints.ZERO,
      },
    });
  };

  test('round-trips a wallet by its wallet number', async () => {
    // given
    const walletNumber = await open(MemberId.random());

    // then it can be loaded back by its number
    const loaded = await store.getLoyaltyWallet(walletNumber);
    expect(loaded.status).toBe('Active');
    expect(loaded.walletNumber).toBe(walletNumber);
  });

  describe('projections', () => {
    test('writes the activity report and monthly summary from the window flow', async () => {
      // given an opened wallet earning and redeeming within one window
      const owner = MemberId.random();
      const walletNumber = await open(owner);

      await earn(walletNumber, 100);
      await redeem(walletNumber, owner, 40);
      await closeWindow(walletNumber, owner);

      // then the activity report groups the activity into windows
      const report = await activityReportCollection(client.db()).findOne({
        _id: walletNumber,
      });
      expect(report?.ownerId).toBe(owner);
      expect(report?.closedWindows).toHaveLength(1);
      expect(report?.closedWindows[0].earned).toBe(100);
      expect(report?.closedWindows[0].redeemed).toBe(40);
      expect(report?.closedWindows[0].burned).toBe(40);
      expect(report?.closedWindows[0].redemptionCount).toBe(1);
      expect(report?.currentWindow.windowNumber).toBe(2);
      expect(report?.currentWindow.hadActivity).toBe(false);

      // and the monthly summary aggregates the month's totals
      const summary = await monthlySummaryCollection(client.db()).findOne({
        _id: `${walletNumber}:2026-06`,
      });
      expect(summary?.totalEarned).toBe(100);
      expect(summary?.totalRedeemed).toBe(40);
      expect(summary?.totalBurned).toBe(40);
      expect(summary?.redemptionCount).toBe(1);
      expect(summary?.windowsClosed).toBe(1);
    });
  });
});
