import { closeWallet, type CloseWallet } from '../loyaltyWallet';
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
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  return saveLoyaltyWallet(command.walletNumber, closeWallet(wallet));
};
