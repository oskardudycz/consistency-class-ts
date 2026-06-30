import { type SQLiteEventStore } from '@event-driven-io/emmett-sqlite';
import { type PongoClient } from '@event-driven-io/pongo';
import { type MemberId } from '../membership';
import {
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  type WalletNumber,
  evolve,
} from './loyaltyWallet';
import { findLoyaltyWalletsByOwners } from './walletDetails';

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
  eventStore: SQLiteEventStore,
  client: PongoClient,
) => {
  const db = client.db();

  return {
    db,
    getLoyaltyWallet: async (walletNumber: WalletNumber) =>
      (
        await eventStore.aggregateStream<LoyaltyWallet, LoyaltyWalletEvent>(
          walletNumber,
          { evolve, initialState: LoyaltyWallet.initial },
        )
      ).state ?? LoyaltyWallet.initial(),
    findLoyaltyWalletsByOwners: (ownerIds: MemberId[]) =>
      findLoyaltyWalletsByOwners(db, ownerIds),
    saveLoyaltyWallet: async (
      walletNumber: WalletNumber,
      events?: LoyaltyWalletEvent | LoyaltyWalletEvent[],
    ) => {
      const toAppend =
        events === undefined ? [] : Array.isArray(events) ? events : [events];
      if (toAppend.length === 0) return;
      await eventStore.appendToStream(walletNumber, toAppend);
    },
    saveLoyaltyWallets: async (updates: LoyaltyWalletUpdate[]) => {
      for (const { walletNumber, events } of updates) {
        if (events.length === 0) continue;
        await eventStore.appendToStream(walletNumber, events);
      }
    },
  };
};
