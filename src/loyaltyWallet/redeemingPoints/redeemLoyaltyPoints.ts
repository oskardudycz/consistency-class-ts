import { type GetMemberTier } from '../../membership';
import {
  redeemLoyaltyPoints,
  type RedeemLoyaltyPoints,
} from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';
import { BenefitPolicy } from './benefitPolicy';

export const redeemLoyaltyPointsHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
    getMemberTier,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
    getMemberTier: GetMemberTier;
  },
  { data: command }: RedeemLoyaltyPoints,
) => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const burned =
    wallet.status === 'Active'
      ? BenefitPolicy.apply(command.points, await getMemberTier(wallet.ownerId))
      : command.points;

  const [state, ...events] = redeemLoyaltyPoints(
    { ...command, burned },
    wallet,
  );

  await saveLoyaltyWallet(state, events);
};
