import { type PongoCollection } from '@event-driven-io/pongo';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openWalletOnMemberVerified } from '../..';
import {
  getMemberTier,
  type Member,
  MemberId,
  memberVerifiedHandler,
  type Tier,
  tierProgram,
} from '../../../membership';
import {
  grantWalletAccessHandler,
  revokeWalletAccessHandler,
} from '../../access';
import { activityReportCollection } from '../../activityReport';
import { LoyaltyPoints, RedemptionLimit } from '../../loyaltyPoints';
import { type ActiveLoyaltyWallet, WalletNumber } from '../../loyaltyWallet';
import {
  testLoyaltyWalletStore,
  type TestLoyaltyWalletStore,
} from '../../loyaltyWalletStore.testStore';
import { propagateAccessToWindow } from '../access';
import {
  testRedemptionWindowStore,
  type TestRedemptionWindowStore,
} from '../redemptionWindowStore.testStore';
import {
  closeRedemptionWindowHandler,
  progressWalletOnRedemptionWindowClosed,
  openRedemptionWindowOnProgressed,
} from '../windowLifecycle';
import {
  availableBalance,
  earnLoyaltyPoints,
  redemptionsLeft,
  type RedemptionWindowClosed,
} from '../redemptionWindow';
import { redeemLoyaltyPointsHandler } from './redeemLoyaltyPoints';

const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

type WindowStore = TestRedemptionWindowStore['windowStore'];
type TierOf = ReturnType<typeof getMemberTier>;

const windowDepsOf = (windowStore: WindowStore) => ({
  currentWindowOf: windowStore.currentWindowOf,
  getRedemptionWindow: windowStore.getRedemptionWindow,
  saveRedemptionWindow: windowStore.saveRedemptionWindow,
});

const walletNumberOf = async (
  windowStore: WindowStore,
  memberId: MemberId,
): Promise<WalletNumber> => {
  const [current] = await windowStore.currentWindowsByOwners([memberId]);
  expect(current?.open).toBe(true);
  return current.walletNumber;
};

const earn = async (
  windowStore: WindowStore,
  walletNumber: WalletNumber,
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
    earnLoyaltyPoints(
      { walletNumber, points: LoyaltyPoints.of(points), at },
      window,
    ),
  );
};

const redeem = (
  windowStore: WindowStore,
  tierOf: TierOf,
  walletNumber: WalletNumber,
  memberId: MemberId,
  points: number,
) =>
  redeemLoyaltyPointsHandler(
    {
      currentWindowOf: windowStore.currentWindowOf,
      getRedemptionWindow: windowStore.getRedemptionWindow,
      saveRedemptionWindow: windowStore.saveRedemptionWindow,
      getMemberTier: tierOf,
    },
    {
      type: 'RedeemLoyaltyPoints',
      data: { walletNumber, memberId, points: LoyaltyPoints.of(points), at },
    },
  );

const openWindowOf = async (
  windowStore: WindowStore,
  walletNumber: WalletNumber,
) => {
  const pointer = await windowStore.currentWindowOf(walletNumber);
  const window = await windowStore.getRedemptionWindow(
    walletNumber,
    pointer!.windowNumber,
  );
  return window.status === 'Open' ? window : undefined;
};

const availableOf = async (
  windowStore: WindowStore,
  walletNumber: WalletNumber,
): Promise<number | undefined> => {
  const window = await openWindowOf(windowStore, walletNumber);
  return window ? availableBalance(window) : undefined;
};

const redemptionsLeftOf = async (
  windowStore: WindowStore,
  walletNumber: WalletNumber,
): Promise<number | undefined> => {
  const window = await openWindowOf(windowStore, walletNumber);
  return window ? redemptionsLeft(window) : undefined;
};

const verifyMember = (
  members: PongoCollection<Member>,
  memberId: MemberId,
  tier: Tier,
) =>
  memberVerifiedHandler(
    { members },
    { type: 'MemberVerified', data: { memberId, tier } },
  );

const openFirstWindow = (
  windowStore: WindowStore,
  memberId: MemberId,
  tier: Tier,
) =>
  openRedemptionWindowOnProgressed(windowDepsOf(windowStore), {
    type: 'RedemptionWindowProgressed',
    data: {
      access: [memberId],
      openingBalance: LoyaltyPoints.ZERO,
      ownerId: memberId,
      windowNumber: 1,
      walletNumber: WalletNumber.forOwner(memberId),
      maxRedemptionCount: tierProgram(tier).maxRedemptionCount,
    },
  });

describe('Redeeming loyalty points within a window', () => {
  const OSKAR = MemberId.random();
  const KUBA = MemberId.random();

  let windowStore: WindowStore;
  let client: TestRedemptionWindowStore['client'];
  let close: TestRedemptionWindowStore['close'];
  let members: PongoCollection<Member>;
  let tierOf: TierOf;

  beforeEach(async () => {
    ({ windowStore, client, close } = await testRedemptionWindowStore());
    members = client.db().collection<Member>('members');
    tierOf = getMemberTier(members);
  });

  afterEach(async () => {
    await close();
  });

  const enroll = async (memberId: MemberId, tier: Tier = 'Standard') => {
    await verifyMember(members, memberId, tier);
    await openFirstWindow(windowStore, memberId, tier);
  };

  test('Redeems points from an active wallet', async () => {
    // given
    await enroll(OSKAR);
    // and
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 100);

    // when
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 40);

    // then
    expect(await availableOf(windowStore, walletNumber)).toBe(60);
    expect(await redemptionsLeftOf(windowStore, walletNumber)).toBe(2);
  });

  test('Higher owner tier burns fewer points than redeemed', async () => {
    // given a Gold owner
    await enroll(OSKAR, 'Gold');
    // and
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 100);

    // when
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 100);

    // then only the burned amount leaves the balance
    expect(await availableOf(windowStore, walletNumber)).toBe(5);

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
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 20);

    // when
    await expect(
      redeem(windowStore, tierOf, walletNumber, OSKAR, 50),
    ).rejects.toThrow('Not enough points to redeem');

    // then
    expect(await availableOf(windowStore, walletNumber)).toBe(20);
  });

  test('Cant redeem without access', async () => {
    // given
    await enroll(OSKAR);
    // and
    await enroll(KUBA);
    // and
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 100);

    // when
    await expect(
      redeem(windowStore, tierOf, walletNumber, KUBA, 40),
    ).rejects.toThrow('Not authorized to redeem');

    // then
    expect(await availableOf(windowStore, walletNumber)).toBe(100);
  });

  test('Cant redeem more times than the window allows', async () => {
    // given a Standard wallet, the window allows three redemptions
    await enroll(OSKAR);
    // and
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 100);
    // and the window is used up
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 10);
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 10);
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 10);

    // when
    await expect(
      redeem(windowStore, tierOf, walletNumber, OSKAR, 10),
    ).rejects.toThrow('Redemption window exhausted');

    // then
    expect(await availableOf(windowStore, walletNumber)).toBe(70);
  });

  test('Cant redeem when the owner is missing from the directory', async () => {
    // given an active wallet with no member record behind it
    const walletNumber = WalletNumber.random();

    await openRedemptionWindowOnProgressed(windowDepsOf(windowStore), {
      type: 'RedemptionWindowProgressed',
      data: {
        access: [],
        openingBalance: LoyaltyPoints.ZERO,
        ownerId: OSKAR,
        windowNumber: 1,
        walletNumber,
        maxRedemptionCount: RedemptionLimit.of(5),
      },
    });
    // and
    await earn(windowStore, walletNumber, 100);

    // when
    await expect(
      redeem(windowStore, tierOf, walletNumber, OSKAR, 40),
    ).rejects.toThrow('Unknown member');

    // then
    expect(await availableOf(windowStore, walletNumber)).toBe(100);
  });
});

describe('Redeeming across wallet-driven changes', () => {
  const OSKAR = MemberId.random();
  const KUBA = MemberId.random();

  let store: TestLoyaltyWalletStore['store'];
  let windowStore: TestLoyaltyWalletStore['windowStore'];
  let client: TestLoyaltyWalletStore['client'];
  let close: TestLoyaltyWalletStore['close'];
  let members: PongoCollection<Member>;
  let tierOf: TierOf;

  beforeEach(async () => {
    ({ store, windowStore, client, close } = await testLoyaltyWalletStore());
    members = client.db().collection<Member>('members');
    tierOf = getMemberTier(members);
  });

  afterEach(async () => {
    await close();
  });

  const walletDeps = () => ({
    getLoyaltyWallet: store.getLoyaltyWallet,
    saveLoyaltyWallet: store.saveLoyaltyWallet,
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
    await openFirstWindow(windowStore, memberId, tier);
  };

  const grantAccess = async (
    walletNumber: WalletNumber,
    memberId: MemberId,
  ) => {
    await grantWalletAccessHandler(walletDeps(), {
      type: 'GrantWalletAccess',
      data: { walletNumber, memberId },
    });
    await propagateAccessToWindow(windowDepsOf(windowStore), {
      type: 'WalletAccessGranted',
      data: { walletNumber, memberId },
    });
  };

  const revokeAccess = async (
    walletNumber: WalletNumber,
    memberId: MemberId,
  ) => {
    await revokeWalletAccessHandler(walletDeps(), {
      type: 'RevokeWalletAccess',
      data: { walletNumber, memberId },
    });
    await propagateAccessToWindow(windowDepsOf(windowStore), {
      type: 'WalletAccessRevoked',
      data: { walletNumber, memberId },
    });
  };

  const closeWindow = async (walletNumber: WalletNumber) => {
    const pointer = await windowStore.currentWindowOf(walletNumber);
    const window = await windowStore.getRedemptionWindow(
      walletNumber,
      pointer!.windowNumber,
    );
    if (window.status !== 'Open') return;

    const closingBalance = availableBalance(window);

    await closeRedemptionWindowHandler(windowDepsOf(windowStore), {
      type: 'CloseRedemptionWindow',
      data: { walletNumber, closedAt: at },
    });
    await progressWalletOnRedemptionWindowClosed(walletDeps(), {
      type: 'RedemptionWindowClosed',
      data: {
        walletNumber,
        ownerId: window.ownerId,
        windowNumber: window.windowNumber,
        closingBalance,
        closedAt: at,
      },
    } as RedemptionWindowClosed);

    const wallet = (await store.getLoyaltyWallet(
      walletNumber,
    )) as ActiveLoyaltyWallet;
    await openRedemptionWindowOnProgressed(windowDepsOf(windowStore), {
      type: 'RedemptionWindowProgressed',
      data: {
        walletNumber,
        ownerId: wallet.ownerId,
        windowNumber: wallet.currentWindowNumber,
        openingBalance: closingBalance,
        maxRedemptionCount: wallet.maxRedemptionCount,
        access: [...wallet.access.members],
      },
    });
  };

  test("A granted family member redeems on the owner's tier", async () => {
    // given a Gold owner and a Standard family member
    await enroll(OSKAR, 'Gold');
    // and
    await enroll(KUBA);
    // and
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 100);
    // and
    await grantAccess(walletNumber, KUBA);

    // when
    await redeem(windowStore, tierOf, walletNumber, KUBA, 100);

    // then the owner's Gold tier drives the burn, not the redeemer's Standard
    expect(await availableOf(windowStore, walletNumber)).toBe(5);
  });

  test('Cant redeem after access is revoked', async () => {
    // given
    await enroll(OSKAR);
    // and
    await enroll(KUBA);
    // and
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 100);
    // and
    await grantAccess(walletNumber, KUBA);
    // and
    await redeem(windowStore, tierOf, walletNumber, KUBA, 40);

    // and
    await revokeAccess(walletNumber, KUBA);

    // when
    await expect(
      redeem(windowStore, tierOf, walletNumber, KUBA, 40),
    ).rejects.toThrow('Not authorized to redeem');

    // then
    expect(await availableOf(windowStore, walletNumber)).toBe(60);
  });

  test('Can redeem again after the window rolls over', async () => {
    // given a Standard wallet
    await enroll(OSKAR);
    // and
    const walletNumber = await walletNumberOf(windowStore, OSKAR);
    // and
    await earn(windowStore, walletNumber, 100);
    // and the window is used up
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 10);
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 10);
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 10);

    // when the window closes and the next one opens carrying the balance
    await closeWindow(walletNumber);
    // and
    await redeem(windowStore, tierOf, walletNumber, OSKAR, 10);

    // then
    expect(await availableOf(windowStore, walletNumber)).toBe(60);
  });
});
