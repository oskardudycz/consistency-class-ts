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
import { WalletNumber } from '../loyaltyWallet';
import { type RedemptionWindowEvent } from '../redemptionWindow';
import {
  type ActivityEntry,
  type ActivityReport,
  type WindowActivity,
  activityReportProjection,
} from './activityReport';

// Pongo persists dates as ISO strings, so the stored report carries string timestamps.
type StoredWindow = Omit<WindowActivity, 'entries'> & {
  entries: (Omit<ActivityEntry, 'at'> & { at: string })[];
};
type StoredReport = Omit<ActivityReport, 'currentWindow' | 'closedWindows'> & {
  currentWindow: StoredWindow;
  closedWindows: StoredWindow[];
};

void describe('ActivityReport projection', () => {
  let given: SQLiteProjectionSpec<RedemptionWindowEvent>;
  let walletNumber: WalletNumber;
  const owner = MemberId.random();
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));
  const iso = at.toISOString();

  beforeAll(() => {
    given = SQLiteProjectionSpec.for({
      projection: activityReportProjection,
      driver: sqlite3EventStoreDriver,
      fileName: InMemorySQLiteDatabase,
    });
  });

  beforeEach(() => (walletNumber = WalletNumber.random()));

  const opened = (windowNumber = 1): RedemptionWindowEvent => ({
    type: 'RedemptionWindowOpened',
    data: {
      walletNumber,
      ownerId: owner,
      windowNumber,
      openingBalance: LoyaltyPoints.ZERO,
      maxRedemptionCount: RedemptionLimit.of(5),
      access: [owner],
    },
  });

  const earned = (points: number, windowNumber = 1): RedemptionWindowEvent => ({
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
    windowNumber = 1,
  ): RedemptionWindowEvent => ({
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

  const closed = (windowNumber = 1): RedemptionWindowEvent => ({
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

  const reportShouldBe = (report: Omit<StoredReport, '_id'>) =>
    expectPongoDocuments
      .fromCollection<StoredReport>('activityReports')
      .withId(walletNumber)
      .toBeEqual({ _id: walletNumber, ...report });

  void it('opens an empty report in its first window', () =>
    given([])
      .when(newEventsInStream(walletNumber, [opened()]))
      .then(
        reportShouldBe({
          walletNumber,
          ownerId: owner,
          currentWindow: {
            windowNumber: 1,
            earned: 0,
            redeemed: 0,
            burned: 0,
            redemptionCount: 0,
            hadActivity: false,
            entries: [],
          },
          closedWindows: [],
        }),
      ));

  void it('groups earns and redemptions into the current window', () =>
    given(eventsInStream(walletNumber, [opened()]))
      .when(newEventsInStream(walletNumber, [earned(100), redeemed(40, 38)]))
      .then(
        reportShouldBe({
          walletNumber,
          ownerId: owner,
          currentWindow: {
            windowNumber: 1,
            earned: 100,
            redeemed: 40,
            burned: 38,
            redemptionCount: 1,
            hadActivity: true,
            entries: [
              { kind: 'Earned', points: 100, at: iso },
              { kind: 'Redeemed', points: 40, at: iso },
            ],
          },
          closedWindows: [],
        }),
      ));

  void it('closes the current window and opens the next', () =>
    given(
      eventsInStream(walletNumber, [opened(), earned(100), redeemed(40, 38)]),
    )
      .when(
        newEventsInStream(walletNumber, [closed(), opened(2), earned(20, 2)]),
      )
      .then(
        reportShouldBe({
          walletNumber,
          ownerId: owner,
          currentWindow: {
            windowNumber: 2,
            earned: 20,
            redeemed: 0,
            burned: 0,
            redemptionCount: 0,
            hadActivity: true,
            entries: [{ kind: 'Earned', points: 20, at: iso }],
          },
          closedWindows: [
            {
              windowNumber: 1,
              earned: 100,
              redeemed: 40,
              burned: 38,
              redemptionCount: 1,
              hadActivity: true,
              entries: [
                { kind: 'Earned', points: 100, at: iso },
                { kind: 'Redeemed', points: 40, at: iso },
              ],
            },
          ],
        }),
      ));

  void it('ignores activity before the report is opened', () =>
    given([])
      .when(newEventsInStream(walletNumber, [earned(100)]))
      .then(
        expectPongoDocuments
          .fromCollection<ActivityReport>('activityReports')
          .withId(walletNumber)
          .notToExist(),
      ));
});
