import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../../loyaltyPoints';
import { WalletNumber } from '../../loyaltyWallet';
import {
  type RedemptionWindowClosed,
  redemptionWindowStream,
} from '../redemptionWindow';
import {
  testRedemptionWindowStore,
  type TestRedemptionWindowStore,
} from '../redemptionWindowStore.testStore';
import { closeRedemptionWindowOnWalletDeactivated } from './closeRedemptionWindowOnWalletDeactivated';
import { openRedemptionWindowOnProgressed } from './openRedemptionWindowOnProgressed';

describe('Closing a redemption window when its wallet is deactivated', () => {
  const OSKAR = MemberId.random();

  let expectEventInStream: TestRedemptionWindowStore['expectEventInStream'];
  let windowStore: TestRedemptionWindowStore['windowStore'];
  let close: TestRedemptionWindowStore['close'];

  beforeEach(async () => {
    ({ expectEventInStream, windowStore, close } =
      await testRedemptionWindowStore());
  });

  afterEach(async () => {
    await close();
  });

  const windowDeps = () => ({
    currentWindowOf: windowStore.currentWindowOf,
    getRedemptionWindow: windowStore.getRedemptionWindow,
    saveRedemptionWindow: windowStore.saveRedemptionWindow,
  });

  const openWindow = (walletNumber: WalletNumber) =>
    openRedemptionWindowOnProgressed(windowDeps(), {
      type: 'RedemptionWindowProgressed',
      data: {
        walletNumber,
        ownerId: OSKAR,
        windowNumber: 1,
        openingBalance: LoyaltyPoints.ZERO,
        maxRedemptionCount: RedemptionLimit.of(10),
        access: [OSKAR],
      },
    });

  test('Closes the current window and appends RedemptionWindowClosed', async () => {
    // given an open window
    const walletNumber = WalletNumber.forOwner(OSKAR);
    await openWindow(walletNumber);

    // when the wallet is deactivated
    await closeRedemptionWindowOnWalletDeactivated(windowDeps(), {
      type: 'WalletDeactivated',
      data: { walletNumber },
    });

    // then the current window is closed
    const current = await windowStore.currentWindowOf(walletNumber);
    expect(current?.open).toBe(false);

    const window = await windowStore.getRedemptionWindow(walletNumber, 1);
    expect(window.status).toBe('Closed');

    // and the close is recorded in the window's own stream
    await expectEventInStream<RedemptionWindowClosed>(
      redemptionWindowStream(walletNumber, 1),
      'RedemptionWindowClosed',
      { walletNumber, windowNumber: 1 },
    );
  });

  test('Does nothing when the wallet has no current window', async () => {
    // given no window for the wallet
    const walletNumber = WalletNumber.forOwner(MemberId.random());

    // when the wallet is deactivated
    await closeRedemptionWindowOnWalletDeactivated(windowDeps(), {
      type: 'WalletDeactivated',
      data: { walletNumber },
    });

    // then no window is tracked for it
    const current = await windowStore.currentWindowOf(walletNumber);
    expect(current).toBeNull();
  });
});
