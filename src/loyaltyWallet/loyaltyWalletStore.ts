import {
  type PongoCollection,
  type PongoDb,
  type PongoFilter,
} from '@event-driven-io/pongo';
import { type MemberId } from '../membership';
import { WalletAccess } from './access';
import {
  type LoyaltyPoints,
  LoyaltyPointsLimit,
  type RedemptionLimit,
} from './loyaltyPoints';
import {
  LoyaltyWallet,
  type RedemptionCadence,
  type WalletNumber,
} from './loyaltyWallet';

export type GetLoyaltyWallet = (
  walletNumber: WalletNumber,
) => Promise<LoyaltyWallet>;

export type FindLoyaltyWalletsByOwners = (
  ownerIds: MemberId[],
) => Promise<LoyaltyWallet[]>;

export type SaveLoyaltyWallet = (wallet: LoyaltyWallet) => Promise<void>;

export type SaveLoyaltyWallets = (wallets: LoyaltyWallet[]) => Promise<void>;

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
  wallets: PongoCollection<WalletDocument>,
): Readonly<{
  getLoyaltyWallet: GetLoyaltyWallet;
  findLoyaltyWalletsByOwners: FindLoyaltyWalletsByOwners;
  saveLoyaltyWallet: SaveLoyaltyWallet;
  saveLoyaltyWallets: SaveLoyaltyWallets;
}> => ({
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
  saveLoyaltyWallet: async (wallet) => {
    const doc = toDocument(wallet);
    const existing = (await wallets.countDocuments({ _id: doc._id })) > 0;

    if (existing) await wallets.replaceOne({ _id: doc._id }, doc);
    else await wallets.insertOne(doc);
  },
  saveLoyaltyWallets: async (toSave) => {
    if (toSave.length === 0) return;

    await wallets.replaceMany(toSave.map(toDocument));
  },
});
