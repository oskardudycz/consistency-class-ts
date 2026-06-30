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

  const [state, ...events] = deactivateWallet(wallet);

  await saveLoyaltyWallet(state, events);
};
