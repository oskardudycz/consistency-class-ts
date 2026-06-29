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
) => {
  const { cadence, maxRedemptionCount } = tierProgram(data.tier);
  const walletNumber = WalletNumber.random();

  const [state, ...events] = openLoyaltyWallet(
    { walletNumber, ownerId: data.memberId, cadence, maxRedemptionCount },
    LoyaltyWallet.initial(),
  );

  await saveLoyaltyWallet(state, events);
};
