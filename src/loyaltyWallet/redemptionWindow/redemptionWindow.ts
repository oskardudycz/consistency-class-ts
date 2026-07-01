import { type Command, type Event } from '@event-driven-io/emmett';
import { type MemberId } from '../../membership';
import { WalletAccess } from '../access';
import {
  LoyaltyPoints,
  LoyaltyPointsLimit,
  RedemptionLimit,
} from '../loyaltyPoints';
import { type WalletNumber } from '../loyaltyWallet';

export const redemptionWindowStream = (
  walletNumber: WalletNumber,
  windowNumber: number,
): string => `redemptionWindow-${walletNumber}-${windowNumber}`;

export type RedemptionWindow =
  | NotOpenedRedemptionWindow
  | OpenRedemptionWindow
  | ClosedRedemptionWindow;

export type NotOpenedRedemptionWindow = Readonly<{
  status: 'NotOpened';
}>;

export type OpenRedemptionWindow = Readonly<{
  status: 'Open';
  walletNumber: WalletNumber;
  ownerId: MemberId;
  windowNumber: number;
  openingBalance: LoyaltyPoints;
  pointsLimit: LoyaltyPointsLimit;
  access: WalletAccess;
}>;

export type ClosedRedemptionWindow = Readonly<{
  status: 'Closed';
  walletNumber: WalletNumber;
  ownerId: MemberId;
  windowNumber: number;
  closingBalance: LoyaltyPoints;
  redemptionCount: RedemptionLimit;
}>;

export const RedemptionWindow = {
  initial: (): NotOpenedRedemptionWindow => ({ status: 'NotOpened' }),
} as const;

export const availableBalance = (window: OpenRedemptionWindow): LoyaltyPoints =>
  LoyaltyPoints.of(window.openingBalance + window.pointsLimit.availablePoints);

export const redemptionsLeft = (
  window: OpenRedemptionWindow,
): RedemptionLimit => window.pointsLimit.redemptionsLeft;

export type RedemptionWindowOpened = Event<
  'RedemptionWindowOpened',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    openingBalance: LoyaltyPoints;
    maxRedemptionCount: RedemptionLimit;
    access: MemberId[];
  }
>;

export type LoyaltyPointsEarned = Event<
  'LoyaltyPointsEarned',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    points: LoyaltyPoints;
    at: Date;
  }
>;

export type LoyaltyPointsRedeemed = Event<
  'LoyaltyPointsRedeemed',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    byMemberId: MemberId;
    /** Points requested to redeem */
    points: LoyaltyPoints;
    /** Points actually redeemed, based on policy.
     * Undefined if no policy was applied */
    burned?: LoyaltyPoints;
    at: Date;
  }
>;

export type WindowAccessGranted = Event<
  'WindowAccessGranted',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    memberId: MemberId;
  }
>;

export type WindowAccessRevoked = Event<
  'WindowAccessRevoked',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    memberId: MemberId;
  }
>;

export type RedemptionWindowClosed = Event<
  'RedemptionWindowClosed',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    closingBalance: LoyaltyPoints;
    redemptionCount: RedemptionLimit;
    hadActivity: boolean;
    closedAt: Date;
  }
>;

export type RedemptionWindowEvent =
  | RedemptionWindowOpened
  | LoyaltyPointsEarned
  | LoyaltyPointsRedeemed
  | WindowAccessGranted
  | WindowAccessRevoked
  | RedemptionWindowClosed;

export type RedemptionWindowCommand =
  | OpenRedemptionWindowCommand
  | EarnLoyaltyPoints
  | RedeemLoyaltyPoints
  | GrantWindowAccess
  | RevokeWindowAccess
  | CloseRedemptionWindow;

export const evolve = (
  state: RedemptionWindow,
  { type: eventType, data: event }: RedemptionWindowEvent,
): RedemptionWindow => {
  switch (eventType) {
    case 'RedemptionWindowOpened':
      if (state.status !== 'NotOpened') return state;
      return {
        status: 'Open',
        walletNumber: event.walletNumber,
        ownerId: event.ownerId,
        windowNumber: event.windowNumber,
        openingBalance: event.openingBalance,
        pointsLimit: LoyaltyPointsLimit.initial({
          maxRedemptionCount: event.maxRedemptionCount,
        }),
        access: WalletAccess.of(...event.access),
      };

    case 'LoyaltyPointsEarned':
      if (state.status !== 'Open') return state;
      return { ...state, pointsLimit: state.pointsLimit.earn(event.points) };

    case 'LoyaltyPointsRedeemed':
      if (state.status !== 'Open') return state;
      return {
        ...state,
        pointsLimit: state.pointsLimit.redeem(event.burned ?? event.points),
      };

    case 'WindowAccessGranted':
      if (state.status !== 'Open') return state;
      return { ...state, access: state.access.add(event.memberId) };

    case 'WindowAccessRevoked':
      if (state.status !== 'Open') return state;
      return { ...state, access: state.access.revoke(event.memberId) };

    case 'RedemptionWindowClosed':
      if (state.status !== 'Open') return state;
      return {
        status: 'Closed',
        walletNumber: state.walletNumber,
        ownerId: state.ownerId,
        windowNumber: state.windowNumber,
        closingBalance: event.closingBalance,
        redemptionCount: event.redemptionCount,
      };

    default: {
      const _exhaustiveCheck: never = eventType;
      return state;
    }
  }
};

export const decide = (
  { type: commandType, data: command }: RedemptionWindowCommand,
  state: RedemptionWindow,
): RedemptionWindowEvent | RedemptionWindowEvent[] => {
  switch (commandType) {
    case 'OpenRedemptionWindow':
      return openRedemptionWindow(command, state);
    case 'EarnLoyaltyPoints':
      return earnLoyaltyPoints(command, state);
    case 'RedeemLoyaltyPoints':
      return redeemLoyaltyPoints(command, state);
    case 'GrantWindowAccess':
      return grantWindowAccess(command, state);
    case 'RevokeWindowAccess':
      return revokeWindowAccess(command, state);
    case 'CloseRedemptionWindow':
      return closeRedemptionWindow(command, state);
  }
};

export type OpenRedemptionWindowCommand = Command<
  'OpenRedemptionWindow',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    openingBalance: LoyaltyPoints;
    maxRedemptionCount: RedemptionLimit;
    access: MemberId[];
  }
>;

export const openRedemptionWindow = (
  command: OpenRedemptionWindowCommand['data'],
  state: RedemptionWindow,
): RedemptionWindowOpened | [] => {
  if (state.status !== 'NotOpened') return [];

  return {
    type: 'RedemptionWindowOpened',
    data: {
      walletNumber: command.walletNumber,
      ownerId: command.ownerId,
      windowNumber: command.windowNumber,
      openingBalance: command.openingBalance,
      maxRedemptionCount: command.maxRedemptionCount,
      access: command.access,
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
  state: RedemptionWindow,
): LoyaltyPointsEarned => {
  const window = assertIs(state, 'Open');

  return {
    type: 'LoyaltyPointsEarned',
    data: {
      walletNumber: window.walletNumber,
      ownerId: window.ownerId,
      windowNumber: window.windowNumber,
      points: command.points,
      at: command.at,
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
  state: RedemptionWindow,
): LoyaltyPointsRedeemed => {
  const window = assertIs(state, 'Open');

  const { memberId: accessId, points, at, burned = points } = command;

  if (!window.access.has(accessId)) throw new Error('Not authorized to redeem');

  if (window.pointsLimit.redemptionsLeft <= 0)
    throw new Error('Redemption window exhausted');

  if (availableBalance(window) < burned)
    throw new Error('Not enough points to redeem');

  return {
    type: 'LoyaltyPointsRedeemed',
    data: {
      walletNumber: window.walletNumber,
      ownerId: window.ownerId,
      windowNumber: window.windowNumber,
      byMemberId: accessId,
      points,
      burned,
      at,
    },
  };
};

export type GrantWindowAccess = Command<
  'GrantWindowAccess',
  {
    walletNumber: WalletNumber;
    memberId: MemberId;
  }
>;

export const grantWindowAccess = (
  command: GrantWindowAccess['data'],
  state: RedemptionWindow,
): WindowAccessGranted | [] => {
  if (state.status !== 'Open') return [];

  return {
    type: 'WindowAccessGranted',
    data: {
      walletNumber: state.walletNumber,
      ownerId: state.ownerId,
      windowNumber: state.windowNumber,
      memberId: command.memberId,
    },
  };
};

export type RevokeWindowAccess = Command<
  'RevokeWindowAccess',
  {
    walletNumber: WalletNumber;
    memberId: MemberId;
  }
>;

export const revokeWindowAccess = (
  command: RevokeWindowAccess['data'],
  state: RedemptionWindow,
): WindowAccessRevoked | [] => {
  if (state.status !== 'Open') return [];

  return {
    type: 'WindowAccessRevoked',
    data: {
      walletNumber: state.walletNumber,
      ownerId: state.ownerId,
      windowNumber: state.windowNumber,
      memberId: command.memberId,
    },
  };
};

export type CloseRedemptionWindow = Command<
  'CloseRedemptionWindow',
  {
    walletNumber: WalletNumber;
    closedAt: Date;
  }
>;

export const closeRedemptionWindow = (
  command: CloseRedemptionWindow['data'],
  state: RedemptionWindow,
): RedemptionWindowClosed | [] => {
  if (state.status !== 'Open') return [];

  const hadActivity =
    state.pointsLimit.earnedPoints > 0 || state.pointsLimit.redemptionCount > 0;

  return {
    type: 'RedemptionWindowClosed',
    data: {
      walletNumber: state.walletNumber,
      ownerId: state.ownerId,
      windowNumber: state.windowNumber,
      closingBalance: availableBalance(state),
      redemptionCount: state.pointsLimit.redemptionCount,
      hadActivity,
      closedAt: command.closedAt,
    },
  };
};

const assertIs = <Status extends RedemptionWindow['status']>(
  window: RedemptionWindow,
  status: Status,
): Extract<RedemptionWindow, { status: Status }> => {
  if (window.status === status)
    return window as Extract<RedemptionWindow, { status: Status }>;

  switch (window.status) {
    case 'NotOpened':
      throw new Error('Redemption window is not open');
    case 'Open':
      throw new Error('Redemption window is already open');
    case 'Closed':
      throw new Error('Redemption window is closed');
  }
};
