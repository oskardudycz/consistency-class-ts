import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../../membership';
import { type WalletDeactivated, WalletNumber } from '../loyaltyWallet';
import {
  testWalletStore,
  type TestWalletStore,
} from '../loyaltyWalletStore.testStore';
import { deactivateWalletHandler } from './deactivateWallet';
import { openWalletOnMemberVerified } from './openWalletOnMemberVerified';

describe('Deactivating a wallet', () => {
  const OSKAR = MemberId.random();

  let expectEventInStream: TestWalletStore['expectEventInStream'];
  let store: TestWalletStore['store'];
  let close: TestWalletStore['close'];

  beforeEach(async () => {
    ({ expectEventInStream, store, close } = await testWalletStore());
  });

  afterEach(async () => {
    await close();
  });

  test('Marks the wallet deactivated and appends WalletDeactivated', async () => {
    // given an active wallet
    await openWalletOnMemberVerified(
      { saveLoyaltyWallet: store.saveLoyaltyWallet },
      { type: 'MemberVerified', data: { memberId: OSKAR, tier: 'Gold' } },
    );
    const walletNumber = WalletNumber.forOwner(OSKAR);

    // when it is deactivated
    await deactivateWalletHandler(
      {
        getLoyaltyWallet: store.getLoyaltyWallet,
        saveLoyaltyWallet: store.saveLoyaltyWallet,
      },
      { type: 'DeactivateWallet', data: { walletNumber } },
    );

    // then the wallet is deactivated
    const wallet = await store.getLoyaltyWallet(walletNumber);
    expect(wallet.status).toBe('Deactivated');

    // and the deactivation is recorded in the wallet's own stream
    await expectEventInStream<WalletDeactivated>(
      walletNumber,
      'WalletDeactivated',
      { walletNumber },
    );
  });
});
