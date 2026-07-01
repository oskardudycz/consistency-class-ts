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
    },
  };

  const progressed = (
    windowNumber: number,
    openingBalance = 0,
    access: MemberId[] = [owner],
  ): LoyaltyWalletEvent => ({
    type: 'RedemptionWindowProgressed',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      openingBalance: LoyaltyPoints.of(openingBalance),
      maxRedemptionCount: RedemptionLimit.of(5),
      access,
    },
  });

  const cadenceSet = (cadence: RedemptionCadence): LoyaltyWalletEvent => ({
    type: 'RedemptionCadenceSet',
    data: { walletNumber, ownerId: owner, cadence },
  });

  const accessGranted = (memberId: MemberId): LoyaltyWalletEvent => ({
    type: 'WalletAccessGranted',
    data: { walletNumber, memberId },
  });

  const accessRevoked = (memberId: MemberId): LoyaltyWalletEvent => ({
    type: 'WalletAccessRevoked',
    data: { walletNumber, memberId },
  });

  const deactivated: LoyaltyWalletEvent = {
    type: 'WalletDeactivated',
    data: { walletNumber },
  };

  const closed: LoyaltyWalletEvent = {
    type: 'WalletClosed',
    data: { walletNumber },
  };

  const open = {
    type: 'OpenLoyaltyWallet' as const,
    data: {
      walletNumber,
      ownerId: owner,
      cadence: 'Weekly' as RedemptionCadence,
      maxRedemptionCount: RedemptionLimit.of(5),
    },
  };

  describe('Opening', () => {
    test('Opens a not existing wallet and progresses to the first window', () =>
      given([])
        .when(open)
        .then([opened, progressed(1)]));

    test('Leaves an already active wallet unchanged without events', () =>
      given([opened, progressed(1)])
        .when(open)
        .thenNothingHappened());

    test('Leaves a deactivated wallet unchanged', () =>
      given([opened, progressed(1), deactivated])
        .when(open)
        .thenNothingHappened());

    test('Leaves a closed wallet unchanged', () =>
      given([opened, progressed(1), closed])
        .when(open)
        .thenNothingHappened());
  });

  describe('Progressing the redemption window', () => {
    test('Progresses to the next window carrying the closing balance', () =>
      given([opened, progressed(1)])
        .when({
          type: 'OpenNextRedemptionWindow',
          data: {
            walletNumber,
            closedWindowNumber: 1,
            closingBalance: LoyaltyPoints.of(60),
          },
        })
        .then([progressed(2, 60)]));

    test('Ignores a progression for a window that is not the current one', () =>
      given([opened, progressed(1)])
        .when({
          type: 'OpenNextRedemptionWindow',
          data: {
            walletNumber,
            closedWindowNumber: 0,
            closingBalance: LoyaltyPoints.of(60),
          },
        })
        .thenNothingHappened());

    test('Carries the current access to the next window', () =>
      given([opened, progressed(1), accessGranted(familyMember)])
        .when({
          type: 'OpenNextRedemptionWindow',
          data: {
            walletNumber,
            closedWindowNumber: 1,
            closingBalance: LoyaltyPoints.ZERO,
          },
        })
        .then([progressed(2, 0, [owner, familyMember])]));

    test('Does not progress a deactivated wallet', () =>
      given([opened, progressed(1), deactivated])
        .when({
          type: 'OpenNextRedemptionWindow',
          data: {
            walletNumber,
            closedWindowNumber: 1,
            closingBalance: LoyaltyPoints.of(60),
          },
        })
        .thenNothingHappened());

    test('Does not progress a closed wallet', () =>
      given([opened, progressed(1), closed])
        .when({
          type: 'OpenNextRedemptionWindow',
          data: {
            walletNumber,
            closedWindowNumber: 1,
            closingBalance: LoyaltyPoints.of(60),
          },
        })
        .thenNothingHappened());
  });

  describe('Setting redemption cadence', () => {
    test('Changes cadence on an active wallet and emits RedemptionCadenceSet', () =>
      given([opened, progressed(1)])
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
      given([opened, progressed(1), deactivated])
        .when({
          type: 'SetRedemptionCadence',
          data: { walletNumber, cadence: 'Monthly' },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant set cadence if wallet is closed', () =>
      given([opened, progressed(1), closed])
        .when({
          type: 'SetRedemptionCadence',
          data: { walletNumber, cadence: 'Monthly' },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Wallet access', () => {
    test('Grants access to a family member and emits WalletAccessGranted', () =>
      given([opened, progressed(1)])
        .when({
          type: 'GrantWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .then([accessGranted(familyMember)]));

    test('Revokes access from a family member and emits WalletAccessRevoked', () =>
      given([opened, progressed(1), accessGranted(familyMember)])
        .when({
          type: 'RevokeWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .then([accessRevoked(familyMember)]));

    test('Cant grant access if wallet is not active', () =>
      given([opened, progressed(1), deactivated])
        .when({
          type: 'GrantWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant grant access if wallet is closed', () =>
      given([opened, progressed(1), closed])
        .when({
          type: 'GrantWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));

    test('Cant revoke access if wallet is not active', () =>
      given([opened, progressed(1), deactivated])
        .when({
          type: 'RevokeWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows(
          (error: Error) => error.message === 'Wallet is not active',
        ));

    test('Cant revoke access if wallet is closed', () =>
      given([opened, progressed(1), closed])
        .when({
          type: 'RevokeWalletAccess',
          data: { walletNumber, memberId: familyMember },
        })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Deactivating', () => {
    test('Deactivates an active wallet and emits WalletDeactivated', () =>
      given([opened, progressed(1)])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .then([deactivated]));

    test('Leaves an already deactivated wallet unchanged without events', () =>
      given([opened, progressed(1), deactivated])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .thenNothingHappened());

    test('Cant deactivate a wallet that does not exist', () =>
      given([])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .thenThrows(
          (error: Error) => error.message === "Wallet doesn't exist",
        ));

    test('Cant deactivate a closed wallet', () =>
      given([opened, progressed(1), closed])
        .when({ type: 'DeactivateWallet', data: { walletNumber } })
        .thenThrows((error: Error) => error.message === 'Wallet is closed'));
  });

  describe('Closing', () => {
    test('Closes an active wallet and emits WalletClosed', () =>
      given([opened, progressed(1)])
        .when({ type: 'CloseWallet', data: { walletNumber } })
        .then([closed]));

    test('Closes a deactivated wallet and emits WalletClosed', () =>
      given([opened, progressed(1), deactivated])
        .when({ type: 'CloseWallet', data: { walletNumber } })
        .then([closed]));

    test('Leaves an already closed wallet unchanged without events', () =>
      given([opened, progressed(1), closed])
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
