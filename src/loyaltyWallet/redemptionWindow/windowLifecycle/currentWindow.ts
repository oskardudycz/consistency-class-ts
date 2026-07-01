import { pongoMultiStreamProjection } from '@event-driven-io/emmett-sqlite';
import { type PongoDb } from '@event-driven-io/pongo';
import { type MemberId } from '../../../membership';
import { type WalletNumber } from '../../loyaltyWallet';
import {
  type RedemptionWindowClosed,
  type RedemptionWindowOpened,
} from '../redemptionWindow';

export type CurrentWindow = Readonly<{
  _id: WalletNumber;
  walletNumber: WalletNumber;
  ownerId: MemberId;
  windowNumber: number;
  open: boolean;
}>;

type CurrentWindowEvent = RedemptionWindowOpened | RedemptionWindowClosed;

export const evolve = (
  document: CurrentWindow | null,
  { type, data: event }: CurrentWindowEvent,
): CurrentWindow => {
  switch (type) {
    case 'RedemptionWindowOpened':
      return {
        _id: event.walletNumber,
        walletNumber: event.walletNumber,
        ownerId: event.ownerId,
        windowNumber: event.windowNumber,
        open: true,
      };
    case 'RedemptionWindowClosed':
      if (!document || document.windowNumber !== event.windowNumber)
        return document as unknown as CurrentWindow;
      return { ...document, open: false };
  }
};

const collectionName = 'currentWindows';

export const currentWindowProjection = pongoMultiStreamProjection<
  CurrentWindow,
  CurrentWindowEvent
>({
  collectionName,
  canHandle: ['RedemptionWindowOpened', 'RedemptionWindowClosed'],
  getDocumentId: (event) => event.data.walletNumber,
  evolve,
});

export const currentWindowCollection = (db: PongoDb) =>
  db.collection<CurrentWindow>(collectionName);
