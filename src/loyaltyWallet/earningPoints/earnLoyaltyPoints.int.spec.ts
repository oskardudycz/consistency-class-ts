import { type PongoCollection } from '@event-driven-io/pongo';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getMemberTier,
  type Member,
  MemberId,
  memberVerifiedHandler,
  type Tier,
} from '../../membership';
import {
  type ActiveLoyaltyWallet,
  type DeactivatedLoyaltyWallet,
} from '../loyaltyWallet';
import { loyaltyWalletStore } from '../loyaltyWalletStore';
import { testLoyaltyWalletStore } from '../loyaltyWalletStore.testStore';
import { openWalletOnMemberVerified } from '../openingWallet';
import { deactivateWalletHandler } from '../walletLifecycle';
import { earnLoyaltyPointsHandler } from './earnLoyaltyPoints';
import { type Channel, Money, type PurchaseRecorded } from './purchase';

describe('Earning loyalty points from a purchase', () => {
  const BUYER = MemberId.random();
  const REFERRER = MemberId.random();
  const OPERATOR = MemberId.random();

  let members: PongoCollection<Member>;
  let store: ReturnType<typeof loyaltyWalletStore>;
  let tierOf: ReturnType<typeof getMemberTier>;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const test = await testLoyaltyWalletStore();
    store = test.store;
    close = test.close;
    members = test.client.db().collection<Member>('members');
    tierOf = getMemberTier(members);
  });

  afterEach(async () => {
    await close();
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

  const earn = (event: PurchaseRecorded) =>
    earnLoyaltyPointsHandler(
      {
        findLoyaltyWalletsByOwners: store.findLoyaltyWalletsByOwners,
        saveLoyaltyWallets: store.saveLoyaltyWallets,
        getMemberTier: tierOf,
      },
      event,
    );

  const purchase = (
    buyer: MemberId,
    channel: Channel = 'InStore',
  ): PurchaseRecorded => ({
    type: 'PurchaseRecorded',
    data: {
      purchaseValue: Money.of(1000),
      buyer,
      channel,
      at: new Date(2026, 5, 23, 12, 0, 0),
      promotionBonuses: [],
      beneficiaries: [
        { member: REFERRER, role: 'Referrer' },
        { member: OPERATOR, role: 'Operator' },
      ],
    },
  });

  const availableOf = async (memberId: MemberId): Promise<number> => {
    const [wallet] = await store.findLoyaltyWalletsByOwners([memberId]);
    expect(wallet?.status).toBe('Active');
    return (wallet as ActiveLoyaltyWallet).pointsLimit.availablePoints;
  };

  const hasWallet = async (memberId: MemberId): Promise<boolean> => {
    const [wallet] = await store.findLoyaltyWalletsByOwners([memberId]);
    return wallet?.status === 'Active';
  };

  const deactivate = async (memberId: MemberId) => {
    const wallet = (
      await store.findLoyaltyWalletsByOwners([memberId])
    )[0] as ActiveLoyaltyWallet;
    await deactivateWalletHandler(
      {
        getLoyaltyWallet: store.getLoyaltyWallet,
        saveLoyaltyWallet: store.saveLoyaltyWallet,
      },
      { type: 'DeactivateWallet', data: { walletNumber: wallet.walletNumber } },
    );
  };

  test('Distributes points across the buyer and every beneficiary', async () => {
    // given
    await enroll(BUYER);
    await enroll(REFERRER);
    await enroll(OPERATOR);

    // when
    await earn(purchase(BUYER));

    // then a Standard, in-store, daytime purchase of 1000 earns 100 to the buyer
    expect(await availableOf(BUYER)).toBe(100);
    // and each beneficiary earns its own share of the buyer's points
    expect(await availableOf(REFERRER)).toBe(10);
    expect(await availableOf(OPERATOR)).toBe(5);
  });

  test("Applies the buyer's tier to the buyer's share", async () => {
    // given a Gold buyer
    await enroll(BUYER, 'Gold');
    await enroll(REFERRER);
    await enroll(OPERATOR);

    // when
    await earn(purchase(BUYER));

    // then the Gold multiplier lifts the buyer's base to 125
    expect(await availableOf(BUYER)).toBe(125);
  });

  test('Skips a beneficiary outside the loyalty program', async () => {
    // given the operator is not enrolled, so has no wallet
    await enroll(BUYER);
    await enroll(REFERRER);

    // when
    await earn(purchase(BUYER));

    // then the enrolled recipients are still credited
    expect(await availableOf(BUYER)).toBe(100);
    expect(await availableOf(REFERRER)).toBe(10);
    // and the unenrolled operator is simply skipped, no wallet conjured
    expect(await hasWallet(OPERATOR)).toBe(false);
  });

  test('Skips a beneficiary whose wallet is deactivated', async () => {
    // given the referrer's wallet is deactivated
    await enroll(BUYER);
    await enroll(REFERRER);
    await enroll(OPERATOR);
    await deactivate(REFERRER);

    // when
    await earn(purchase(BUYER));

    // then the active recipients are still credited
    expect(await availableOf(BUYER)).toBe(100);
    expect(await availableOf(OPERATOR)).toBe(5);
    // and the deactivated referrer is skipped, its balance untouched
    const referrer = (
      await store.findLoyaltyWalletsByOwners([REFERRER])
    )[0] as DeactivatedLoyaltyWallet;
    expect(referrer.status).toBe('Deactivated');
    expect(referrer.pointsLimit.availablePoints).toBe(0);
  });

  test('Cant earn for an unknown buyer', async () => {
    // given the buyer was never verified
    await enroll(REFERRER);
    await enroll(OPERATOR);

    // when
    await expect(earn(purchase(BUYER))).rejects.toThrow('Unknown member');
  });
});
