import { type Brand, type Command, type Event } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import type { MemberId } from '../membership';
import { WalletAccess } from './access';
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
  walletNumber?: never;
}>;

export type ActiveLoyaltyWallet = Readonly<{
  status: 'Active';
  walletNumber: WalletNumber;
  ownerId: MemberId;
  pointsLimit: LoyaltyPointsLimit;
  cadence: RedemptionCadence;
  access: WalletAccess;
}>;

export type DeactivatedLoyaltyWallet = Readonly<{
  status: 'Deactivated';
  walletNumber: WalletNumber;
  ownerId: MemberId;
  pointsLimit: LoyaltyPointsLimit;
  cadence: RedemptionCadence;
  access: WalletAccess;
}>;

export type ClosedLoyaltyWallet = Readonly<{
  status: 'Closed';
  walletNumber: WalletNumber;
}>;

export const LoyaltyWallet = {
  initial: (): NotExistingLoyaltyWallet => ({ status: 'NotExisting' }),
  open: ({
    walletNumber,
    ownerId,
    cadence,
    earnedPoints,
    redeemedPoints,
    maxRedemptionCount,
  }: OpenLoyaltyWallet['data']): ActiveLoyaltyWallet => ({
    status: 'Active',
    walletNumber,
    ownerId,
    cadence,
    access: WalletAccess.of(ownerId),
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

export type LoyaltyWalletOpened = Event<
  'LoyaltyWalletOpened',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    cadence: RedemptionCadence;
    maxRedemptionCount: RedemptionLimit;
    earnedPoints: LoyaltyPoints;
    redeemedPoints: LoyaltyPoints;
  }
>;

export type LoyaltyPointsEarned = Event<
  'LoyaltyPointsEarned',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    points: LoyaltyPoints;
    at: Date;
  }
>;

export type LoyaltyPointsRedeemed = Event<
  'LoyaltyPointsRedeemed',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    byMemberId: MemberId;
    /** Points requested to redeem */
    points: LoyaltyPoints;
    /** Points actually redeemed, based on policy.
     * Undefined if no policy was applied */
    burned?: LoyaltyPoints;
    at: Date;
  }
>;

export type RedemptionWindowReset = Event<
  'RedemptionWindowReset',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    at: Date;
  }
>;

export type RedemptionCadenceSet = Event<
  'RedemptionCadenceSet',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    cadence: RedemptionCadence;
  }
>;

export type WalletAccessGranted = Event<
  'WalletAccessGranted',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    memberId: MemberId;
  }
>;

export type WalletAccessRevoked = Event<
  'WalletAccessRevoked',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    memberId: MemberId;
  }
>;

export type WalletDeactivated = Event<
  'WalletDeactivated',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
  }
>;

export type WalletClosed = Event<
  'WalletClosed',
  {
    walletNumber: WalletNumber;
  }
>;

export type LoyaltyWalletEvent =
  | LoyaltyWalletOpened
  | LoyaltyPointsEarned
  | LoyaltyPointsRedeemed
  | RedemptionWindowReset
  | RedemptionCadenceSet
  | WalletAccessGranted
  | WalletAccessRevoked
  | WalletDeactivated
  | WalletClosed;

export type LoyaltyWalletCommand =
  | OpenLoyaltyWallet
  | EarnLoyaltyPoints
  | RedeemLoyaltyPoints
  | SetRedemptionCadence
  | GrantWalletAccess
  | RevokeWalletAccess
  | ResetRedemptionWindow
  | DeactivateWallet
  | CloseWallet;

export const decide = (
  { type: commandType, data: command }: LoyaltyWalletCommand,
  state: LoyaltyWallet,
): [LoyaltyWallet, ...LoyaltyWalletEvent[]] => {
  switch (commandType) {
    case 'OpenLoyaltyWallet':
      return openLoyaltyWallet(command, state);
    case 'EarnLoyaltyPoints':
      return earnLoyaltyPoints(command, state);
    case 'RedeemLoyaltyPoints':
      return redeemLoyaltyPoints(command, state);
    case 'SetRedemptionCadence':
      return setRedemptionCadence(command, state);
    case 'GrantWalletAccess':
      return grantWalletAccess(command, state);
    case 'RevokeWalletAccess':
      return revokeWalletAccess(command, state);
    case 'ResetRedemptionWindow':
      return resetRedemptionWindow(command, state);
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
    ownerId: MemberId;
    earnedPoints?: LoyaltyPoints;
    redeemedPoints?: LoyaltyPoints;
    maxRedemptionCount: RedemptionLimit;
    cadence: RedemptionCadence;
  }
>;

export const openLoyaltyWallet = (
  command: OpenLoyaltyWallet['data'],
  state: LoyaltyWallet,
): [LoyaltyWallet, ...LoyaltyWalletEvent[]] => {
  if (state.status !== 'NotExisting') return [state];

  const wallet = LoyaltyWallet.open(command);

  return [
    wallet,
    {
      type: 'LoyaltyWalletOpened',
      data: {
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        cadence: wallet.cadence,
        maxRedemptionCount: wallet.pointsLimit.maxRedemptionCount,
        earnedPoints: wallet.pointsLimit.earnedPoints,
        redeemedPoints: wallet.pointsLimit.redeemedPoints,
      },
    },
  ];
};

export type EarnLoyaltyPoints = Command<
  'EarnLoyaltyPoints',
  {
    walletNumber: WalletNumber;
    points: LoyaltyPoints;
    at: Date;
  }
>;

export const earnLoyaltyPoints = (
  command: EarnLoyaltyPoints['data'],
  state: LoyaltyWallet,
): [ActiveLoyaltyWallet, LoyaltyPointsEarned] => {
  const wallet = assertIs(state, 'Active');

  const { points, at } = command;

  return [
    {
      ...wallet,
      pointsLimit: wallet.pointsLimit.earn(points),
    },
    {
      type: 'LoyaltyPointsEarned',
      data: {
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        points,
        at,
      },
    },
  ];
};

export type RedeemLoyaltyPoints = Command<
  'RedeemLoyaltyPoints',
  {
    walletNumber: WalletNumber;
    memberId: MemberId;
    /** Points requested to redeem */
    points: LoyaltyPoints;
    /** Points actually redeemed, based on policy.
     * Undefined if no policy was applied */
    burned?: LoyaltyPoints;
    at: Date;
  }
>;

export const redeemLoyaltyPoints = (
  command: RedeemLoyaltyPoints['data'],
  state: LoyaltyWallet,
): [ActiveLoyaltyWallet, LoyaltyPointsRedeemed] => {
  const wallet = assertIs(state, 'Active');

  const { memberId: accessId, points, at, burned = points } = command;

  if (!wallet.access.has(accessId)) throw new Error('Not authorized to redeem');

  if (wallet.pointsLimit.redemptionsLeft <= 0)
    throw new Error('Redemption window exhausted');

  if (wallet.pointsLimit.availablePoints < burned)
    throw new Error('Not enough points to redeem');

  return [
    {
      ...wallet,
      pointsLimit: wallet.pointsLimit.redeem(burned),
    },
    {
      type: 'LoyaltyPointsRedeemed',
      data: {
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        byMemberId: accessId,
        points,
        burned,
        at,
      },
    },
  ];
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
): [ActiveLoyaltyWallet, RedemptionCadenceSet] => {
  const wallet = assertIs(state, 'Active');

  const { cadence } = command;

  return [
    {
      ...wallet,
      cadence,
    },
    {
      type: 'RedemptionCadenceSet',
      data: {
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        cadence,
      },
    },
  ];
};

export type GrantWalletAccess = Command<
  'GrantWalletAccess',
  {
    walletNumber: WalletNumber;
    memberId: MemberId;
  }
>;

export const grantWalletAccess = (
  command: GrantWalletAccess['data'],
  state: LoyaltyWallet,
): [ActiveLoyaltyWallet, WalletAccessGranted] => {
  const wallet = assertIs(state, 'Active');

  return [
    {
      ...wallet,
      access: wallet.access.add(command.memberId),
    },
    {
      type: 'WalletAccessGranted',
      data: {
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        memberId: command.memberId,
      },
    },
  ];
};

export type RevokeWalletAccess = Command<
  'RevokeWalletAccess',
  {
    walletNumber: WalletNumber;
    memberId: MemberId;
  }
>;

export const revokeWalletAccess = (
  command: RevokeWalletAccess['data'],
  state: LoyaltyWallet,
): [ActiveLoyaltyWallet, WalletAccessRevoked] => {
  const wallet = assertIs(state, 'Active');

  return [
    {
      ...wallet,
      access: wallet.access.revoke(command.memberId),
    },
    {
      type: 'WalletAccessRevoked',
      data: {
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        memberId: command.memberId,
      },
    },
  ];
};

export type ResetRedemptionWindow = Command<
  'ResetRedemptionWindow',
  {
    walletNumber: WalletNumber;
    at: Date;
  }
>;

export const resetRedemptionWindow = (
  command: ResetRedemptionWindow['data'],
  state: LoyaltyWallet,
): [ActiveLoyaltyWallet, RedemptionWindowReset] => {
  const wallet = assertIs(state, 'Active');

  return [
    {
      ...wallet,
      pointsLimit: wallet.pointsLimit.resetRedemptionCount(),
    },
    {
      type: 'RedemptionWindowReset',
      data: {
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        at: command.at,
      },
    },
  ];
};

export type DeactivateWallet = Command<
  'DeactivateWallet',
  {
    walletNumber: WalletNumber;
  }
>;

export const deactivateWallet = (
  state: LoyaltyWallet,
):
  | [DeactivatedLoyaltyWallet]
  | [DeactivatedLoyaltyWallet, WalletDeactivated] => {
  if (state.status === 'Deactivated') return [state];

  const wallet = assertIs(state, 'Active');

  return [
    {
      ...wallet,
      status: 'Deactivated',
    },
    {
      type: 'WalletDeactivated',
      data: { walletNumber: wallet.walletNumber, ownerId: wallet.ownerId },
    },
  ];
};

export type CloseWallet = Command<
  'CloseWallet',
  {
    walletNumber: WalletNumber;
  }
>;

export const closeWallet = (
  state: LoyaltyWallet,
): [ClosedLoyaltyWallet] | [ClosedLoyaltyWallet, WalletClosed] => {
  if (state.status === 'Closed') return [state];
  if (state.status === 'NotExisting') throw new Error("Wallet doesn't exist");

  return [
    {
      status: 'Closed',
      walletNumber: state.walletNumber,
    },
    {
      type: 'WalletClosed',
      data: { walletNumber: state.walletNumber },
    },
  ];
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
