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
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const [state, ...events] = openLoyaltyWallet(command, wallet);

  await saveLoyaltyWallet(state, events);
};
