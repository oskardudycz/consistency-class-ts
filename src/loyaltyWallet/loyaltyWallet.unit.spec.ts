import { DeciderSpecification } from '@event-driven-io/emmett';
import { describe, test } from 'vitest';
import { MemberId } from '../membership';
import { LoyaltyPoints, RedemptionLimit } from './loyaltyPoints';
import {
  decide,
  evolve,
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  type RedemptionCadence,
  WalletNumber,
} from './loyaltyWallet';

describe('LoyaltyWallet', () => {
  const walletNumber = WalletNumber.random();
  const owner = MemberId.random();
  const familyMember = MemberId.random();
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  const given = DeciderSpecification.for({
    decide,
    evolve,
    initialState: LoyaltyWallet.initial,
  });

  const opened: LoyaltyWalletEvent = {
    type: 'LoyaltyWalletOpened',
    data: {
      walletNumber,
      ownerId: owner,
      cadence: 'Weekly',
      maxRedemptionCount: RedemptionLimit.of(5),
      earnedPoints: LoyaltyPoints.ZERO,
      redeemedPoints: LoyaltyPoints.ZERO,
    },
  };

  const earned = (points: number): LoyaltyWalletEvent => ({
    type: 'LoyaltyPointsEarned',
    data: {
      walletNumber,
      ownerId: owner,
      points: LoyaltyPoints.of(points),
      at,
    },
  });

  const redeemed = (
    points: number,
    burned = points,
    byMemberId: MemberId = owner,
  ): LoyaltyWalletEvent => ({
    type: 'LoyaltyPointsRedeemed',
    data: {
      walletNumber,
      ownerId: owner,
      byMemberId,
      points: LoyaltyPoints.of(points),
      burned: LoyaltyPoints.of(burned),
      at,
    },
  });

  const accessGranted = (memberId: MemberId): LoyaltyWalletEvent => ({
    type: 'WalletAccessGranted',
    data: { walletNumber, ownerId: owner, memberId },
  });

  const accessRevoked = (memberId: MemberId): LoyaltyWalletEvent => ({
    type: 'WalletAccessRevoked',
    data: { walletNumber, ownerId: owner, memberId },
  });

  const cadenceSet = (cadence: RedemptionCadence): LoyaltyWalletEvent => ({
    type: 'RedemptionCadenceSet',
    data: { walletNumber, ownerId: owner, cadence },
  });

  const windowReset: LoyaltyWalletEvent = {
    type: 'RedemptionWindowReset',
    data: { walletNumber, ownerId: owner, at },
  };

  const deactivated: LoyaltyWalletEvent = {
    type: 'WalletDeactivated',
    data: { walletNumber, ownerId: owner },
  };

  const closed: LoyaltyWalletEvent = {
    type: 'WalletClosed',
    data: { walletNumber },
  };

  const exhaustRedemptions: LoyaltyWalletEvent[] = [
    redeemed(1),
    redeemed(1),
    redeemed(1),
    redeemed(1),
    redeemed(1),
  ];

  describe('Opening', () => {
    test('Opens a not existing wallet and emits LoyaltyWalletOpened', () =>
      given([])
        .when({
          type: 'OpenLoyaltyWallet',
          data: {
            walletNumber,
            ownerId: owner,
            cadence: 'Weekly',
            maxRedemptionCount: RedemptionLimit.of(5),
          },
        })
        .then([opened]));

    test('Leaves an already active wallet unchanged without events', () =>
      given([opened])
        .when({
          type: 'OpenLoyaltyWallet',
          data: {
            walletNumber,
            ownerId: owner,
            cadence: 'Monthly',
            maxRedemptionCount: RedemptionLimit.of(3),
          },
        })
        .thenNothingHappened());

    test('Leaves a deactivated wallet unchanged', () =>
      given([opened, deactivated])
        .when({
          type: 'OpenLoyaltyWallet',
          data: {
            walletNumber,
            ownerId: owner,
            cadence: 'Weekly',
            maxRedemptionCount: RedemptionLimit.of(5),
          },
        })
        .thenNothingHappened());

    test('Leaves a closed wallet unchanged', () =>
      given([opened, closed])
        .when({
          type: 'OpenLoyaltyWallet',
          data: {
            walletNumber,
            ownerId: owner,
            cadence: 'Weekly',
            maxRedemptionCount: RedemptionLimit.of(5),
          },
        })
        .thenNothingHappened());
  });

  describe('Earning points', () => {
    test('Earns points on an active wallet and emits LoyaltyPointsEarned', () =>
      given([opened])
        .when({
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100), at },
        })
        .then([earned(100)]));

    test('Cant earn points if wallet does not exist', () =>
      given([])
        .when({
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100), at },
        })
        .thenThrows(
          (error: Error) => error.message === "Wallet doesn't exist",
        ));

    test('Cant earn points if wallet is deactivated', () =>
      given([opened, deactivated])
        .when({
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100), at },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant earn points if wallet is closed', () =>
      given([opened, closed])
        .when({
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100), at },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Redeeming points', () => {
    test('Redeems points on an active wallet and emits LoyaltyPointsRedeemed', () =>
      given([opened, earned(100)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .then([redeemed(40)]));

    test('Records both the redeemed and burned amounts when a policy burns fewer points', () =>
      given([opened, earned(100)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(100),
            burned: LoyaltyPoints.of(95),
            at,
          },
        })
        .then([redeemed(100, 95)]));

    test('Burns the policy amount from the balance, not the requested points', () =>
      given([opened, earned(100), redeemed(100, 95)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(10),
            at,
          },
        })
        .thenThrows(
          (error: Error) => error.message === 'Not enough points to redeem',
        ));

    test('Checks the balance against the burned amount, not the requested points', () =>
      given([opened, earned(10)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(100),
            burned: LoyaltyPoints.of(5),
            at,
          },
        })
        .then([redeemed(100, 5)]));

    test('Cant redeem more points than available', () =>
      given([opened, earned(20)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(50),
            at,
          },
        })
        .thenThrows(
          (error: Error) => error.message === 'Not enough points to redeem',
        ));

    test('Cant redeem once the redemption window is exhausted', () =>
      given([opened, earned(100), ...exhaustRedemptions])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(1),
            at,
          },
        })
        .thenThrows(
          (error: Error) => error.message === 'Redemption window exhausted',
        ));

    test('Cant redeem points if wallet does not exist', () =>
      given([])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .thenThrows(
          (error: Error) => error.message === "Wallet doesn't exist",
        ));

    test('Cant redeem points if wallet is deactivated', () =>
      given([opened, deactivated])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant redeem points if wallet is closed', () =>
      given([opened, closed])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Setting redemption cadence', () => {
    test('Changes cadence on an active wallet and emits RedemptionCadenceSet', () =>
      given([opened])
        .when({
          type: 'SetRedemptionCadence',
          data: { walletNumber, cadence: 'Monthly' },
        })
        .then([cadenceSet('Monthly')]));

    test('Cant set cadence if wallet does not exist', () =>
      given([])
        .when({
          type: 'SetRedemptionCadence',
          data: { walletNumber, cadence: 'Monthly' },
        })
        .thenThrows(
          (error: Error) => error.message === "Wallet doesn't exist",
        ));

    test('Cant set cadence if wallet is not active', () =>
      given([opened, deactivated])
        .when({
          type: 'SetRedemptionCadence',
          data: { walletNumber, cadence: 'Monthly' },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant set cadence if wallet is closed', () =>
      given([opened, closed])
        .when({
          type: 'SetRedemptionCadence',
          data: { walletNumber, cadence: 'Monthly' },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Wallet access', () => {
    test('Owner can redeem from the shared balance', () =>
      given([opened, earned(100)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .then([redeemed(40, 40, owner)]));

    test('Grants access to a family member and emits WalletAccessGranted', () =>
      given([opened])
        .when({
          type: 'GrantWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .then([accessGranted(familyMember)]));

    test('Revokes access from a family member and emits WalletAccessRevoked', () =>
      given([opened, accessGranted(familyMember)])
        .when({
          type: 'RevokeWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .then([accessRevoked(familyMember)]));

    test('A granted family member can redeem from the shared balance', () =>
      given([opened, earned(100), accessGranted(familyMember)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: familyMember,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .then([redeemed(40, 40, familyMember)]));

    test('Cant redeem without access', () =>
      given([opened, earned(100)])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: familyMember,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .thenThrows(
          (error: Error) => error.message === 'Not authorized to redeem',
        ));

    test('Cant redeem after access is revoked', () =>
      given([
        opened,
        earned(100),
        accessGranted(familyMember),
        accessRevoked(familyMember),
      ])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: familyMember,
            points: LoyaltyPoints.of(40),
            at,
          },
        })
        .thenThrows(
          (error: Error) => error.message === 'Not authorized to redeem',
        ));

    test('Cant grant access if wallet is not active', () =>
      given([opened, deactivated])
        .when({
          type: 'GrantWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant grant access if wallet is closed', () =>
      given([opened, closed])
        .when({
          type: 'GrantWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));

    test('Cant revoke access if wallet is not active', () =>
      given([opened, deactivated])
        .when({
          type: 'RevokeWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant revoke access if wallet is closed', () =>
      given([opened, closed])
        .when({
          type: 'RevokeWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Resetting the redemption window', () => {
    test('Resets the redemption window and emits RedemptionWindowReset', () =>
      given([opened, earned(100), redeemed(10)])
        .when({ type: 'ResetRedemptionWindow', data: { walletNumber, at } })
        .then([windowReset]));

    test('Restores redemptions after the window is exhausted and reset', () =>
      given([opened, earned(100), ...exhaustRedemptions, windowReset])
        .when({
          type: 'RedeemLoyaltyPoints',
          data: {
            walletNumber,
            memberId: owner,
            points: LoyaltyPoints.of(1),
            at,
          },
        })
        .then([redeemed(1)]));

    test('Cant reset window if wallet is not active', () =>
      given([opened, deactivated])
        .when({ type: 'ResetRedemptionWindow', data: { walletNumber, at } })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant reset window if wallet is closed', () =>
      given([opened, closed])
        .when({ type: 'ResetRedemptionWindow', data: { walletNumber, at } })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Deactivating', () => {
    test('Deactivates an active wallet and emits WalletDeactivated', () =>
      given([opened, earned(100)])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .then([deactivated]));

    test('Leaves an already deactivated wallet unchanged without events', () =>
      given([opened, deactivated])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .thenNothingHappened());

    test('Cant deactivate a wallet that does not exist', () =>
      given([])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .thenThrows(
          (error: Error) => error.message === "Wallet doesn't exist",
        ));

    test('Cant deactivate a closed wallet', () =>
      given([opened, closed])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Closing', () => {
    test('Closes an active wallet and emits WalletClosed', () =>
      given([opened])
        .when({ type: 'CloseWallet', data: { walletNumber } })
        .then([closed]));

    test('Closes a deactivated wallet and emits WalletClosed', () =>
      given([opened, deactivated])
        .when({ type: 'CloseWallet', data: { walletNumber } })
        .then([closed]));

    test('Leaves an already closed wallet unchanged without events', () =>
      given([opened, closed])
        .when({ type: 'CloseWallet', data: { walletNumber } })
        .thenNothingHappened());

    test('Cant close a wallet that does not exist', () =>
      given([])
        .when({ type: 'CloseWallet', data: { walletNumber } })
        .thenThrows(
          (error: Error) => error.message === "Wallet doesn't exist",
        ));
  });
});
