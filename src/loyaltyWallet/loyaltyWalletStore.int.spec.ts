import { InMemorySQLiteDatabase } from '@event-driven-io/dumbo/sqlite3';
import { type PongoClient, pongoClient } from '@event-driven-io/pongo';
import { sqlite3Driver } from '@event-driven-io/pongo/sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../membership';
import { activityReportCollection } from './activityReport';
import { LoyaltyPoints, RedemptionLimit } from './loyaltyPoints';
import {
  type ActiveLoyaltyWallet,
  earnLoyaltyPoints,
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  openLoyaltyWallet,
  redeemLoyaltyPoints,
  resetRedemptionWindow,
  WalletNumber,
} from './loyaltyWallet';
import { loyaltyWalletStore } from './loyaltyWalletStore';
import { monthlySummaryCollection } from './monthlySummary';

describe('Loyalty wallet store', () => {
  let client: PongoClient;
  let store: ReturnType<typeof loyaltyWalletStore>;

  beforeEach(async () => {
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: InMemorySQLiteDatabase,
    });
    await client.connect();
    store = loyaltyWalletStore(client);
  });

  afterEach(async () => {
    await client.close();
  });

  const activeWallet = (ownerId: MemberId): ActiveLoyaltyWallet =>
    LoyaltyWallet.open({
      walletNumber: WalletNumber.random(),
      ownerId,
      cadence: 'Monthly',
      maxRedemptionCount: RedemptionLimit.of(10),
    });

  const enroll = async (ownerId: MemberId): Promise<ActiveLoyaltyWallet> => {
    const wallet = activeWallet(ownerId);
    await store.saveLoyaltyWallet(wallet.walletNumber, []);
    return wallet;
  };

  const ownerOf = (wallet: LoyaltyWallet): MemberId =>
    (wallet as ActiveLoyaltyWallet).ownerId;

  const balanceOf = (wallet: LoyaltyWallet): number =>
    (wallet as ActiveLoyaltyWallet).pointsLimit.availablePoints;

  test('round-trips a wallet by its wallet number', async () => {
    // given
    const wallet = await enroll(MemberId.random());

    // then it can be loaded back by its number
    const loaded = await store.getLoyaltyWallet(wallet.walletNumber);
    expect(loaded.status).toBe('Active');
    expect(loaded.walletNumber).toBe(wallet.walletNumber);
  });

  describe('findLoyaltyWalletsByOwners', () => {
    test('returns a list of the requested owners wallets', async () => {
      // given
      const first = MemberId.random();
      const second = MemberId.random();
      await enroll(first);
      await enroll(second);

      // when
      const found = await store.findLoyaltyWalletsByOwners([first, second]);

      // then
      expect(found).toHaveLength(2);
      expect(found.map(ownerOf)).toContain(first);
      expect(found.map(ownerOf)).toContain(second);
    });

    test('omits owners without a wallet', async () => {
      // given
      const enrolled = MemberId.random();
      const unknown = MemberId.random();
      await enroll(enrolled);

      // when
      const found = await store.findLoyaltyWalletsByOwners([enrolled, unknown]);

      // then
      expect(found).toHaveLength(1);
      expect(ownerOf(found[0])).toBe(enrolled);
    });
  });

  describe('saveLoyaltyWallets', () => {
    test('persists every wallet in the batch in one call', async () => {
      // given two enrolled wallets earning points
      const firstOwner = MemberId.random();
      const secondOwner = MemberId.random();
      const first = await enroll(firstOwner);
      const second = await enroll(secondOwner);

      // when both are credited in a single batch
      await store.saveLoyaltyWallets([
        {
          walletNumber: first.walletNumber,
          events: [],
        },
        {
          walletNumber: second.walletNumber,
          events: [],
        },
      ]);

      // then both wallets reflect their new balance
      const reloaded = await store.findLoyaltyWalletsByOwners([
        firstOwner,
        secondOwner,
      ]);
      const byOwner = new Map(reloaded.map((w) => [ownerOf(w), w]));
      expect(balanceOf(byOwner.get(firstOwner)!)).toBe(30);
      expect(balanceOf(byOwner.get(secondOwner)!)).toBe(70);
    });
  });

  describe('projections', () => {
    const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

    const save = async (
      walletNumber: WalletNumber,
      events: LoyaltyWalletEvent | LoyaltyWalletEvent[],
    ): Promise<void> => store.saveLoyaltyWallet(walletNumber, events);

    test('writes the activity report and monthly summary alongside the wallet', async () => {
      // given an opened wallet earning and redeeming within one window
      const owner = MemberId.random();
      const walletNumber = WalletNumber.random();

      await save(
        walletNumber,
        openLoyaltyWallet(
          {
            walletNumber,
            ownerId: owner,
            cadence: 'Monthly',
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          LoyaltyWallet.initial(),
        ),
      );

      const opened = await store.getLoyaltyWallet(walletNumber);
      await save(
        walletNumber,
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100), at },
          opened,
        ),
      );

      const earned = await store.getLoyaltyWallet(walletNumber);
      await save(
        walletNumber,
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
          earned,
        ),
      );

      const redeemed = await store.getLoyaltyWallet(walletNumber);
      await save(
        walletNumber,
        resetRedemptionWindow({ walletNumber, at }, redeemed),
      );

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
