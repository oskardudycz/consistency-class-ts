import { InMemorySQLiteDatabase } from '@event-driven-io/dumbo/sqlite3';
import {
  type PongoClient,
  pongoClient,
  type PongoCollection,
} from '@event-driven-io/pongo';
import { sqlite3Driver } from '@event-driven-io/pongo/sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getMemberTier,
  type Member,
  MemberId,
  memberVerifiedHandler,
  type Tier,
} from '../../membership';
import { grantWalletAccessHandler, revokeWalletAccessHandler } from '../access';
import { activityReportCollection } from '../activityReport';
import { LoyaltyPoints, RedemptionLimit } from '../loyaltyPoints';
import {
  type ActiveLoyaltyWallet,
  earnLoyaltyPoints,
  WalletNumber,
} from '../loyaltyWallet';
import { loyaltyWalletStore } from '../loyaltyWalletStore';
import {
  openLoyaltyWalletHandler,
  openWalletOnMemberVerified,
} from '../openingWallet';
import { redeemLoyaltyPointsHandler } from './redeemLoyaltyPoints';
import { resetRedemptionWindowHandler } from './resetRedemptionWindow';

describe('Redeeming loyalty points', () => {
  const OSKAR = MemberId.random();
  const KUBA = MemberId.random();
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  let client: PongoClient;
  let members: PongoCollection<Member>;
  let store: ReturnType<typeof loyaltyWalletStore>;
  let tierOf: ReturnType<typeof getMemberTier>;

  beforeEach(async () => {
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: InMemorySQLiteDatabase,
    });
    await client.connect();
    const db = client.db();
    members = db.collection<Member>('members');
    store = loyaltyWalletStore(client);
    tierOf = getMemberTier(members);
  });

  afterEach(async () => {
    await client.close();
  });

  const enroll = async (memberId: MemberId, tier: Tier = 'Standard') => {
    const event = {
      type: 'MemberVerified' as const,
      data: { memberId, tier },
    };
    await memberVerifiedHandler({ members }, event);
    await openWalletOnMemberVerified(
      { saveLoyaltyWallet: store.saveLoyaltyWallet },
      event,
    );
  };

  const walletNumberOf = async (memberId: MemberId): Promise<WalletNumber> => {
    const [wallet] = await store.findLoyaltyWalletsByOwners([memberId]);
    expect(wallet?.status).toBe('Active');
    return (wallet as ActiveLoyaltyWallet).walletNumber;
  };

  const earn = async (walletNumber: WalletNumber, points: number) => {
    const wallet = await store.getLoyaltyWallet(walletNumber);

    await store.saveLoyaltyWallet(
      walletNumber,
      earnLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(points), at },
        wallet,
      ),
    );
  };

  const redeem = (
    walletNumber: WalletNumber,
    memberId: MemberId,
    points: number,
  ) =>
    redeemLoyaltyPointsHandler(
      {
        getLoyaltyWallet: store.getLoyaltyWallet,
        saveLoyaltyWallet: store.saveLoyaltyWallet,
        getMemberTier: tierOf,
      },
      {
        type: 'RedeemLoyaltyPoints',
        data: { walletNumber, memberId, points: LoyaltyPoints.of(points), at },
      },
    );

  const grantAccess = (walletNumber: WalletNumber, memberId: MemberId) =>
    grantWalletAccessHandler(
      {
        getLoyaltyWallet: store.getLoyaltyWallet,
        saveLoyaltyWallet: store.saveLoyaltyWallet,
      },
      {
        type: 'GrantWalletAccess',
        data: { walletNumber, memberId },
      },
    );

  const revokeAccess = (walletNumber: WalletNumber, memberId: MemberId) =>
    revokeWalletAccessHandler(
      {
        getLoyaltyWallet: store.getLoyaltyWallet,
        saveLoyaltyWallet: store.saveLoyaltyWallet,
      },
      {
        type: 'RevokeWalletAccess',
        data: { walletNumber, memberId },
      },
    );

  const resetWindow = (walletNumber: WalletNumber) =>
    resetRedemptionWindowHandler(
      {
        getLoyaltyWallet: store.getLoyaltyWallet,
        saveLoyaltyWallet: store.saveLoyaltyWallet,
      },
      {
        type: 'ResetRedemptionWindow',
        data: { walletNumber, at },
      },
    );

  const activeWallet = async (
    walletNumber: WalletNumber,
  ): Promise<ActiveLoyaltyWallet> => {
    const wallet = await store.getLoyaltyWallet(walletNumber);
    expect(wallet.status).toBe('Active');
    return wallet as ActiveLoyaltyWallet;
  };

  test('Redeems points from an active wallet', async () => {
    // given
    await enroll(OSKAR);
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 100);

    // when
    await redeem(walletNumber, OSKAR, 40);

    // then
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(60);
    expect(wallet.pointsLimit.redemptionsLeft).toBe(2);
  });

  test('Higher owner tier burns fewer points than redeemed', async () => {
    // given a Gold owner
    await enroll(OSKAR, 'Gold');
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 100);

    // when
    await redeem(walletNumber, OSKAR, 100);

    // then only the burned amount leaves the balance
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(5);

    // and the activity report keeps both the redeemed and the burned amounts
    const report = await activityReportCollection(client.db()).findOne({
      _id: walletNumber,
    });
    expect(report?.currentWindow.redeemed).toBe(100);
    expect(report?.currentWindow.burned).toBe(95);
  });

  test('Cant redeem more than available', async () => {
    // given
    await enroll(OSKAR);
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 20);

    // when
    await expect(redeem(walletNumber, OSKAR, 50)).rejects.toThrow(
      'Not enough points to redeem',
    );

    // then
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(20);
  });

  test("A granted family member redeems on the owner's tier", async () => {
    // given a Gold owner and a Standard family member
    await enroll(OSKAR, 'Gold');
    // and
    await enroll(KUBA);
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 100);
    // and
    await grantAccess(walletNumber, KUBA);

    // when
    await redeem(walletNumber, KUBA, 100);

    // then the owner's Gold tier drives the burn, not the redeemer's Standard
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(5);
  });

  test('Cant redeem without access', async () => {
    // given
    await enroll(OSKAR);
    // and
    await enroll(KUBA);
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 100);

    // when
    await expect(redeem(walletNumber, KUBA, 40)).rejects.toThrow(
      'Not authorized to redeem',
    );

    // then
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(100);
  });

  test('Cant redeem after access is revoked', async () => {
    // given
    await enroll(OSKAR);
    // and
    await enroll(KUBA);
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 100);
    // and
    await grantAccess(walletNumber, KUBA);
    // and
    await redeem(walletNumber, KUBA, 40);

    // and
    await revokeAccess(walletNumber, KUBA);

    // when
    await expect(redeem(walletNumber, KUBA, 40)).rejects.toThrow(
      'Not authorized to redeem',
    );

    // then
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(60);
  });

  test('Cant redeem more times than the window allows', async () => {
    // given a Standard wallet, the window allows three redemptions
    await enroll(OSKAR);
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 100);
    // and the window is used up
    await redeem(walletNumber, OSKAR, 10);
    await redeem(walletNumber, OSKAR, 10);
    await redeem(walletNumber, OSKAR, 10);

    // when
    await expect(redeem(walletNumber, OSKAR, 10)).rejects.toThrow(
      'Redemption window exhausted',
    );

    // then
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(70);
  });

  test('Can redeem again after the window is reset', async () => {
    // given a Standard wallet
    await enroll(OSKAR);
    // and
    const walletNumber = await walletNumberOf(OSKAR);
    // and
    await earn(walletNumber, 100);
    // and the window is used up
    await redeem(walletNumber, OSKAR, 10);
    await redeem(walletNumber, OSKAR, 10);
    await redeem(walletNumber, OSKAR, 10);

    // when
    await resetWindow(walletNumber);
    // and
    await redeem(walletNumber, OSKAR, 10);

    // then
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(60);
  });

  test('Cant redeem when the owner is missing from the directory', async () => {
    // given an active wallet with no member record behind it
    const walletNumber = WalletNumber.random();
    await openLoyaltyWalletHandler(
      {
        getLoyaltyWallet: store.getLoyaltyWallet,
        saveLoyaltyWallet: store.saveLoyaltyWallet,
      },
      {
        type: 'OpenLoyaltyWallet',
        data: {
          walletNumber,
          ownerId: OSKAR,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
      },
    );
    // and
    await earn(walletNumber, 100);

    // when
    await expect(redeem(walletNumber, OSKAR, 40)).rejects.toThrow(
      'Unknown member',
    );

    // then
    const wallet = await activeWallet(walletNumber);
    expect(wallet.pointsLimit.availablePoints).toBe(100);
  });
});
