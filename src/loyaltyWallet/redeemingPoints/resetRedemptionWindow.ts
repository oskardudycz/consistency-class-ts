import {
  resetRedemptionWindow,
  type ResetRedemptionWindow,
} from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const resetRedemptionWindowHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: ResetRedemptionWindow,
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  await saveLoyaltyWallet(resetRedemptionWindow(wallet));
};
