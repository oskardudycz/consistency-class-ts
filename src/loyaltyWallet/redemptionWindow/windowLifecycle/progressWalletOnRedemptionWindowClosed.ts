import { openNextRedemptionWindow } from '../../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../../loyaltyWalletStore';
import { type RedemptionWindowClosed } from '../redemptionWindow';

export const progressWalletOnRedemptionWindowClosed = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: event }: RedemptionWindowClosed,
): Promise<void> => {
  const wallet = await getLoyaltyWallet(event.walletNumber);

  const events = openNextRedemptionWindow(
    {
      walletNumber: event.walletNumber,
      closedWindowNumber: event.windowNumber,
      closingBalance: event.closingBalance,
    },
    wallet,
  );

  await saveLoyaltyWallet(event.walletNumber, events);
};
