import {
  closeWallet,
  type CloseWallet,
  type LoyaltyWalletEvent,
} from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const closeWalletHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: CloseWallet,
): Promise<LoyaltyWalletEvent[]> => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const events = closeWallet(wallet);
  await saveLoyaltyWallet(command.walletNumber, events);

  return Array.isArray(events) ? events : [events];
};
