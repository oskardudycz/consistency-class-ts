import { pongoSingleStreamProjection } from '@event-driven-io/emmett-sqlite';
import type { PongoCollection, PongoDb } from '@event-driven-io/pongo';
import type { MemberId } from '../../membership';
import { WalletAccess } from '../access';
import {
  LoyaltyPoints,
  LoyaltyPointsLimit,
  RedemptionLimit,
} from '../loyaltyPoints';
import {
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  type RedemptionCadence,
  type WalletNumber,
} from '../loyaltyWallet';

type WalletPoints = {
  earnedPoints: LoyaltyPoints;
  redeemedPoints: LoyaltyPoints;
  redemptionCount: RedemptionLimit;
  maxRedemptionCount: RedemptionLimit;
};

export type WalletDetails = {
  _id: WalletNumber;
  status: 'Active' | 'Deactivated' | 'Closed';
  walletNumber: WalletNumber;
  ownerId: MemberId;
  cadence: RedemptionCadence;
  points: WalletPoints;
  accessMembers: MemberId[];
};

const evolve = (
  state: WalletDetails | null,
  { type: eventType, data: event }: LoyaltyWalletEvent,
): WalletDetails => {
  switch (eventType) {
    case 'LoyaltyWalletOpened':
      return {
        _id: event.walletNumber,
        status: 'Active',
        walletNumber: event.walletNumber,
        ownerId: event.ownerId,
        cadence: event.cadence,
        points: {
          earnedPoints: event.earnedPoints,
          redeemedPoints: event.redeemedPoints,
          redemptionCount: RedemptionLimit.ZERO,
          maxRedemptionCount: event.maxRedemptionCount,
        },
        accessMembers: [event.ownerId],
      };

    case 'LoyaltyPointsEarned':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        points: {
          ...state.points,
          earnedPoints: LoyaltyPoints.earn(
            state.points.earnedPoints,
            event.points,
          ),
        },
      };

    case 'LoyaltyPointsRedeemed':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        points: {
          ...state.points,
          redeemedPoints: LoyaltyPoints.redeem(
            state.points.redeemedPoints,
            event.burned ?? event.points,
          ),
          redemptionCount: RedemptionLimit.redeem(state.points.redemptionCount),
        },
      };

    case 'RedemptionWindowReset':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        points: {
          ...state.points,
          redemptionCount: RedemptionLimit.ZERO,
        },
      };

    case 'RedemptionCadenceSet':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        cadence: event.cadence,
      };

    case 'WalletAccessGranted':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        // Using Set to prevent duplicate MemberIds in the array
        accessMembers: Array.from(
          new Set([...state.accessMembers, event.memberId]),
        ),
      };

    case 'WalletAccessRevoked':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        accessMembers: state.accessMembers.filter(
          (id) => id !== event.memberId,
        ),
      };

    case 'WalletDeactivated':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        status: 'Deactivated',
      };

    case 'WalletClosed':
      if (!state) return state as unknown as WalletDetails;
      return {
        ...state,
        status: 'Closed',
      };

    default: {
      const _exhaustiveCheck: never = eventType;
      return state as unknown as WalletDetails;
    }
  }
};

const collectionName = 'wallets';

export const walletCollection = (db: PongoDb): PongoCollection<WalletDetails> =>
  db.collection<WalletDetails>(collectionName);

export const walletDetailsProjection = pongoSingleStreamProjection<
  WalletDetails,
  LoyaltyWalletEvent
>({
  collectionName,
  canHandle: [
    'LoyaltyWalletOpened',
    'WalletAccessGranted',
    'WalletAccessRevoked',
    'LoyaltyPointsEarned',
    'LoyaltyPointsRedeemed',
    'RedemptionCadenceSet',
    'RedemptionWindowReset',
    'WalletDeactivated',
    'WalletClosed',
  ],
  getDocumentId: (event) => event.data.walletNumber,
  evolve,
});

const fromDocument = (doc: WalletDetails): LoyaltyWallet => {
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

export const findLoyaltyWalletsByOwners = async (
  db: PongoDb,
  ownerIds: MemberId[],
): Promise<LoyaltyWallet[]> =>
  (
    await walletCollection(db).find({
      ownerId: { $in: ownerIds },
    })
  ).map(fromDocument);
