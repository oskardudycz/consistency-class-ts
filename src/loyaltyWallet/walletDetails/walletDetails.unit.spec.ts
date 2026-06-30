import { InMemorySQLiteDatabase } from '@event-driven-io/dumbo/sqlite3';
import {
  eventsInStream,
  expectPongoDocuments,
  newEventsInStream,
  SQLiteProjectionSpec,
} from '@event-driven-io/emmett-sqlite';
import { sqlite3EventStoreDriver } from '@event-driven-io/emmett-sqlite/sqlite3';
import { beforeAll, beforeEach, describe, it } from 'vitest';
import { MemberId } from '../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../loyaltyPoints';
import {
  type LoyaltyWalletEvent,
  type RedemptionCadence,
  WalletNumber,
} from '../loyaltyWallet';
import { type WalletDetails, walletDetailsProjection } from './walletDetails';

void describe('WalletDetails projection', () => {
  let given: SQLiteProjectionSpec<LoyaltyWalletEvent>;
  let walletNumber: WalletNumber;
  const owner = MemberId.random();
  const family = MemberId.random();
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  beforeAll(() => {
    given = SQLiteProjectionSpec.for({
      projection: walletDetailsProjection,
      driver: sqlite3EventStoreDriver,
      fileName: InMemorySQLiteDatabase,
    });
  });

  beforeEach(() => (walletNumber = WalletNumber.random()));

  const opened = (): LoyaltyWalletEvent => ({
    type: 'LoyaltyWalletOpened',
    data: {
      walletNumber,
      ownerId: owner,
      cadence: 'Weekly',
      maxRedemptionCount: RedemptionLimit.of(5),
      earnedPoints: LoyaltyPoints.ZERO,
      redeemedPoints: LoyaltyPoints.ZERO,
    },
  });

  const earned = (points: number): LoyaltyWalletEvent => ({
    type: 'LoyaltyPointsEarned',
    data: {
      walletNumber,
      ownerId: owner,
      points: LoyaltyPoints.of(points),
      at,
    },
  });

  const redeemed = (points: number, burned = points): LoyaltyWalletEvent => ({
    type: 'LoyaltyPointsRedeemed',
    data: {
      walletNumber,
      ownerId: owner,
      byMemberId: owner,
      points: LoyaltyPoints.of(points),
      burned: LoyaltyPoints.of(burned),
      at,
    },
  });

  const windowReset = (): LoyaltyWalletEvent => ({
    type: 'RedemptionWindowReset',
    data: { walletNumber, ownerId: owner, at },
  });

  const cadenceSet = (cadence: RedemptionCadence): LoyaltyWalletEvent => ({
    type: 'RedemptionCadenceSet',
    data: { walletNumber, ownerId: owner, cadence },
  });

  const accessGranted = (memberId: MemberId): LoyaltyWalletEvent => ({
    type: 'WalletAccessGranted',
    data: { walletNumber, ownerId: owner, memberId },
  });

  const accessRevoked = (memberId: MemberId): LoyaltyWalletEvent => ({
    type: 'WalletAccessRevoked',
    data: { walletNumber, ownerId: owner, memberId },
  });

  const deactivated = (): LoyaltyWalletEvent => ({
    type: 'WalletDeactivated',
    data: { walletNumber, ownerId: owner },
  });

  const closed = (): LoyaltyWalletEvent => ({
    type: 'WalletClosed',
    data: { walletNumber },
  });

  const walletShouldBe = (details: Omit<WalletDetails, '_id'>) =>
    expectPongoDocuments
      .fromCollection<WalletDetails>('wallets')
      .withId(walletNumber)
      .toBeEqual({ _id: walletNumber, ...details });

  void it('opens an active wallet with the owner having access', () =>
    given([])
      .when(newEventsInStream(walletNumber, [opened()]))
      .then(
        walletShouldBe({
          status: 'Active',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.ZERO,
            redeemedPoints: LoyaltyPoints.ZERO,
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));

  void it('accumulates earned points', () =>
    given(eventsInStream(walletNumber, [opened(), earned(100)]))
      .when(newEventsInStream(walletNumber, [earned(50)]))
      .then(
        walletShouldBe({
          status: 'Active',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.of(150),
            redeemedPoints: LoyaltyPoints.ZERO,
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));

  void it('burns the policy amount and counts redemptions', () =>
    given(eventsInStream(walletNumber, [opened(), earned(100)]))
      .when(newEventsInStream(walletNumber, [redeemed(40, 38)]))
      .then(
        walletShouldBe({
          status: 'Active',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.of(100),
            redeemedPoints: LoyaltyPoints.of(38),
            redemptionCount: RedemptionLimit.of(1),
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));

  void it('resets the redemption count when the window resets', () =>
    given(eventsInStream(walletNumber, [opened(), earned(100), redeemed(10)]))
      .when(newEventsInStream(walletNumber, [windowReset()]))
      .then(
        walletShouldBe({
          status: 'Active',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.of(100),
            redeemedPoints: LoyaltyPoints.of(10),
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));

  void it('updates the redemption cadence', () =>
    given(eventsInStream(walletNumber, [opened()]))
      .when(newEventsInStream(walletNumber, [cadenceSet('Monthly')]))
      .then(
        walletShouldBe({
          status: 'Active',
          walletNumber,
          ownerId: owner,
          cadence: 'Monthly',
          points: {
            earnedPoints: LoyaltyPoints.ZERO,
            redeemedPoints: LoyaltyPoints.ZERO,
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));

  void it('grants access without duplicating members', () =>
    given(eventsInStream(walletNumber, [opened(), accessGranted(family)]))
      .when(newEventsInStream(walletNumber, [accessGranted(family)]))
      .then(
        walletShouldBe({
          status: 'Active',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.ZERO,
            redeemedPoints: LoyaltyPoints.ZERO,
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner, family],
        }),
      ));

  void it('revokes access', () =>
    given(eventsInStream(walletNumber, [opened(), accessGranted(family)]))
      .when(newEventsInStream(walletNumber, [accessRevoked(family)]))
      .then(
        walletShouldBe({
          status: 'Active',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.ZERO,
            redeemedPoints: LoyaltyPoints.ZERO,
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));

  void it('marks the wallet deactivated', () =>
    given(eventsInStream(walletNumber, [opened()]))
      .when(newEventsInStream(walletNumber, [deactivated()]))
      .then(
        walletShouldBe({
          status: 'Deactivated',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.ZERO,
            redeemedPoints: LoyaltyPoints.ZERO,
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));

  void it('marks the wallet closed', () =>
    given(eventsInStream(walletNumber, [opened()]))
      .when(newEventsInStream(walletNumber, [closed()]))
      .then(
        walletShouldBe({
          status: 'Closed',
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          points: {
            earnedPoints: LoyaltyPoints.ZERO,
            redeemedPoints: LoyaltyPoints.ZERO,
            redemptionCount: RedemptionLimit.ZERO,
            maxRedemptionCount: RedemptionLimit.of(5),
          },
          accessMembers: [owner],
        }),
      ));
});
