import { InMemorySQLiteDatabase } from '@event-driven-io/dumbo/sqlite3';
import {
  type PongoClient,
  type PongoCollection,
  pongoClient,
} from '@event-driven-io/pongo';
import { sqlite3Driver } from '@event-driven-io/pongo/sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../membership';
import { LoyaltyPoints, RedemptionLimit } from './loyaltyPoints';
import {
  type ActiveLoyaltyWallet,
  LoyaltyWallet,
  WalletNumber,
} from './loyaltyWallet';
import {
  loyaltyWalletStore,
  walletCollection,
  type WalletDocument,
} from './loyaltyWalletStore';

describe('Loyalty wallet store', () => {
  let client: PongoClient;
  let wallets: PongoCollection<WalletDocument>;
  let store: ReturnType<typeof loyaltyWalletStore>;

  beforeEach(async () => {
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: InMemorySQLiteDatabase,
    });
    await client.connect();
    wallets = walletCollection(client.db());
    store = loyaltyWalletStore(wallets);
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
    await store.saveLoyaltyWallet(wallet);
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
        { ...first, pointsLimit: first.pointsLimit.earn(LoyaltyPoints.of(30)) },
        {
          ...second,
          pointsLimit: second.pointsLimit.earn(LoyaltyPoints.of(70)),
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
});
