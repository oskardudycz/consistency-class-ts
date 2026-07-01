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
): Promise<void> => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const revoked = revokeWalletAccess(command, wallet);
  await saveLoyaltyWallet(command.walletNumber, revoked);
};
