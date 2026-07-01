import { STREAM_DOES_NOT_EXIST } from '@event-driven-io/emmett';
import { type SQLiteEventStore } from '@event-driven-io/emmett-sqlite';
import { type PongoClient } from '@event-driven-io/pongo';
import { type MemberId } from '../../membership';
import { type WalletNumber } from '../loyaltyWallet';
import { type CurrentWindow, currentWindowCollection } from './windowLifecycle';
import {
  evolve,
  RedemptionWindow,
  type RedemptionWindowEvent,
  redemptionWindowStream,
} from './redemptionWindow';

export type GetRedemptionWindow = (
  walletNumber: WalletNumber,
  windowNumber: number,
) => Promise<RedemptionWindow>;

export type SaveRedemptionWindow = (
  walletNumber: WalletNumber,
  windowNumber: number,
  events: RedemptionWindowEvent | RedemptionWindowEvent[],
  options?: { requireNew?: boolean },
) => Promise<void>;

export type RedemptionWindowUpdate = {
  walletNumber: WalletNumber;
  windowNumber: number;
  events: RedemptionWindowEvent[];
};

export type SaveRedemptionWindows = (
  updates: RedemptionWindowUpdate[],
) => Promise<void>;

export type CurrentWindowOf = (
  walletNumber: WalletNumber,
) => Promise<CurrentWindow | null>;

export type CurrentWindowsByOwners = (
  ownerIds: MemberId[],
) => Promise<CurrentWindow[]>;

export const redemptionWindowStore = (
  eventStore: SQLiteEventStore,
  client: PongoClient,
) => {
  const db = client.db();

  return {
    db,
    getRedemptionWindow: async (
      walletNumber: WalletNumber,
      windowNumber: number,
    ) =>
      (
        await eventStore.aggregateStream<
          RedemptionWindow,
          RedemptionWindowEvent
        >(redemptionWindowStream(walletNumber, windowNumber), {
          evolve,
          initialState: RedemptionWindow.initial,
        })
      ).state ?? RedemptionWindow.initial(),
    saveRedemptionWindow: async (
      walletNumber: WalletNumber,
      windowNumber: number,
      events: RedemptionWindowEvent | RedemptionWindowEvent[],
      options?: { requireNew?: boolean },
    ) => {
      const toAppend = Array.isArray(events) ? events : [events];
      if (toAppend.length === 0) return;
      await eventStore.appendToStream(
        redemptionWindowStream(walletNumber, windowNumber),
        toAppend,
        options?.requireNew
          ? { expectedStreamVersion: STREAM_DOES_NOT_EXIST }
          : undefined,
      );
    },
    saveRedemptionWindows: async (updates: RedemptionWindowUpdate[]) => {
      for (const { walletNumber, windowNumber, events } of updates) {
        if (events.length === 0) continue;
        await eventStore.appendToStream(
          redemptionWindowStream(walletNumber, windowNumber),
          events,
        );
      }
    },
    currentWindowOf: (walletNumber: WalletNumber) =>
      currentWindowCollection(db).findOne({ _id: walletNumber }),
    currentWindowsByOwners: (ownerIds: MemberId[]) =>
      currentWindowCollection(db).find({ ownerId: { $in: ownerIds } }),
  };
};
