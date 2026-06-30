import { type MemberVerified, tierProgram } from '../../membership';
import {
  LoyaltyWallet,
  openLoyaltyWallet,
  WalletNumber,
} from '../loyaltyWallet';
import { type SaveLoyaltyWallet } from '../loyaltyWalletStore';

export const openWalletOnMemberVerified = (
  { saveLoyaltyWallet }: { saveLoyaltyWallet: SaveLoyaltyWallet },
  { data }: MemberVerified,
) => {
  const { cadence, maxRedemptionCount } = tierProgram(data.tier);
  const walletNumber = WalletNumber.random();

  return saveLoyaltyWallet(
    walletNumber,
    openLoyaltyWallet(
      { walletNumber, ownerId: data.memberId, cadence, maxRedemptionCount },
      LoyaltyWallet.initial(),
    ),
  );
};
