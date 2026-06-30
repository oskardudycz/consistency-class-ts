import {
  setRedemptionCadence,
  type SetRedemptionCadence,
} from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const setRedemptionCadenceHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: SetRedemptionCadence,
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  return saveLoyaltyWallet(
    command.walletNumber,
    setRedemptionCadence(command, wallet),
  );
};
