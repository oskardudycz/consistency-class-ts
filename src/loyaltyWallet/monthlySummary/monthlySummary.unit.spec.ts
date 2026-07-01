import { InMemorySQLiteDatabase } from '@event-driven-io/dumbo/sqlite3';
import {
  eventsInStream,
  expectPongoDocuments,
  newEventsInStream,
  type SQLiteProjectionAssert,
  SQLiteProjectionSpec,
} from '@event-driven-io/emmett-sqlite';
import { sqlite3EventStoreDriver } from '@event-driven-io/emmett-sqlite/sqlite3';
import { beforeAll, beforeEach, describe, it } from 'vitest';
import { MemberId } from '../../membership';
import { LoyaltyPoints, RedemptionLimit } from '../loyaltyPoints';
import { WalletNumber } from '../loyaltyWallet';
import {
  type MonthlySummary,
  type MonthlySummaryEvent,
  monthlySummaryProjection,
} from './monthlySummary';

void describe('MonthlySummary projection', () => {
  let given: SQLiteProjectionSpec<MonthlySummaryEvent>;
  let walletNumber: WalletNumber;
  const owner = MemberId.random();
  const june = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));
  const july = new Date(Date.UTC(2026, 6, 10, 12, 0, 0));

  beforeAll(() => {
    given = SQLiteProjectionSpec.for({
      projection: monthlySummaryProjection,
      driver: sqlite3EventStoreDriver,
      fileName: InMemorySQLiteDatabase,
    });
  });

  beforeEach(() => (walletNumber = WalletNumber.random()));

  const earned = (
    points: number,
    at: Date,
    windowNumber = 1,
  ): MonthlySummaryEvent => ({
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
    at: Date,
    burned = points,
    windowNumber = 1,
  ): MonthlySummaryEvent => ({
    type: 'LoyaltyPointsRedeemed',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      byMemberId: owner,
      points: LoyaltyPoints.of(points),
      burned: LoyaltyPoints.of(burned),
      at,
    },
  });

  const closed = (at: Date, windowNumber = 1): MonthlySummaryEvent => ({
    type: 'RedemptionWindowClosed',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      closingBalance: LoyaltyPoints.ZERO,
      redemptionCount: RedemptionLimit.ZERO,
      hadActivity: true,
      closedAt: at,
    },
  });

  const summaryShouldBe = (
    summary: Omit<MonthlySummary, '_id'>,
  ): SQLiteProjectionAssert => {
    const id = `${walletNumber}:${summary.month}`;
    return expectPongoDocuments
      .fromCollection<MonthlySummary>('monthlySummaries')
      .withId(id)
      .toBeEqual({ _id: id, ...summary });
  };

  const allOf =
    (...asserts: SQLiteProjectionAssert[]): SQLiteProjectionAssert =>
    async (options) => {
      for (const assert of asserts) await assert(options);
    };

  void it('aggregates earns, redemptions and closed windows for the month', () =>
    given(
      eventsInStream(walletNumber, [earned(100, june), redeemed(40, june, 38)]),
    )
      .when(newEventsInStream(walletNumber, [redeemed(10, june), closed(june)]))
      .then(
        summaryShouldBe({
          walletNumber,
          ownerId: owner,
          month: '2026-06',
          totalEarned: 100,
          totalRedeemed: 50,
          totalBurned: 48,
          redemptionCount: 2,
          windowsClosed: 1,
        }),
      ));

  void it('keeps a separate summary per month', () =>
    given(eventsInStream(walletNumber, [earned(100, june), redeemed(40, june)]))
      .when(
        newEventsInStream(walletNumber, [
          earned(60, july),
          redeemed(20, july, 18),
        ]),
      )
      .then(
        allOf(
          summaryShouldBe({
            walletNumber,
            ownerId: owner,
            month: '2026-06',
            totalEarned: 100,
            totalRedeemed: 40,
            totalBurned: 40,
            redemptionCount: 1,
            windowsClosed: 0,
          }),
          summaryShouldBe({
            walletNumber,
            ownerId: owner,
            month: '2026-07',
            totalEarned: 60,
            totalRedeemed: 20,
            totalBurned: 18,
            redemptionCount: 1,
            windowsClosed: 0,
          }),
        ),
      ));

  void it('initialises the document on a redemption with no prior earn', () =>
    given([])
      .when(newEventsInStream(walletNumber, [redeemed(25, june)]))
      .then(
        summaryShouldBe({
          walletNumber,
          ownerId: owner,
          month: '2026-06',
          totalEarned: 0,
          totalRedeemed: 25,
          totalBurned: 25,
          redemptionCount: 1,
          windowsClosed: 0,
        }),
      ));
});
