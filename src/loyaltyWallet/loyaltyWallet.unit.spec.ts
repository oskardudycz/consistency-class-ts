import { describe, expect, test } from 'vitest';
import { LoyaltyPoints, RedemptionLimit } from './loyaltyPoints';
import {
  type ActiveLoyaltyWallet,
  type ClosedLoyaltyWallet,
  closeWallet,
  type DeactivatedLoyaltyWallet,
  deactivateWallet,
  decide,
  earnLoyaltyPoints,
  LoyaltyWallet,
  openLoyaltyWallet,
  redeemLoyaltyPoints,
  resetRedemptionWindow,
  setRedemptionCadence,
  WalletNumber,
} from './loyaltyWallet';

describe('LoyaltyWallet', () => {
  const walletNumber = WalletNumber.random();

  const openWallet = (): ActiveLoyaltyWallet =>
    LoyaltyWallet.open({
      walletNumber,
      cadence: 'Weekly',
      maxRedemptionCount: RedemptionLimit.of(5),
    });

  const walletWithPoints = (points: number): ActiveLoyaltyWallet =>
    earnLoyaltyPoints(
      { walletNumber, points: LoyaltyPoints.of(points) },
      openWallet(),
    );

  describe('Opening', () => {
    test('Opens a not existing wallet', () => {
      // given
      const state = LoyaltyWallet.initial();

      // when
      const newState = openLoyaltyWallet(
        {
          walletNumber,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        state,
      );

      // then
      assertActive(newState);
      expect(newState.walletNumber).toBe(walletNumber);
      expect(newState.cadence).toBe('Weekly');
      expect(newState.pointsLimit.availablePoints).toBe(0);
      expect(newState.pointsLimit.redemptionsLeft).toBe(5);
    });

    test('Leaves an already active wallet unchanged', () => {
      // given
      const activeWallet = openWallet();

      // when
      const newState = openLoyaltyWallet(
        {
          walletNumber,
          cadence: 'Monthly',
          maxRedemptionCount: RedemptionLimit.of(3),
        },
        activeWallet,
      );

      // then
      expect(newState).toBe(activeWallet);
    });

    test('Leaves a deactivated wallet unchanged', () => {
      // given
      const deactivatedWallet = deactivateWallet(openWallet());

      // when
      const newState = openLoyaltyWallet(
        {
          walletNumber,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        deactivatedWallet,
      );

      // then
      expect(newState).toBe(deactivatedWallet);
    });

    test('Leaves a closed wallet unchanged', () => {
      // given
      const closedWallet = closeWallet(openWallet());

      // when
      const newState = openLoyaltyWallet(
        {
          walletNumber,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        closedWallet,
      );

      // then
      expect(newState).toBe(closedWallet);
    });
  });

  describe('Earning points', () => {
    test('Earns points on an active wallet', () => {
      // when
      const newState = earnLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(100) },
        openWallet(),
      );

      // then
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(100);
    });

    test('Cant earn points if wallet does not exist', () => {
      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100) },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });

    test('Cant earn points if wallet is deactivated', () => {
      const deactivatedWallet = deactivateWallet(openWallet());

      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100) },
          deactivatedWallet,
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant earn points if wallet is closed', () => {
      const closedWallet = closeWallet(openWallet());

      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100) },
          closedWallet,
        ),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Redeeming points', () => {
    test('Redeems points on an active wallet', () => {
      // when
      const newState = redeemLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(40) },
        walletWithPoints(100),
      );

      // then
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(60);
      expect(newState.pointsLimit.redemptionsLeft).toBe(4);
    });

    test('Cant redeem more points than available', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(50) },
          walletWithPoints(20),
        ),
      ).toThrow('Not enough points to redeem');
    });

    test('Cant redeem points if wallet does not exist', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(40) },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });

    test('Cant redeem points if wallet is deactivated', () => {
      const deactivatedWallet = deactivateWallet(walletWithPoints(100));

      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(40) },
          deactivatedWallet,
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant redeem points if wallet is closed', () => {
      const closedWallet = closeWallet(walletWithPoints(100));

      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(40) },
          closedWallet,
        ),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Setting redemption cadence', () => {
    test('Changes cadence on an active wallet', () => {
      // when
      const newState = setRedemptionCadence(
        { walletNumber, cadence: 'Monthly' },
        openWallet(),
      );

      // then
      assertActive(newState);
      expect(newState.cadence).toBe('Monthly');
    });

    test('Cant set cadence if wallet does not exist', () => {
      expect(() =>
        setRedemptionCadence(
          { walletNumber, cadence: 'Monthly' },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });
  });

  describe('Resetting the redemption window', () => {
    test('Resets the redeem count while keeping the balance', () => {
      // given
      const walletAfterRedeem = redeemLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(10) },
        walletWithPoints(100),
      );
      expect(walletAfterRedeem.pointsLimit.redemptionsLeft).toBe(4);

      // when
      const newState = resetRedemptionWindow(walletAfterRedeem);

      // then
      assertActive(newState);
      expect(newState.pointsLimit.redemptionsLeft).toBe(5);
      expect(newState.pointsLimit.availablePoints).toBe(90);
    });

    test('Cant reset window if wallet is not active', () => {
      const deactivatedWallet = deactivateWallet(openWallet());

      expect(() => resetRedemptionWindow(deactivatedWallet)).toThrow(
        'Wallet is not active',
      );
    });
  });

  describe('Deactivating', () => {
    test('Deactivates an active wallet keeping its data', () => {
      // given
      const walletAfterRedeem = redeemLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(10) },
        walletWithPoints(100),
      );

      // when
      const newState = deactivateWallet(walletAfterRedeem);

      // then
      assertDeactivated(newState);
      expect(newState.walletNumber).toBe(walletNumber);
      expect(newState.cadence).toBe('Weekly');
      expect(newState.pointsLimit.availablePoints).toBe(90);
    });

    test('Leaves an already deactivated wallet unchanged', () => {
      // given
      const deactivatedWallet = deactivateWallet(openWallet());

      // when
      const newState = deactivateWallet(deactivatedWallet);

      // then
      expect(newState).toBe(deactivatedWallet);
    });

    test('Cant deactivate a wallet that does not exist', () => {
      expect(() => deactivateWallet(LoyaltyWallet.initial())).toThrow(
        "Wallet doesn't exist",
      );
    });

    test('Cant deactivate a closed wallet', () => {
      const closedWallet = closeWallet(openWallet());

      expect(() => deactivateWallet(closedWallet)).toThrow('Wallet is closed');
    });
  });

  describe('Closing', () => {
    test('Closes an active wallet', () => {
      // when
      const newState = closeWallet(openWallet());

      // then
      assertClosed(newState);
    });

    test('Closes a deactivated wallet', () => {
      // given
      const deactivatedWallet = deactivateWallet(openWallet());

      // when
      const newState = closeWallet(deactivatedWallet);

      // then
      assertClosed(newState);
    });

    test('Leaves an already closed wallet unchanged', () => {
      // given
      const closedWallet = closeWallet(openWallet());

      // when
      const newState = closeWallet(closedWallet);

      // then
      expect(newState).toBe(closedWallet);
    });

    test('Cant close a wallet that does not exist', () => {
      expect(() => closeWallet(LoyaltyWallet.initial())).toThrow(
        "Wallet doesn't exist",
      );
    });
  });

  describe('decide', () => {
    test('Routes OpenLoyaltyWallet', () => {
      const newState = decide(
        {
          type: 'OpenLoyaltyWallet',
          data: {
            walletNumber,
            cadence: 'Weekly',
            maxRedemptionCount: RedemptionLimit.of(5),
          },
        },
        LoyaltyWallet.initial(),
      );

      assertActive(newState);
      expect(newState.walletNumber).toBe(walletNumber);
    });

    test('Routes EarnLoyaltyPoints', () => {
      const newState = decide(
        {
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100) },
        },
        openWallet(),
      );

      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(100);
    });

    test('Routes RedeemLoyaltyPoints', () => {
      const newState = decide(
        {
          type: 'RedeemLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(40) },
        },
        walletWithPoints(100),
      );

      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(60);
    });

    test('Routes SetRedemptionCadence', () => {
      const newState = decide(
        {
          type: 'SetRedemptionCadence',
          data: { walletNumber, cadence: 'Monthly' },
        },
        openWallet(),
      );

      assertActive(newState);
      expect(newState.cadence).toBe('Monthly');
    });

    test('Routes ResetRedemptionWindow', () => {
      const walletAfterRedeem = redeemLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(10) },
        walletWithPoints(100),
      );

      const newState = decide(
        { type: 'ResetRedemptionWindow', data: { walletNumber } },
        walletAfterRedeem,
      );

      assertActive(newState);
      expect(newState.pointsLimit.redemptionsLeft).toBe(5);
    });

    test('Routes DeactivateWallet', () => {
      const newState = decide(
        { type: 'DeactivateWallet', data: { walletNumber } },
        openWallet(),
      );

      assertDeactivated(newState);
    });

    test('Routes CloseWallet', () => {
      const newState = decide(
        { type: 'CloseWallet', data: { walletNumber } },
        openWallet(),
      );

      assertClosed(newState);
    });
  });
});

function assertActive(
  wallet: LoyaltyWallet,
): asserts wallet is ActiveLoyaltyWallet {
  expect(wallet.status).toBe('Active');
}

function assertDeactivated(
  wallet: LoyaltyWallet,
): asserts wallet is DeactivatedLoyaltyWallet {
  expect(wallet.status).toBe('Deactivated');
}

function assertClosed(
  wallet: LoyaltyWallet,
): asserts wallet is ClosedLoyaltyWallet {
  expect(wallet.status).toBe('Closed');
}
