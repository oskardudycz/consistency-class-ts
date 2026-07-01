import { openLoyaltyWallet, type OpenLoyaltyWallet } from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const openLoyaltyWalletHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: OpenLoyaltyWallet,
): Promise<void> => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const events = openLoyaltyWallet(command, wallet);
  await saveLoyaltyWallet(command.walletNumber, events);
};
