import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../../loyaltyPoints';
import {
  type ActiveLoyaltyWallet,
  type RedemptionWindowProgressed,
  WalletNumber,
} from '../../loyaltyWallet';
import {
  testWalletStore,
  type TestWalletStore,
} from '../../loyaltyWalletStore.testStore';
import { openWalletOnMemberVerified } from '../../walletLifecycle';
import { progressWalletOnRedemptionWindowClosed } from './progressWalletOnRedemptionWindowClosed';

describe('Progressing a wallet when its redemption window closes', () => {
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

  const walletDeps = () => ({
    getLoyaltyWallet: store.getLoyaltyWallet,
    saveLoyaltyWallet: store.saveLoyaltyWallet,
  });

  test('Advances to the next window carrying the closing balance', async () => {
    // given a wallet sitting on window #1
    await openWalletOnMemberVerified(
      { saveLoyaltyWallet: store.saveLoyaltyWallet },
      { type: 'MemberVerified', data: { memberId: OSKAR, tier: 'Gold' } },
    );
    const walletNumber = WalletNumber.forOwner(OSKAR);
    const closingBalance = LoyaltyPoints.of(50);

    // when window #1 closes
    await progressWalletOnRedemptionWindowClosed(walletDeps(), {
      type: 'RedemptionWindowClosed',
      data: {
        walletNumber,
        ownerId: OSKAR,
        windowNumber: 1,
        closingBalance,
        redemptionCount: RedemptionLimit.of(0),
        hadActivity: false,
        closedAt: new Date(),
      },
    });

    // then the wallet moved on to window #2
    const wallet = (await store.getLoyaltyWallet(
      walletNumber,
    )) as ActiveLoyaltyWallet;
    expect(wallet.currentWindowNumber).toBe(2);

    // and the progression is recorded in the wallet's own stream
    await expectEventInStream<RedemptionWindowProgressed>(
      walletNumber,
      'RedemptionWindowProgressed',
      { windowNumber: 2, openingBalance: closingBalance },
    );
  });
});
