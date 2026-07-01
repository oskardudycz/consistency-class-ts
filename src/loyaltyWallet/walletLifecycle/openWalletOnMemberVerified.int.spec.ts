import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../../membership';
import { type ActiveLoyaltyWallet, WalletNumber } from '../loyaltyWallet';
import {
  testWalletStore,
  type TestWalletStore,
} from '../loyaltyWalletStore.testStore';
import { openWalletOnMemberVerified } from './openWalletOnMemberVerified';

describe('Opening a wallet when a member is verified', () => {
  const OSKAR = MemberId.random();

  let store: TestWalletStore['store'];
  let close: TestWalletStore['close'];

  beforeEach(async () => {
    ({ store, close } = await testWalletStore());
  });

  afterEach(async () => {
    await close();
  });

  test('Opens an active wallet', async () => {
    // when
    await openWalletOnMemberVerified(
      { saveLoyaltyWallet: store.saveLoyaltyWallet },
      {
        type: 'MemberVerified',
        data: { memberId: OSKAR, tier: 'Gold' },
      },
    );
    // then an active wallet is opened for the member
    const walletNumber = WalletNumber.forOwner(OSKAR);
    const wallet = (await store.getLoyaltyWallet(
      walletNumber,
    )) as ActiveLoyaltyWallet;
    expect(wallet.status).toBe('Active');
    expect(wallet.ownerId).toBe(OSKAR);
    expect(wallet.cadence).toBe('Monthly');
    expect(wallet.access.has(OSKAR)).toBe(true);
  });
});
