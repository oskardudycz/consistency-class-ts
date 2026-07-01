import { DeciderSpecification } from '@event-driven-io/emmett';
import { describe, test } from 'vitest';
import { MemberId } from '../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../loyaltyPoints';
import { WalletNumber } from '../loyaltyWallet';
import {
  decide,
  evolve,
  RedemptionWindow,
  type RedemptionWindowEvent,
} from './redemptionWindow';

describe('RedemptionWindow', () => {
  const walletNumber = WalletNumber.random();
  const owner = MemberId.random();
  const familyMember = MemberId.random();
  const windowNumber = 1;
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  const given = DeciderSpecification.for({
    decide,
    evolve,
    initialState: RedemptionWindow.initial,
  });

  const opened = (openingBalance = 0): RedemptionWindowEvent => ({
    type: 'RedemptionWindowOpened',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      openingBalance: LoyaltyPoints.of(openingBalance),
      maxRedemptionCount: RedemptionLimit.of(3),
      access: [owner],
    },
  });

  const earned = (points: number): RedemptionWindowEvent => ({
    type: 'LoyaltyPointsEarned',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      points: LoyaltyPoints.of(points),
      at,
    },
  });

  const redeemed = (
    points: number,
    burned = points,
    byMemberId: MemberId = owner,
  ): RedemptionWindowEvent => ({
    type: 'LoyaltyPointsRedeemed',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      byMemberId,
      points: LoyaltyPoints.of(points),
      burned: LoyaltyPoints.of(burned),
      at,
    },
  });

  const accessGranted = (memberId: MemberId): RedemptionWindowEvent => ({
    type: 'WindowAccessGranted',
    data: { walletNumber, ownerId: owner, windowNumber, memberId },
  });

  const accessRevoked = (memberId: MemberId): RedemptionWindowEvent => ({
    type: 'WindowAccessRevoked',
    data: { walletNumber, ownerId: owner, windowNumber, memberId },
  });

  const closed = (
    closingBalance = 0,
    redemptionCount = 0,
    hadActivity = false,
  ): RedemptionWindowEvent => ({
    type: 'RedemptionWindowClosed',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      closingBalance: LoyaltyPoints.of(closingBalance),
      redemptionCount: RedemptionLimit.of(redemptionCount),
      hadActivity,
      closedAt: at,
    },
  });

  const exhaustRedemptions: RedemptionWindowEvent[] = [
    redeemed(1),
    redeemed(1),
    redeemed(1),
  ];

  describe('Opening', () => {
    test('Opens a not opened window and emits RedemptionWindowOpened', () =>
      given([])
        .when({
          type: 'OpenRedemptionWindow',
          data: {
            walletNumber,
            ownerId: owner,
            windowNumber,
            openingBalance: LoyaltyPoints.ZERO,
            maxRedemptionCount: RedemptionLimit.of(3),
            access: [owner],
          },
        })
        .then([opened()]));

    test('Leaves an already open window unchanged', () =>
      given([opened()])
        .when({
          type: 'OpenRedemptionWindow',
          data: {
            walletNumber,
            ownerId: owner,
            windowNumber,
            openingBalance: LoyaltyPoints.ZERO,
            maxRedemptionCount: RedemptionLimit.of(3),
            access: [owner],
          },
        })
        .thenNothingHappened());

    test('Leaves a closed window unchanged', () =>
      given([opened(), closed()])
        .when({
          type: 'OpenRedemptionWindow',
          data: {
            walletNumber,
            ownerId: owner,
            windowNumber,
            openingBalance: LoyaltyPoints.ZERO,
            maxRedemptionCount: RedemptionLimit.of(3),
            access: [owner],
          },
        })
        .thenNothingHappened());
  });

  describe('Earning points', () => {
    test('Earns points on an open window', () =>
      given([opened()])
        .when({
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100), at },
        })
        .then([earned(100)]));

    test('Cant earn on a window that is not open', () =>
      given([])
        .when({
          type: 'EarnLoyaltyPoints',
          data: { walletNumber, points: LoyaltyPoints.of(100), at },
        })
        .thenThrows(
          (error: Error) => error.message === 'Redemption window is not open',
        ));
  });

  describe('Redeeming points', () => {
    test('Redeems points from an open window', () =>
      given([opened(), earned(100)])
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

    test('Redeems against the opening balance carried from the previous window', () =>
      given([opened(100)])
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

    test('Burns the policy amount, not the requested points', () =>
      given([opened(), earned(100)])
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

    test('Cant redeem more than available', () =>
      given([opened(), earned(20)])
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

    test('Cant redeem once the window is exhausted', () =>
      given([opened(), earned(100), ...exhaustRedemptions])
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

    test('Cant redeem without access', () =>
      given([opened(), earned(100)])
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

    test('A granted family member can redeem from the shared balance', () =>
      given([opened(), earned(100), accessGranted(familyMember)])
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

    test('Cant redeem after access is revoked', () =>
      given([
        opened(),
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

    test('Cant redeem from a window that is not open', () =>
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
          (error: Error) => error.message === 'Redemption window is not open',
        ));
  });

  describe('Closing', () => {
    test('Closes an open window carrying the available balance', () =>
      given([opened(), earned(100), redeemed(40)])
        .when({
          type: 'CloseRedemptionWindow',
          data: { walletNumber, closedAt: at },
        })
        .then([
          {
            type: 'RedemptionWindowClosed',
            data: {
              walletNumber,
              ownerId: owner,
              windowNumber,
              closingBalance: LoyaltyPoints.of(60),
              redemptionCount: RedemptionLimit.of(1),
              hadActivity: true,
              closedAt: at,
            },
          },
        ]));

    test('Closes an untouched window with no activity', () =>
      given([opened(100)])
        .when({
          type: 'CloseRedemptionWindow',
          data: { walletNumber, closedAt: at },
        })
        .then([
          {
            type: 'RedemptionWindowClosed',
            data: {
              walletNumber,
              ownerId: owner,
              windowNumber,
              closingBalance: LoyaltyPoints.of(100),
              redemptionCount: RedemptionLimit.ZERO,
              hadActivity: false,
              closedAt: at,
            },
          },
        ]));

    test('Leaves an already closed window unchanged', () =>
      given([opened(), closed()])
        .when({
          type: 'CloseRedemptionWindow',
          data: { walletNumber, closedAt: at },
        })
        .thenNothingHappened());
  });
});
