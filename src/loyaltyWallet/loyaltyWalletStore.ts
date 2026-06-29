import {
  type PongoClient,
  type PongoCollection,
  type PongoDb,
  type PongoFilter,
  type PongoSession,
} from '@event-driven-io/pongo';
import { applyProjections } from '../core';
import { type MemberId } from '../membership';
import { WalletAccess } from './access';
import { activityReportProjection } from './activityReport';
import {
  type LoyaltyPoints,
  LoyaltyPointsLimit,
  type RedemptionLimit,
} from './loyaltyPoints';
import {
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  type RedemptionCadence,
  type WalletNumber,
} from './loyaltyWallet';
import { monthlySummaryProjection } from './monthlySummary';

export type GetLoyaltyWallet = (
  walletNumber: WalletNumber,
) => Promise<LoyaltyWallet>;

export type FindLoyaltyWalletsByOwners = (
  ownerIds: MemberId[],
) => Promise<LoyaltyWallet[]>;

export type LoyaltyWalletUpdate = {
  state: LoyaltyWallet;
  events: LoyaltyWalletEvent[];
};

export type SaveLoyaltyWallet = (
  state: LoyaltyWallet,
  events?: LoyaltyWalletEvent[],
) => Promise<void>;

export type SaveLoyaltyWallets = (
  updates: LoyaltyWalletUpdate[],
) => Promise<void>;

type WalletPoints = {
  earnedPoints: LoyaltyPoints;
  redeemedPoints: LoyaltyPoints;
  redemptionCount: RedemptionLimit;
  maxRedemptionCount: RedemptionLimit;
};

export type WalletDocument =
  | {
      _id: WalletNumber;
      status: 'Active' | 'Deactivated';
      walletNumber: WalletNumber;
      ownerId: MemberId;
      cadence: RedemptionCadence;
      points: WalletPoints;
      accessMembers: MemberId[];
    }
  | {
      _id: WalletNumber;
      status: 'Closed';
      walletNumber: WalletNumber;
    };

const toDocument = (wallet: LoyaltyWallet): WalletDocument => {
  switch (wallet.status) {
    case 'Active':
    case 'Deactivated':
      return {
        _id: wallet.walletNumber,
        status: wallet.status,
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        cadence: wallet.cadence,
        points: {
          earnedPoints: wallet.pointsLimit.earnedPoints,
          redeemedPoints: wallet.pointsLimit.redeemedPoints,
          redemptionCount: wallet.pointsLimit.redemptionCount,
          maxRedemptionCount: wallet.pointsLimit.maxRedemptionCount,
        },
        accessMembers: [...wallet.access.members],
      };
    case 'Closed':
      return {
        _id: wallet.walletNumber,
        status: 'Closed',
        walletNumber: wallet.walletNumber,
      };
    case 'NotExisting':
      throw new Error('Cannot persist a non-existing wallet');
  }
};

const fromDocument = (doc: WalletDocument): LoyaltyWallet => {
  switch (doc.status) {
    case 'Active':
    case 'Deactivated':
      return {
        status: doc.status,
        walletNumber: doc.walletNumber,
        ownerId: doc.ownerId,
        cadence: doc.cadence,
        pointsLimit: LoyaltyPointsLimit.initial(doc.points),
        access: WalletAccess.of(...doc.accessMembers),
      };
    case 'Closed':
      return { status: 'Closed', walletNumber: doc.walletNumber };
  }
};

export const walletCollection = (
  db: PongoDb,
): PongoCollection<WalletDocument> => db.collection<WalletDocument>('wallets');

export const loyaltyWalletStore = (
  client: PongoClient,
): Readonly<{
  getLoyaltyWallet: GetLoyaltyWallet;
  findLoyaltyWalletsByOwners: FindLoyaltyWalletsByOwners;
  saveLoyaltyWallet: SaveLoyaltyWallet;
  saveLoyaltyWallets: SaveLoyaltyWallets;
}> => {
  const db = client.db();
  const wallets = walletCollection(db);
  const projections = [activityReportProjection, monthlySummaryProjection];

  const saveWalletDocument = async (
    state: LoyaltyWallet,
    session: PongoSession,
  ): Promise<void> => {
    const doc = toDocument(state);
    const existing =
      (await wallets.countDocuments({ _id: doc._id }, { session })) > 0;

    if (existing) await wallets.replaceOne({ _id: doc._id }, doc, { session });
    else await wallets.insertOne(doc, { session });
  };

  return {
    getLoyaltyWallet: async (walletNumber) => {
      const doc = await wallets.findOne({ _id: walletNumber });
      return doc ? fromDocument(doc) : LoyaltyWallet.initial();
    },
    findLoyaltyWalletsByOwners: async (ownerIds) =>
      (
        await wallets.find({
          ownerId: { $in: ownerIds },
        } as PongoFilter<WalletDocument>)
      ).map(fromDocument),
    saveLoyaltyWallet: async (state, events) => {
      await client.withSession((session) =>
        session.withTransaction(async () => {
          await saveWalletDocument(state, session);
          if (events) await applyProjections(db, projections, events, session);
        }),
      );
    },
    saveLoyaltyWallets: async (updates) => {
      if (updates.length === 0) return;

      await client.withSession((session) =>
        session.withTransaction(async () => {
          await wallets.replaceMany(
            updates.map(({ state }) => toDocument(state)),
            { session },
          );

          for (const { events } of updates) {
            await applyProjections(db, projections, events, session);
          }
        }),
      );
    },
  };
};
