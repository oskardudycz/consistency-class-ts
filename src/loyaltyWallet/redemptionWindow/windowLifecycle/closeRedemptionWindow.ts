import {
  closeRedemptionWindow,
  type CloseRedemptionWindow,
} from '../redemptionWindow';
import {
  type CurrentWindowOf,
  type GetRedemptionWindow,
  type SaveRedemptionWindow,
} from '../redemptionWindowStore';

export const closeRedemptionWindowHandler = async (
  {
    currentWindowOf,
    getRedemptionWindow,
    saveRedemptionWindow,
  }: {
    currentWindowOf: CurrentWindowOf;
    getRedemptionWindow: GetRedemptionWindow;
    saveRedemptionWindow: SaveRedemptionWindow;
  },
  { data: command }: CloseRedemptionWindow,
): Promise<void> => {
  const pointer = await currentWindowOf(command.walletNumber);
  if (!pointer) return;

  const window = await getRedemptionWindow(
    command.walletNumber,
    pointer.windowNumber,
  );

  const events = closeRedemptionWindow(command, window);
  await saveRedemptionWindow(
    command.walletNumber,
    pointer.windowNumber,
    events,
  );
};
