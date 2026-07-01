import { type GetMemberTier, type MemberId } from '../../../membership';
import { earnLoyaltyPoints } from '../redemptionWindow';
import { type CurrentWindow } from '../windowLifecycle';
import {
  type CurrentWindowsByOwners,
  type GetRedemptionWindow,
  type RedemptionWindowUpdate,
  type SaveRedemptionWindows,
} from '../redemptionWindowStore';
import { PointsCalculator } from './pointsCalculator';
import { purchaseInformation, type PurchaseRecorded } from './purchase';

export const earnLoyaltyPointsHandler = async (
  {
    currentWindowsByOwners,
    getRedemptionWindow,
    saveRedemptionWindows,
    getMemberTier,
  }: {
    currentWindowsByOwners: CurrentWindowsByOwners;
    getRedemptionWindow: GetRedemptionWindow;
    saveRedemptionWindows: SaveRedemptionWindows;
    getMemberTier: GetMemberTier;
  },
  event: PurchaseRecorded,
): Promise<void> => {
  const { components } = PointsCalculator.calculate(
    purchaseInformation(event, await getMemberTier(event.data.buyer)),
  );

  const openByOwner = new Map<MemberId, CurrentWindow>(
    (await currentWindowsByOwners(components.map(({ member }) => member)))
      .filter((window) => window.open)
      .map((window) => [window.ownerId, window]),
  );

  const updates: RedemptionWindowUpdate[] = [];

  for (const { member, amount } of components) {
    const pointer = openByOwner.get(member);
    if (!pointer) continue;

    const window = await getRedemptionWindow(
      pointer.walletNumber,
      pointer.windowNumber,
    );
    if (window.status !== 'Open') continue;

    const events = earnLoyaltyPoints(
      { walletNumber: pointer.walletNumber, points: amount, at: event.data.at },
      window,
    );
    updates.push({
      walletNumber: pointer.walletNumber,
      windowNumber: pointer.windowNumber,
      events: [events],
    });
  }

  await saveRedemptionWindows(updates);
};
