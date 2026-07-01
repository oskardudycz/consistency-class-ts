import { type GetMemberTier } from '../../../membership';
import {
  redeemLoyaltyPoints,
  type RedeemLoyaltyPoints,
} from '../redemptionWindow';
import {
  type CurrentWindowOf,
  type GetRedemptionWindow,
  type SaveRedemptionWindow,
} from '../redemptionWindowStore';
import { BenefitPolicy } from './benefitPolicy';

export const redeemLoyaltyPointsHandler = async (
  {
    currentWindowOf,
    getRedemptionWindow,
    saveRedemptionWindow,
    getMemberTier,
  }: {
    currentWindowOf: CurrentWindowOf;
    getRedemptionWindow: GetRedemptionWindow;
    saveRedemptionWindow: SaveRedemptionWindow;
    getMemberTier: GetMemberTier;
  },
  { data: command }: RedeemLoyaltyPoints,
): Promise<void> => {
  const pointer = await currentWindowOf(command.walletNumber);
  if (!pointer) throw new Error('Redemption window is not open');

  const window = await getRedemptionWindow(
    pointer.walletNumber,
    pointer.windowNumber,
  );

  const burned = BenefitPolicy.apply(
    command.points,
    await getMemberTier(pointer.ownerId),
  );

  const events = redeemLoyaltyPoints({ ...command, burned }, window);
  await saveRedemptionWindow(
    pointer.walletNumber,
    pointer.windowNumber,
    events,
  );
};
