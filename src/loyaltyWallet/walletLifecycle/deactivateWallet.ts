import { deactivateWallet, type DeactivateWallet } from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const deactivateWalletHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: DeactivateWallet,
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  await saveLoyaltyWallet(deactivateWallet(wallet));
};
