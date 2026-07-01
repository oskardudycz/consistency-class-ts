import { type MemberVerified, tierProgram } from '../../membership';
import {
  LoyaltyWallet,
  openLoyaltyWallet,
  WalletNumber,
} from '../loyaltyWallet';
import { type SaveLoyaltyWallet } from '../loyaltyWalletStore';

export const openWalletOnMemberVerified = async (
  { saveLoyaltyWallet }: { saveLoyaltyWallet: SaveLoyaltyWallet },
  { data }: MemberVerified,
): Promise<void> => {
  const { cadence, maxRedemptionCount } = tierProgram(data.tier);
  const walletNumber = WalletNumber.forOwner(data.memberId);

  const events = openLoyaltyWallet(
    { walletNumber, ownerId: data.memberId, cadence, maxRedemptionCount },
    LoyaltyWallet.initial(),
  );

  await saveLoyaltyWallet(walletNumber, events);
};
