import {
  type LoyaltyWalletEvent,
  setRedemptionCadence,
  type SetRedemptionCadence,
} from '../loyaltyWallet';
import {
  type GetLoyaltyWallet,
  type SaveLoyaltyWallet,
} from '../loyaltyWalletStore';

export const setRedemptionCadenceHandler = async (
  {
    getLoyaltyWallet,
    saveLoyaltyWallet,
  }: {
    getLoyaltyWallet: GetLoyaltyWallet;
    saveLoyaltyWallet: SaveLoyaltyWallet;
  },
  { data: command }: SetRedemptionCadence,
): Promise<LoyaltyWalletEvent[]> => {
  const wallet = await getLoyaltyWallet(command.walletNumber);

  const cadenceSet = setRedemptionCadence(command, wallet);
  await saveLoyaltyWallet(command.walletNumber, cadenceSet);

  return [cadenceSet];
};
