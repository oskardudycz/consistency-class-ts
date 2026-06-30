import { describe, expect, test } from 'vitest';
import { MemberId } from '../membership';
import { LoyaltyPoints, RedemptionLimit } from './loyaltyPoints';
import {
  type ActiveLoyaltyWallet,
  type ClosedLoyaltyWallet,
  closeWallet,
  type DeactivatedLoyaltyWallet,
  deactivateWallet,
  decide,
  earnLoyaltyPoints,
  grantWalletAccess,
  LoyaltyWallet,
  openLoyaltyWallet,
  redeemLoyaltyPoints,
  resetRedemptionWindow,
  revokeWalletAccess,
  setRedemptionCadence,
  WalletNumber,
} from './loyaltyWallet';

describe('LoyaltyWallet', () => {
  const walletNumber = WalletNumber.random();
  const owner = MemberId.random();
  const familyMember = MemberId.random();
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  const openWallet = (): ActiveLoyaltyWallet =>
    LoyaltyWallet.open({
      walletNumber,
      ownerId: owner,
      cadence: 'Weekly',
      maxRedemptionCount: RedemptionLimit.of(5),
    });

  const walletWithPoints = (points: number): ActiveLoyaltyWallet =>
    earnLoyaltyPoints(
      { walletNumber, points: LoyaltyPoints.of(points), at },
      openWallet(),
    )[0];

  const deactivated = (): DeactivatedLoyaltyWallet =>
    deactivateWallet(openWallet())[0];

  const closed = (): ClosedLoyaltyWallet => closeWallet(openWallet())[0];

  describe('Opening', () => {
    test('Opens a not existing wallet and emits LoyaltyWalletOpened', () => {
      // given
      const state = LoyaltyWallet.initial();

      // when
      const [newState, ...events] = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        state,
      );

      // then
      assertActive(newState);
      expect(newState.walletNumber).toBe(walletNumber);
      expect(newState.ownerId).toBe(owner);
      expect(newState.cadence).toBe('Weekly');
      expect(newState.pointsLimit.availablePoints).toBe(0);
      expect(newState.pointsLimit.redemptionsLeft).toBe(5);
      expect(newState.access.has(owner)).toBe(true);
      expect(events).toEqual([
        {
          type: 'LoyaltyWalletOpened',
          data: {
            walletNumber,
            ownerId: owner,
            cadence: 'Weekly',
            maxRedemptionCount: RedemptionLimit.of(5),
            earnedPoints: LoyaltyPoints.ZERO,
            redeemedPoints: LoyaltyPoints.ZERO,
          },
        },
      ]);
    });

    test('Leaves an already active wallet unchanged without events', () => {
      // given
      const activeWallet = openWallet();

      // when
      const [newState, ...events] = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Monthly',
          maxRedemptionCount: RedemptionLimit.of(3),
        },
        activeWallet,
      );

      // then
      expect(newState).toBe(activeWallet);
      expect(events).toHaveLength(0);
    });

    test('Leaves a deactivated wallet unchanged', () => {
      // given
      const deactivatedWallet = deactivated();

      // when
      const [newState, ...events] = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        deactivatedWallet,
      );

      // then
      expect(newState).toBe(deactivatedWallet);
      expect(events).toHaveLength(0);
    });

    test('Leaves a closed wallet unchanged', () => {
      // given
      const closedWallet = closed();

      // when
      const [newState, ...events] = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        closedWallet,
      );

      // then
      expect(newState).toBe(closedWallet);
      expect(events).toHaveLength(0);
    });
  });

  describe('Earning points', () => {
    test('Earns points on an active wallet and emits LoyaltyPointsEarned', () => {
      // when
      const [newState, earned] = earnLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(100), at },
        openWallet(),
      );

      // then
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(100);
      expect(earned).toEqual({
        type: 'LoyaltyPointsEarned',
        data: { walletNumber, ownerId: owner, points: 100, at },
      });
    });

    test('Cant earn points if wallet does not exist', () => {
      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100), at },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });

    test('Cant earn points if wallet is deactivated', () => {
      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100), at },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant earn points if wallet is closed', () => {
      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100), at },
          closed(),
        ),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Redeeming points', () => {
    test('Redeems points on an active wallet and emits LoyaltyPointsRedeemed', () => {
      // when
      const [newState, redeemed] = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
        walletWithPoints(100),
      );

      // then
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(60);
      expect(newState.pointsLimit.redemptionsLeft).toBe(4);
      expect(redeemed).toEqual({
        type: 'LoyaltyPointsRedeemed',
        data: {
          walletNumber,
          ownerId: owner,
          byMemberId: owner,
          points: 40,
          burned: 40,
          at,
        },
      });
    });

    test('Burns the policy amount from the balance while recording the redeemed amount', () => {
      // when a benefit burns fewer points than redeemed
      const [newState, redeemed] = redeemLoyaltyPoints(
        {
          walletNumber,
          memberId: owner,
          points: LoyaltyPoints.of(100),
          burned: LoyaltyPoints.of(95),
          at,
        },
        walletWithPoints(100),
      );

      // then only the burned amount leaves the balance
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(5);
      // and the event keeps both numbers
      expect(redeemed.data.points).toBe(100);
      expect(redeemed.data.burned).toBe(95);
    });

    test('Cant redeem more points than available', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(50), at },
          walletWithPoints(20),
        ),
      ).toThrow('Not enough points to redeem');
    });

    test('Cant redeem points if wallet does not exist', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });

    test('Cant redeem points if wallet is deactivated', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant redeem points if wallet is closed', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
          closed(),
        ),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Setting redemption cadence', () => {
    test('Changes cadence on an active wallet and emits RedemptionCadenceSet', () => {
      // when
      const [newState, cadenceSet] = setRedemptionCadence(
        { walletNumber, cadence: 'Monthly' },
        openWallet(),
      );

      // then
      assertActive(newState);
      expect(newState.cadence).toBe('Monthly');
      expect(cadenceSet).toEqual({
        type: 'RedemptionCadenceSet',
        data: { walletNumber, ownerId: owner, cadence: 'Monthly' },
      });
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

  describe('Wallet access', () => {
    test('Owner can redeem from the shared balance', () => {
      const [newState] = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
        walletWithPoints(100),
      );

      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(60);
    });

    test('Grants access to a family member and emits WalletAccessGranted', () => {
      // when
      const [newState, granted] = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        openWallet(),
      );

      // then
      assertActive(newState);
      expect(newState.access.has(familyMember)).toBe(true);
      expect(granted).toEqual({
        type: 'WalletAccessGranted',
        data: { walletNumber, ownerId: owner, memberId: familyMember },
      });
    });

    test('Revokes access from a family member and emits WalletAccessRevoked', () => {
      // given
      const [shared] = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        openWallet(),
      );

      // when
      const [newState, revoked] = revokeWalletAccess(
        { walletNumber, memberId: familyMember },
        shared,
      );

      // then
      assertActive(newState);
      expect(newState.access.has(familyMember)).toBe(false);
      expect(revoked).toEqual({
        type: 'WalletAccessRevoked',
        data: { walletNumber, ownerId: owner, memberId: familyMember },
      });
    });

    test('A granted family member can redeem from the shared balance', () => {
      // given
      const [shared] = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        walletWithPoints(100),
      );

      // when
      const [newState] = redeemLoyaltyPoints(
        {
          walletNumber,
          memberId: familyMember,
          points: LoyaltyPoints.of(40),
          at,
        },
        shared,
      );

      // then
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(60);
    });

    test('Cant redeem without access', () => {
      expect(() =>
        redeemLoyaltyPoints(
          {
            walletNumber,
            memberId: familyMember,
            points: LoyaltyPoints.of(40),
            at,
          },
          walletWithPoints(100),
        ),
      ).toThrow('Not authorized to redeem');
    });

    test('Cant redeem after access is revoked', () => {
      // given
      const [shared] = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        walletWithPoints(100),
      );
      // and
      const [revoked] = revokeWalletAccess(
        { walletNumber, memberId: familyMember },
        shared,
      );

      // then
      expect(() =>
        redeemLoyaltyPoints(
          {
            walletNumber,
            memberId: familyMember,
            points: LoyaltyPoints.of(40),
            at,
          },
          revoked,
        ),
      ).toThrow('Not authorized to redeem');
    });

    test('Cant grant access if wallet is not active', () => {
      expect(() =>
        grantWalletAccess(
          { walletNumber, memberId: familyMember },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant revoke access if wallet is not active', () => {
      expect(() =>
        revokeWalletAccess(
          { walletNumber, memberId: familyMember },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });
  });

  describe('Resetting the redemption window', () => {
    test('Resets the redeem count while keeping the balance and emits RedemptionWindowReset', () => {
      // given
      const [walletAfterRedeem] = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: LoyaltyPoints.of(10), at },
        walletWithPoints(100),
      );
      expect(walletAfterRedeem.pointsLimit.redemptionsLeft).toBe(4);

      // when
      const [newState, reset] = resetRedemptionWindow(
        { walletNumber, at },
        walletAfterRedeem,
      );

      // then
      assertActive(newState);
      expect(newState.pointsLimit.redemptionsLeft).toBe(5);
      expect(newState.pointsLimit.availablePoints).toBe(90);
      expect(reset).toEqual({
        type: 'RedemptionWindowReset',
        data: { walletNumber, ownerId: owner, at },
      });
    });

    test('Cant reset window if wallet is not active', () => {
      expect(() =>
        resetRedemptionWindow({ walletNumber, at }, deactivated()),
      ).toThrow('Wallet is not active');
    });
  });

  describe('Deactivating', () => {
    test('Deactivates an active wallet keeping its data and emits WalletDeactivated', () => {
      // given
      const [walletAfterRedeem] = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: LoyaltyPoints.of(10), at },
        walletWithPoints(100),
      );

      // when
      const [newState, deactivatedEvent] = deactivateWallet(walletAfterRedeem);

      // then
      assertDeactivated(newState);
      expect(newState.walletNumber).toBe(walletNumber);
      expect(newState.cadence).toBe('Weekly');
      expect(newState.pointsLimit.availablePoints).toBe(90);
      expect(deactivatedEvent).toEqual({
        type: 'WalletDeactivated',
        data: { walletNumber, ownerId: owner },
      });
    });

    test('Leaves an already deactivated wallet unchanged without events', () => {
      // given
      const deactivatedWallet = deactivated();

      // when
      const [newState, ...events] = deactivateWallet(deactivatedWallet);

      // then
      expect(newState).toBe(deactivatedWallet);
      expect(events).toHaveLength(0);
    });

    test('Cant deactivate a wallet that does not exist', () => {
      expect(() => deactivateWallet(LoyaltyWallet.initial())).toThrow(
        "Wallet doesn't exist",
      );
    });

    test('Cant deactivate a closed wallet', () => {
      expect(() => deactivateWallet(closed())).toThrow('Wallet is closed');
    });
  });

  describe('Closing', () => {
    test('Closes an active wallet and emits WalletClosed', () => {
      // when
      const [newState, closedEvent] = closeWallet(openWallet());

      // then
      assertClosed(newState);
      expect(closedEvent).toEqual({
        type: 'WalletClosed',
        data: { walletNumber },
      });
    });

    test('Closes a deactivated wallet', () => {
      // when
      const [newState] = closeWallet(deactivated());

      // then
      assertClosed(newState);
    });

    test('Leaves an already closed wallet unchanged without events', () => {
      // given
      const closedWallet = closed();

      // when
      const [newState, ...events] = closeWallet(closedWallet);

      // then
      expect(newState).toBe(closedWallet);
      expect(events).toHaveLength(0);
    });

    test('Cant close a wallet that does not exist', () => {
      expect(() => closeWallet(LoyaltyWallet.initial())).toThrow(
        "Wallet doesn't exist",
      );
    });
  });

  describe('decide', () => {
    test('Routes OpenLoyaltyWallet', () => {
      const [newState] = decide(
        {
          type: 'OpenLoyaltyWallet',
          data: {
            walletNumber,
            ownerId: owner,
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
      const [newState] = decide(
        {
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100), at },
        },
        openWallet(),
      );

      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(100);
    });

    test('Routes RedeemLoyaltyPoints', () => {
      const [newState] = decide(
        {
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(40),
            at,
          },
        },
        walletWithPoints(100),
      );

      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(60);
    });

    test('Routes SetRedemptionCadence', () => {
      const [newState] = decide(
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
      const [walletAfterRedeem] = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: LoyaltyPoints.of(10), at },
        walletWithPoints(100),
      );

      const [newState] = decide(
        { type: 'ResetRedemptionWindow', data: { walletNumber, at } },
        walletAfterRedeem,
      );

      assertActive(newState);
      expect(newState.pointsLimit.redemptionsLeft).toBe(5);
    });

    test('Routes DeactivateWallet', () => {
      const [newState] = decide(
        { type: 'DeactivateWallet', data: { walletNumber } },
        openWallet(),
      );

      assertDeactivated(newState);
    });

    test('Routes CloseWallet', () => {
      const [newState] = decide(
        { type: 'CloseWallet', data: { walletNumber } },
        openWallet(),
      );

      assertClosed(newState);
    });

    test('Routes GrantWalletAccess', () => {
      const [newState] = decide(
        {
          type: 'GrantWalletAccess',
          data: { walletNumber, memberId: familyMember },
        },
        openWallet(),
      );

      assertActive(newState);
      expect(newState.access.has(familyMember)).toBe(true);
    });

    test('Routes RevokeWalletAccess', () => {
      const [shared] = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        openWallet(),
      );

      const [newState] = decide(
        {
          type: 'RevokeWalletAccess',
          data: { walletNumber, memberId: familyMember },
        },
        shared,
      );

      assertActive(newState);
      expect(newState.access.has(familyMember)).toBe(false);
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
