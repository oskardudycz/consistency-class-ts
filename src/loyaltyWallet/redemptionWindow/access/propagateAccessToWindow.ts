import {
  type WalletAccessGranted,
  type WalletAccessRevoked,
} from '../../loyaltyWallet';
import { grantWindowAccess, revokeWindowAccess } from '../redemptionWindow';
import {
  type CurrentWindowOf,
  type GetRedemptionWindow,
  type SaveRedemptionWindow,
} from '../redemptionWindowStore';

export const propagateAccessToWindow = async (
  {
    currentWindowOf,
    getRedemptionWindow,
    saveRedemptionWindow,
  }: {
    currentWindowOf: CurrentWindowOf;
    getRedemptionWindow: GetRedemptionWindow;
    saveRedemptionWindow: SaveRedemptionWindow;
  },
  { type, data: event }: WalletAccessGranted | WalletAccessRevoked,
): Promise<void> => {
  const pointer = await currentWindowOf(event.walletNumber);
  if (!pointer) return;

  const window = await getRedemptionWindow(
    event.walletNumber,
    pointer.windowNumber,
  );

  const command = {
    walletNumber: event.walletNumber,
    memberId: event.memberId,
  };
  const events =
    type === 'WalletAccessGranted'
      ? grantWindowAccess(command, window)
      : revokeWindowAccess(command, window);

  await saveRedemptionWindow(event.walletNumber, pointer.windowNumber, events);
};
