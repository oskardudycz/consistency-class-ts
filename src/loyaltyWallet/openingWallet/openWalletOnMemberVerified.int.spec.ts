import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../../membership';
import { type ActiveLoyaltyWallet } from '../loyaltyWallet';
import { loyaltyWalletStore } from '../loyaltyWalletStore';
import { testLoyaltyWalletStore } from '../loyaltyWalletStore.testStore';
import { openWalletOnMemberVerified } from './openWalletOnMemberVerified';

describe('Opening a wallet when a member is verified', () => {
  const OSKAR = MemberId.random();

  let store: ReturnType<typeof loyaltyWalletStore>;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ store, close } = await testLoyaltyWalletStore());
  });

  afterEach(async () => {
    await close();
  });

  test('Opens an active wallet with the window derived from the tier', async () => {
    // when
    await openWalletOnMemberVerified(
      { saveLoyaltyWallet: store.saveLoyaltyWallet },
      {
        type: 'MemberVerified',
        data: { memberId: OSKAR, tier: 'Gold' },
      },
    );

    // then an active wallet is opened for the member, the window from their tier
    const [wallet] = await store.findLoyaltyWalletsByOwners([OSKAR]);
    expect(wallet?.status).toBe('Active');
    const active = wallet as ActiveLoyaltyWallet;
    expect(active.ownerId).toBe(OSKAR);
    expect(active.cadence).toBe('Monthly');
    expect(active.pointsLimit.redemptionsLeft).toBe(10);
    expect(active.access.has(OSKAR)).toBe(true);
  });
});
