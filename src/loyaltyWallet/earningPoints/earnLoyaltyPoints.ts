import { type GetMemberTier, type MemberId } from '../../membership';
import { type ActiveLoyaltyWallet, earnLoyaltyPoints } from '../loyaltyWallet';
import {
  type FindLoyaltyWalletsByOwners,
  type SaveLoyaltyWallets,
} from '../loyaltyWalletStore';
import { PointsCalculator } from './pointsCalculator';
import { purchaseInformation, type PurchaseRecorded } from './purchase';

export const earnLoyaltyPointsHandler = async (
  {
    findLoyaltyWalletsByOwners,
    saveLoyaltyWallets,
    getMemberTier,
  }: {
    findLoyaltyWalletsByOwners: FindLoyaltyWalletsByOwners;
    saveLoyaltyWallets: SaveLoyaltyWallets;
    getMemberTier: GetMemberTier;
  },
  event: PurchaseRecorded,
) => {
  const { components } = PointsCalculator.calculate(
    purchaseInformation(event, await getMemberTier(event.data.buyer)),
  );

  const found = await findLoyaltyWalletsByOwners(
    components.map(({ member }) => member),
  );

  const activeByOwner = new Map<MemberId, ActiveLoyaltyWallet>(
    found
      .filter((wallet) => wallet.status === 'Active')
      .map((wallet) => [wallet.ownerId, wallet]),
  );

  const updates = components.flatMap(({ member, amount }) => {
    const wallet = activeByOwner.get(member);

    if (!wallet) return [];

    return [
      earnLoyaltyPoints(
        { walletNumber: wallet.walletNumber, points: amount },
        wallet,
      ),
    ];
  });

  await saveLoyaltyWallets(updates);
};
