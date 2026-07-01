import { type WalletDeactivated } from '../../loyaltyWallet';
import { closeRedemptionWindow } from '../redemptionWindow';
import {
  type CurrentWindowOf,
  type GetRedemptionWindow,
  type SaveRedemptionWindow,
} from '../redemptionWindowStore';

export const closeRedemptionWindowOnWalletDeactivated = async (
  {
    currentWindowOf,
    getRedemptionWindow,
    saveRedemptionWindow,
  }: {
    currentWindowOf: CurrentWindowOf;
    getRedemptionWindow: GetRedemptionWindow;
    saveRedemptionWindow: SaveRedemptionWindow;
  },
  { data: event }: WalletDeactivated,
): Promise<void> => {
  const pointer = await currentWindowOf(event.walletNumber);
  if (!pointer) return;

  const window = await getRedemptionWindow(
    event.walletNumber,
    pointer.windowNumber,
  );

  const events = closeRedemptionWindow(
    { walletNumber: event.walletNumber, closedAt: new Date() },
    window,
  );
  await saveRedemptionWindow(event.walletNumber, pointer.windowNumber, events);
};
