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
): Promise<void> => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const granted = grantWalletAccess(command, wallet);
  await saveLoyaltyWallet(granted.data.walletNumber, granted);
};
