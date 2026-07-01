import { type RedemptionWindowProgressed } from '../../loyaltyWallet';
import { openRedemptionWindow } from '../redemptionWindow';
import {
  type GetRedemptionWindow,
  type SaveRedemptionWindow,
} from '../redemptionWindowStore';

export const openRedemptionWindowOnProgressed = async (
  {
    getRedemptionWindow,
    saveRedemptionWindow,
  }: {
    getRedemptionWindow: GetRedemptionWindow;
    saveRedemptionWindow: SaveRedemptionWindow;
  },
  { data: event }: RedemptionWindowProgressed,
): Promise<void> => {
  const { walletNumber, windowNumber } = event;

  const window = await getRedemptionWindow(walletNumber, windowNumber);

  const events = openRedemptionWindow(
    {
      walletNumber,
      ownerId: event.ownerId,
      windowNumber,
      openingBalance: event.openingBalance,
      maxRedemptionCount: event.maxRedemptionCount,
      access: event.access,
    },
    window,
  );

  await saveRedemptionWindow(walletNumber, windowNumber, events, {
    requireNew: true,
  });
};
