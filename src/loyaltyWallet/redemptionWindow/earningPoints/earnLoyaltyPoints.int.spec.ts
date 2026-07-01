import { type PongoCollection } from '@event-driven-io/pongo';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getMemberTier,
  type Member,
  MemberId,
  memberVerifiedHandler,
  type Tier,
} from '../../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../../loyaltyPoints';
import { WalletNumber } from '../../loyaltyWallet';
import {
  testRedemptionWindowStore,
  type TestRedemptionWindowStore,
} from '../redemptionWindowStore.testStore';
import {
  closeRedemptionWindowHandler,
  openRedemptionWindowOnProgressed,
} from '../windowLifecycle';
import { availableBalance } from '../redemptionWindow';
import { earnLoyaltyPointsHandler } from './earnLoyaltyPoints';
import { type Channel, Money, type PurchaseRecorded } from './purchase';

describe('Earning loyalty points from a purchase', () => {
  const BUYER = MemberId.random();
  const REFERRER = MemberId.random();
  const OPERATOR = MemberId.random();

  let windowStore: TestRedemptionWindowStore['windowStore'];
  let client: TestRedemptionWindowStore['client'];
  let close: TestRedemptionWindowStore['close'];
  let members: PongoCollection<Member>;
  let tierOf: ReturnType<typeof getMemberTier>;

  beforeEach(async () => {
    ({ windowStore, client, close } = await testRedemptionWindowStore());
    members = client.db().collection<Member>('members');
    tierOf = getMemberTier(members);
  });

  afterEach(async () => {
    await close();
  });

  const windowDeps = () => ({
    currentWindowOf: windowStore.currentWindowOf,
    getRedemptionWindow: windowStore.getRedemptionWindow,
    saveRedemptionWindow: windowStore.saveRedemptionWindow,
  });

  const enroll = async (memberId: MemberId, tier: Tier = 'Standard') => {
    const event = {
      type: 'MemberVerified' as const,
      data: { memberId, tier },
    };
    await memberVerifiedHandler({ members }, event);
    await openRedemptionWindowOnProgressed(windowDeps(), {
      type: 'RedemptionWindowProgressed',
      data: {
        access: [memberId],
        ownerId: memberId,
        windowNumber: 1,
        openingBalance: LoyaltyPoints.ZERO,
        walletNumber: WalletNumber.forOwner(memberId),
        maxRedemptionCount: RedemptionLimit.of(5),
      },
    });
  };

  const earn = (event: PurchaseRecorded) =>
    earnLoyaltyPointsHandler(
      {
        currentWindowsByOwners: windowStore.currentWindowsByOwners,
        getRedemptionWindow: windowStore.getRedemptionWindow,
        saveRedemptionWindows: windowStore.saveRedemptionWindows,
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

  const availableOf = async (
    memberId: MemberId,
  ): Promise<number | undefined> => {
    const [pointer] = await windowStore.currentWindowsByOwners([memberId]);
    if (!pointer) return undefined;
    const window = await windowStore.getRedemptionWindow(
      pointer.walletNumber,
      pointer.windowNumber,
    );
    return window.status === 'Open' ? availableBalance(window) : 0;
  };

  const hasWindow = async (memberId: MemberId): Promise<boolean> =>
    (await windowStore.currentWindowsByOwners([memberId])).length > 0;

  const closeWindowOf = async (memberId: MemberId) => {
    const [current] = await windowStore.currentWindowsByOwners([memberId]);
    await closeRedemptionWindowHandler(windowDeps(), {
      type: 'CloseRedemptionWindow',
      data: { walletNumber: current.walletNumber, closedAt: new Date() },
    });
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
    // given the operator is not enrolled, so has no window
    await enroll(BUYER);
    await enroll(REFERRER);

    // when
    await earn(purchase(BUYER));

    // then the enrolled recipients are still credited
    expect(await availableOf(BUYER)).toBe(100);
    expect(await availableOf(REFERRER)).toBe(10);
    // and the unenrolled operator is simply skipped, no window conjured
    expect(await hasWindow(OPERATOR)).toBe(false);
  });

  test('Skips a beneficiary whose window is closed', async () => {
    // given the referrer's window is closed
    await enroll(BUYER);
    await enroll(REFERRER);
    await enroll(OPERATOR);
    await closeWindowOf(REFERRER);

    // when
    await earn(purchase(BUYER));

    // then the active recipients are still credited
    expect(await availableOf(BUYER)).toBe(100);
    expect(await availableOf(OPERATOR)).toBe(5);
    // and the deactivated referrer is skipped, its balance untouched
    expect(await availableOf(REFERRER)).toBe(0);
  });

  test('Cant earn for an unknown buyer', async () => {
    // given the buyer was never verified
    await enroll(REFERRER);
    await enroll(OPERATOR);

    // when
    await expect(earn(purchase(BUYER))).rejects.toThrow('Unknown member');
  });
});
