import { type Brand, type Command, type Event } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import type { MemberId } from '../membership';
import { WalletAccess } from './access';
import {
  type LoyaltyPoints,
  LoyaltyPointsLimit,
  RedemptionLimit,
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

export const evolve = (
  state: LoyaltyWallet,
  { type: eventType, data: event }: LoyaltyWalletEvent,
): LoyaltyWallet => {
  switch (eventType) {
    case 'LoyaltyWalletOpened':
      if (state.status !== 'NotExisting') return state;
      return {
        status: 'Active',
        walletNumber: event.walletNumber,
        ownerId: event.ownerId,
        cadence: event.cadence,
        access: WalletAccess.of(event.ownerId),
        pointsLimit: LoyaltyPointsLimit.initial({
          earnedPoints: event.earnedPoints,
          redeemedPoints: event.redeemedPoints,
          redemptionCount: RedemptionLimit.ZERO,
          maxRedemptionCount: event.maxRedemptionCount,
        }),
      };

    case 'LoyaltyPointsEarned':
      if (state.status !== 'Active') return state;
      return {
        ...state,
        pointsLimit: state.pointsLimit.earn(event.points),
      };

    case 'LoyaltyPointsRedeemed':
      if (state.status !== 'Active') return state;
      return {
        ...state,
        // Using `burned` if a policy was applied, otherwise fallback to requested `points`
        pointsLimit: state.pointsLimit.redeem(event.burned ?? event.points),
      };

    case 'RedemptionWindowReset':
      if (state.status !== 'Active') return state;
      return {
        ...state,
        pointsLimit: state.pointsLimit.resetRedemptionCount(),
      };

    case 'RedemptionCadenceSet':
      if (state.status === 'NotExisting' || state.status === 'Closed')
        return state;
      return {
        ...state,
        cadence: event.cadence,
      };

    case 'WalletAccessGranted':
      if (state.status === 'NotExisting' || state.status === 'Closed')
        return state;
      return {
        ...state,
        access: state.access.add(event.memberId),
      };

    case 'WalletAccessRevoked':
      if (state.status === 'NotExisting' || state.status === 'Closed')
        return state;
      return {
        ...state,
        access: state.access.revoke(event.memberId),
      };

    case 'WalletDeactivated':
      if (state.status !== 'Active') return state;
      return {
        ...state,
        status: 'Deactivated',
      };

    case 'WalletClosed':
      return {
        status: 'Closed',
        walletNumber: event.walletNumber,
      };

    default: {
      const _exhaustiveCheck: never = eventType;
      return state;
    }
  }
};

export const decide = (
  { type: commandType, data: command }: LoyaltyWalletCommand,
  state: LoyaltyWallet,
): LoyaltyWalletEvent | LoyaltyWalletEvent[] => {
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
): LoyaltyWalletOpened | [] => {
  if (state.status !== 'NotExisting') return [];

  const wallet = LoyaltyWallet.open(command);

  return {
    type: 'LoyaltyWalletOpened',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      cadence: wallet.cadence,
      maxRedemptionCount: wallet.pointsLimit.maxRedemptionCount,
      earnedPoints: wallet.pointsLimit.earnedPoints,
      redeemedPoints: wallet.pointsLimit.redeemedPoints,
    },
  };
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
): LoyaltyPointsEarned => {
  const wallet = assertIs(state, 'Active');

  const { points, at } = command;

  return {
    type: 'LoyaltyPointsEarned',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      points,
      at,
    },
  };
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
): LoyaltyPointsRedeemed => {
  const wallet = assertIs(state, 'Active');

  const { memberId: accessId, points, at, burned = points } = command;

  if (!wallet.access.has(accessId)) throw new Error('Not authorized to redeem');

  if (wallet.pointsLimit.redemptionsLeft <= 0)
    throw new Error('Redemption window exhausted');

  if (wallet.pointsLimit.availablePoints < burned)
    throw new Error('Not enough points to redeem');

  return {
    type: 'LoyaltyPointsRedeemed',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      byMemberId: accessId,
      points,
      burned,
      at,
    },
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
): RedemptionCadenceSet => {
  const wallet = assertIs(state, 'Active');

  const { cadence } = command;

  return {
    type: 'RedemptionCadenceSet',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      cadence,
    },
  };
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
): WalletAccessGranted => {
  const wallet = assertIs(state, 'Active');

  return {
    type: 'WalletAccessGranted',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      memberId: command.memberId,
    },
  };
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
): WalletAccessRevoked => {
  const wallet = assertIs(state, 'Active');

  return {
    type: 'WalletAccessRevoked',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      memberId: command.memberId,
    },
  };
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
): RedemptionWindowReset => {
  const wallet = assertIs(state, 'Active');

  return {
    type: 'RedemptionWindowReset',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      at: command.at,
    },
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
): WalletDeactivated | [] => {
  if (state.status === 'Deactivated') return [];

  const wallet = assertIs(state, 'Active');

  return {
    type: 'WalletDeactivated',
    data: { walletNumber: wallet.walletNumber, ownerId: wallet.ownerId },
  };
};

export type CloseWallet = Command<
  'CloseWallet',
  {
    walletNumber: WalletNumber;
  }
>;

export const closeWallet = (state: LoyaltyWallet): WalletClosed | [] => {
  if (state.status === 'Closed') return [];
  if (state.status === 'NotExisting') throw new Error("Wallet doesn't exist");

  return {
    type: 'WalletClosed',
    data: { walletNumber: state.walletNumber },
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
