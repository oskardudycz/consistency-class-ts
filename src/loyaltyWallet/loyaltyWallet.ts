import { type Brand, type Command } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import {
  type LoyaltyPoints,
  LoyaltyPointsLimit,
  type RedemptionLimit,
} from './loyaltyPoints';

export type LoyaltyWallet =
  | NotExistingLoyaltyWallet
  | ActiveLoyaltyWallet
  | DeactivatedLoyaltyWallet
  | ClosedLoyaltyWallet;

export type NotExistingLoyaltyWallet = Readonly<{
  status: 'NotExisting';
}>;

export type ActiveLoyaltyWallet = Readonly<{
  status: 'Active';
  walletNumber: WalletNumber;
  pointsLimit: LoyaltyPointsLimit;
  cadence: RedemptionCadence;
}>;

export type DeactivatedLoyaltyWallet = Readonly<{
  status: 'Deactivated';
  walletNumber: WalletNumber;
  pointsLimit: LoyaltyPointsLimit;
  cadence: RedemptionCadence;
}>;

export type ClosedLoyaltyWallet = Readonly<{
  status: 'Closed';
}>;

export const LoyaltyWallet = {
  initial: (): NotExistingLoyaltyWallet => ({ status: 'NotExisting' }),
  open: ({
    walletNumber,
    cadence,
    earnedPoints,
    redeemedPoints,
    maxRedemptionCount,
  }: OpenLoyaltyWallet['data']): ActiveLoyaltyWallet => ({
    status: 'Active',
    walletNumber,
    cadence,
    pointsLimit: LoyaltyPointsLimit.initial({
      earnedPoints,
      redeemedPoints,
      maxRedemptionCount,
    }),
  }),
} as const;

export type WalletNumber = Brand<string, 'WalletNumber'>;
export const WalletNumber = {
  of: (value: string): WalletNumber => value as WalletNumber,
  random: (): WalletNumber => randomUUID() as WalletNumber,
} as const;

export type RedemptionCadence = 'Weekly' | 'Monthly';

export type LoyaltyWalletCommand =
  | OpenLoyaltyWallet
  | EarnLoyaltyPoints
  | RedeemLoyaltyPoints
  | SetRedemptionCadence
  | ResetRedemptionWindow
  | DeactivateWallet
  | CloseWallet;

export const decide = (
  { type: commandType, data: command }: LoyaltyWalletCommand,
  state: LoyaltyWallet,
): LoyaltyWallet => {
  switch (commandType) {
    case 'OpenLoyaltyWallet':
      return openLoyaltyWallet(command, state);
    case 'EarnLoyaltyPoints':
      return earnLoyaltyPoints(command, state);
    case 'RedeemLoyaltyPoints':
      return redeemLoyaltyPoints(command, state);
    case 'SetRedemptionCadence':
      return setRedemptionCadence(command, state);
    case 'ResetRedemptionWindow':
      return resetRedemptionWindow(state);
    case 'DeactivateWallet':
      return deactivateWallet(state);
    case 'CloseWallet':
      return closeWallet(state);
  }
};

export type OpenLoyaltyWallet = Command<
  'OpenLoyaltyWallet',
  {
    walletNumber: WalletNumber;
    earnedPoints?: LoyaltyPoints;
    redeemedPoints?: LoyaltyPoints;
    maxRedemptionCount: RedemptionLimit;
    cadence: RedemptionCadence;
  }
>;

export const openLoyaltyWallet = (
  command: OpenLoyaltyWallet['data'],
  state: LoyaltyWallet,
): LoyaltyWallet =>
  state.status === 'NotExisting' ? LoyaltyWallet.open(command) : state;

export type EarnLoyaltyPoints = Command<
  'EarnLoyaltyPoints',
  {
    walletNumber: WalletNumber;
    points: LoyaltyPoints;
  }
>;

export const earnLoyaltyPoints = (
  command: EarnLoyaltyPoints['data'],
  state: LoyaltyWallet,
): ActiveLoyaltyWallet => {
  const wallet = assertIs(state, 'Active');

  const { points } = command;

  return {
    ...wallet,
    pointsLimit: wallet.pointsLimit.earn(points),
  };
};

export type RedeemLoyaltyPoints = Command<
  'RedeemLoyaltyPoints',
  {
    walletNumber: WalletNumber;
    points: LoyaltyPoints;
  }
>;

export const redeemLoyaltyPoints = (
  command: RedeemLoyaltyPoints['data'],
  state: LoyaltyWallet,
): ActiveLoyaltyWallet => {
  const wallet = assertIs(state, 'Active');

  const { points } = command;

  if (wallet.pointsLimit.redemptionsLeft <= 0)
    throw new Error('Redemption window exhausted');

  if (wallet.pointsLimit.availablePoints < points)
    throw new Error('Not enough points to redeem');

  return {
    ...wallet,
    pointsLimit: wallet.pointsLimit.redeem(points),
  };
};

export type SetRedemptionCadence = Command<
  'SetRedemptionCadence',
  {
    walletNumber: WalletNumber;
    cadence: RedemptionCadence;
  }
>;

export const setRedemptionCadence = (
  command: SetRedemptionCadence['data'],
  state: LoyaltyWallet,
): ActiveLoyaltyWallet => {
  const wallet = assertIs(state, 'Active');

  const { cadence } = command;

  return {
    ...wallet,
    cadence,
  };
};

export type ResetRedemptionWindow = Command<
  'ResetRedemptionWindow',
  {
    walletNumber: WalletNumber;
  }
>;

export const resetRedemptionWindow = (
  state: LoyaltyWallet,
): ActiveLoyaltyWallet => {
  const wallet = assertIs(state, 'Active');

  return {
    ...wallet,
    pointsLimit: wallet.pointsLimit.resetRedemptionCount(),
  };
};

export type DeactivateWallet = Command<
  'DeactivateWallet',
  {
    walletNumber: WalletNumber;
  }
>;

export const deactivateWallet = (
  state: LoyaltyWallet,
): DeactivatedLoyaltyWallet => {
  if (state.status === 'Deactivated') return state;

  const wallet = assertIs(state, 'Active');

  return {
    ...wallet,
    status: 'Deactivated',
  };
};

export type CloseWallet = Command<
  'CloseWallet',
  {
    walletNumber: WalletNumber;
  }
>;

export const closeWallet = (state: LoyaltyWallet): ClosedLoyaltyWallet => {
  if (state.status === 'Closed') return state;
  if (state.status === 'NotExisting') throw new Error("Wallet doesn't exist");

  return {
    status: 'Closed',
  };
};

const assertIs = <Status extends LoyaltyWallet['status']>(
  wallet: LoyaltyWallet,
  status: Status,
): Extract<LoyaltyWallet, { status: Status }> => {
  if (wallet.status === status)
    return wallet as Extract<LoyaltyWallet, { status: Status }>;

  switch (wallet.status) {
    case 'NotExisting':
      throw new Error("Wallet doesn't exist");
    case 'Active':
      throw new Error('Wallet exists');
    case 'Deactivated':
      throw new Error('Wallet is not active');
    case 'Closed':
      throw new Error('Wallet is closed');
  }
};
