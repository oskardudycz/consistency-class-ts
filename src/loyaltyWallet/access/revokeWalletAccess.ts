import { revokeWalletAccess, type RevokeWalletAccess } from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const revokeWalletAccessHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: RevokeWalletAccess,
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  return saveLoyaltyWallet(
    command.walletNumber,
    revokeWalletAccess(command, wallet),
  );
};
