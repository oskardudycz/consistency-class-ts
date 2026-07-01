import { type SQLiteEventStore } from '@event-driven-io/emmett-sqlite';
import { type PongoClient } from '@event-driven-io/pongo';
import {
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  type WalletNumber,
  evolve,
} from './loyaltyWallet';

export type GetLoyaltyWallet = (
  walletNumber: WalletNumber,
) => Promise<LoyaltyWallet>;

export type SaveLoyaltyWallet = (
  walletNumber: WalletNumber,
  events?: LoyaltyWalletEvent | LoyaltyWalletEvent[],
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
    saveLoyaltyWallet: async (
      walletNumber: WalletNumber,
      events?: LoyaltyWalletEvent | LoyaltyWalletEvent[],
    ) => {
      const toAppend =
        events === undefined ? [] : Array.isArray(events) ? events : [events];
      if (toAppend.length === 0) return;
      await eventStore.appendToStream(walletNumber, toAppend);
    },
  };
};
