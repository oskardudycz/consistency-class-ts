import { grantWalletAccess, type GrantWalletAccess } from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const grantWalletAccessHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: GrantWalletAccess,
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const [state, ...events] = grantWalletAccess(command, wallet);

  await saveLoyaltyWallet(state, events);
};
