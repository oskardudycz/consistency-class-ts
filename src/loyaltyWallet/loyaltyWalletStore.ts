import { type PongoClient } from '@event-driven-io/pongo';
import { applyProjections } from '../core';
import { type MemberId } from '../membership';
import { activityReportProjection } from './activityReport';
import {
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  type WalletNumber,
} from './loyaltyWallet';
import { monthlySummaryProjection } from './monthlySummary';
import {
  findLoyaltyWalletsByOwners,
  walletDetailsProjection,
} from './walletDetails';
import { getLoyaltyWallet } from './walletDetails/walletDetails';

export type GetLoyaltyWallet = (
  walletNumber: WalletNumber,
) => Promise<LoyaltyWallet>;

export type FindLoyaltyWalletsByOwners = (
  ownerIds: MemberId[],
) => Promise<LoyaltyWallet[]>;

export type LoyaltyWalletUpdate = {
  walletNumber: WalletNumber;
  events: LoyaltyWalletEvent[];
};

export type SaveLoyaltyWallet = (
  walletNumber: WalletNumber,
  events?: LoyaltyWalletEvent | LoyaltyWalletEvent[],
) => Promise<void>;

export type SaveLoyaltyWallets = (
  updates: LoyaltyWalletUpdate[],
) => Promise<void>;

export const loyaltyWalletStore = (
  client: PongoClient,
): Readonly<{
  getLoyaltyWallet: GetLoyaltyWallet;
  findLoyaltyWalletsByOwners: FindLoyaltyWalletsByOwners;
  saveLoyaltyWallet: SaveLoyaltyWallet;
  saveLoyaltyWallets: SaveLoyaltyWallets;
}> => {
  const db = client.db();
  const projections = [
    activityReportProjection,
    monthlySummaryProjection,
    walletDetailsProjection,
  ];

  return {
    getLoyaltyWallet: async (walletNumber) =>
      getLoyaltyWallet(db, walletNumber),
    findLoyaltyWalletsByOwners: (ownerIds) =>
      findLoyaltyWalletsByOwners(db, ownerIds),
    saveLoyaltyWallet: async (_, events) => {
      await client.withSession((session) =>
        session.withTransaction(async () => {
          if (events) await applyProjections(db, projections, events, session);
        }),
      );
    },
    saveLoyaltyWallets: async (updates) => {
      if (updates.length === 0) return;

      await client.withSession((session) =>
        session.withTransaction(async () => {
          for (const { events } of updates) {
            await applyProjections(db, projections, events, session);
          }
        }),
      );
    },
  };
};
