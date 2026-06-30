import { pongoMultiStreamProjection } from '@event-driven-io/emmett-sqlite';
import { type PongoDb } from '@event-driven-io/pongo';
import { type MemberId } from '../../membership';
import {
  type LoyaltyPointsEarned,
  type LoyaltyPointsRedeemed,
  type RedemptionWindowReset,
  type WalletNumber,
} from '../loyaltyWallet';

export type MonthlySummaryEvent =
  | LoyaltyPointsEarned
  | LoyaltyPointsRedeemed
  | RedemptionWindowReset;

export type MonthlySummary = Readonly<{
  _id: string;
  walletNumber: WalletNumber;
  ownerId: MemberId;
  month: string;
  totalEarned: number;
  totalRedeemed: number;
  totalBurned: number;
  redemptionCount: number;
  windowsClosed: number;
}>;

const monthOf = (at: Date): string =>
  `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;

const documentId = (event: MonthlySummaryEvent): string =>
  `${event.data.walletNumber}:${monthOf(event.data.at)}`;

export const evolve = (
  document: MonthlySummary | null,
  event: MonthlySummaryEvent,
): MonthlySummary => {
  const summary: MonthlySummary = document ?? {
    _id: documentId(event),
    walletNumber: event.data.walletNumber,
    ownerId: event.data.ownerId,
    month: monthOf(event.data.at),
    totalEarned: 0,
    totalRedeemed: 0,
    totalBurned: 0,
    redemptionCount: 0,
    windowsClosed: 0,
  };

  switch (event.type) {
    case 'LoyaltyPointsEarned':
      return {
        ...summary,
        totalEarned: summary.totalEarned + event.data.points,
      };
    case 'LoyaltyPointsRedeemed':
      return {
        ...summary,
        totalRedeemed: summary.totalRedeemed + event.data.points,
        totalBurned:
          summary.totalBurned + (event.data.burned ?? event.data.points),
        redemptionCount: summary.redemptionCount + 1,
      };
    case 'RedemptionWindowReset':
      return { ...summary, windowsClosed: summary.windowsClosed + 1 };
  }
};

const collectionName = 'monthlySummaries';

export const monthlySummaryProjection = pongoMultiStreamProjection<
  MonthlySummary,
  MonthlySummaryEvent
>({
  collectionName,
  canHandle: [
    'LoyaltyPointsEarned',
    'LoyaltyPointsRedeemed',
    'RedemptionWindowReset',
  ],
  getDocumentId: documentId,
  evolve,
});

export const monthlySummaryCollection = (db: PongoDb) =>
  db.collection<MonthlySummary>(collectionName);
