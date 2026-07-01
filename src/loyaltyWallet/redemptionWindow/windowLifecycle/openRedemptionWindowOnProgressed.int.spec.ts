import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../../loyaltyPoints';
import { WalletNumber } from '../../loyaltyWallet';
import {
  testRedemptionWindowStore,
  type TestRedemptionWindowStore,
} from '../redemptionWindowStore.testStore';
import { availableBalance, redemptionsLeft } from '../redemptionWindow';
import { openRedemptionWindowOnProgressed } from './openRedemptionWindowOnProgressed';

describe('Opening a redemption window', () => {
  const OSKAR = MemberId.random();

  let windowStore: TestRedemptionWindowStore['windowStore'];
  let close: TestRedemptionWindowStore['close'];

  beforeEach(async () => {
    ({ windowStore, close } = await testRedemptionWindowStore());
  });

  afterEach(async () => {
    await close();
  });

  const windowDeps = () => ({
    getRedemptionWindow: windowStore.getRedemptionWindow,
    saveRedemptionWindow: windowStore.saveRedemptionWindow,
  });

  test('Opens a window on progressed from wallet', async () => {
    // given
    const walletNumber = WalletNumber.forOwner(OSKAR);

    // when
    await openRedemptionWindowOnProgressed(windowDeps(), {
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

    // then the first redemption window is open with the tier's limit
    const current = await windowStore.currentWindowOf(walletNumber);
    expect(current?.open).toBe(true);
    expect(current?.windowNumber).toBe(1);

    const window = await windowStore.getRedemptionWindow(
      walletNumber,
      current!.windowNumber,
    );
    expect(window.status).toBe('Open');
    if (window.status !== 'Open') return;
    expect(availableBalance(window)).toBe(0);
    expect(redemptionsLeft(window)).toBe(10);
  });
});
