import { pongoSingleStreamProjection } from '@event-driven-io/emmett-sqlite';
import { type PongoDb } from '@event-driven-io/pongo';
import { type MemberId } from '../../membership';
import { type LoyaltyWalletEvent, type WalletNumber } from '../loyaltyWallet';

export type ActivityEntry = Readonly<{
  kind: 'Earned' | 'Redeemed';
  points: number;
  at: Date;
}>;

export type WindowActivity = Readonly<{
  windowNumber: number;
  earned: number;
  redeemed: number;
  burned: number;
  redemptionCount: number;
  hadActivity: boolean;
  entries: ActivityEntry[];
}>;

export type ActivityReport = Readonly<{
  _id: string;
  walletNumber: WalletNumber;
  ownerId: MemberId;
  currentWindow: WindowActivity;
  closedWindows: WindowActivity[];
}>;

const emptyWindow = (windowNumber: number): WindowActivity => ({
  windowNumber,
  earned: 0,
  redeemed: 0,
  burned: 0,
  redemptionCount: 0,
  hadActivity: false,
  entries: [],
});

export const evolve = (
  document: ActivityReport | null,
  event: LoyaltyWalletEvent,
): ActivityReport | null => {
  switch (event.type) {
    case 'LoyaltyWalletOpened': {
      const { walletNumber, ownerId } = event.data;
      return {
        _id: walletNumber,
        walletNumber,
        ownerId,
        currentWindow: emptyWindow(1),
        closedWindows: [],
      };
    }
    case 'LoyaltyPointsEarned': {
      if (!document) return document;

      const { points, at } = event.data;
      const window = document.currentWindow;

      return {
        ...document,
        currentWindow: {
          ...window,
          earned: window.earned + points,
          hadActivity: true,
          entries: [...window.entries, { kind: 'Earned', points, at }],
        },
      };
    }
    case 'LoyaltyPointsRedeemed': {
      if (!document) return document;

      const { points, burned = points, at } = event.data;
      const window = document.currentWindow;

      return {
        ...document,
        currentWindow: {
          ...window,
          redeemed: window.redeemed + points,
          burned: window.burned + burned,
          redemptionCount: window.redemptionCount + 1,
          hadActivity: true,
          entries: [...window.entries, { kind: 'Redeemed', points, at }],
        },
      };
    }
    case 'RedemptionWindowReset': {
      if (!document) return document;

      return {
        ...document,
        closedWindows: [...document.closedWindows, document.currentWindow],
        currentWindow: emptyWindow(document.currentWindow.windowNumber + 1),
      };
    }
    default:
      return document;
  }
};

const collectionName = 'activityReports';

export const activityReportProjection = pongoSingleStreamProjection<
  ActivityReport,
  LoyaltyWalletEvent
>({
  collectionName,
  canHandle: [
    'LoyaltyWalletOpened',
    'LoyaltyPointsEarned',
    'LoyaltyPointsRedeemed',
    'RedemptionWindowReset',
  ],
  getDocumentId: (event) => event.data.walletNumber,
  evolve,
});

export const activityReportCollection = (db: PongoDb) =>
  db.collection<ActivityReport>(collectionName);
