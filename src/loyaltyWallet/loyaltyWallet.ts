import { type Brand, type Command, type Event } from '@event-driven-io/emmett';
import { randomUUID } from 'node:crypto';
import type { MemberId } from '../membership';
import { WalletAccess } from './access';
import { LoyaltyPoints, type RedemptionLimit } from './loyaltyPoints';

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
  cadence: RedemptionCadence;
  maxRedemptionCount: RedemptionLimit;
  currentWindowNumber: number;
  access: WalletAccess;
}>;

export type DeactivatedLoyaltyWallet = Readonly<{
  status: 'Deactivated';
  walletNumber: WalletNumber;
  ownerId: MemberId;
  cadence: RedemptionCadence;
  maxRedemptionCount: RedemptionLimit;
  currentWindowNumber: number;
  access: WalletAccess;
}>;

export type ClosedLoyaltyWallet = Readonly<{
  status: 'Closed';
  walletNumber: WalletNumber;
}>;

export const LoyaltyWallet = {
  initial: (): NotExistingLoyaltyWallet => ({ status: 'NotExisting' }),
} as const;

export type WalletNumber = Brand<string, 'WalletNumber'>;
export const WalletNumber = {
  of: (value: string): WalletNumber => value as WalletNumber,
  random: (): WalletNumber => randomUUID() as WalletNumber,
  forOwner: (ownerId: MemberId): WalletNumber =>
    WalletNumber.of(`wallet-${ownerId}}`),
} as const;

export type RedemptionCadence = 'Weekly' | 'Monthly';

export type LoyaltyWalletOpened = Event<
  'LoyaltyWalletOpened',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    cadence: RedemptionCadence;
    maxRedemptionCount: RedemptionLimit;
  }
>;

export type RedemptionWindowProgressed = Event<
  'RedemptionWindowProgressed',
  {
    walletNumber: WalletNumber;
    ownerId: MemberId;
    windowNumber: number;
    openingBalance: LoyaltyPoints;
    maxRedemptionCount: RedemptionLimit;
    access: MemberId[];
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
    memberId: MemberId;
  }
>;

export type WalletAccessRevoked = Event<
  'WalletAccessRevoked',
  {
    walletNumber: WalletNumber;
    memberId: MemberId;
  }
>;

export type WalletDeactivated = Event<
  'WalletDeactivated',
  {
    walletNumber: WalletNumber;
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
  | RedemptionWindowProgressed
  | RedemptionCadenceSet
  | WalletAccessGranted
  | WalletAccessRevoked
  | WalletDeactivated
  | WalletClosed;

export type LoyaltyWalletCommand =
  | OpenLoyaltyWallet
  | OpenNextRedemptionWindow
  | SetRedemptionCadence
  | GrantWalletAccess
  | RevokeWalletAccess
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
        ownerId: event.ownerId,
        walletNumber: event.walletNumber,
        cadence: event.cadence,
        maxRedemptionCount: event.maxRedemptionCount,
        currentWindowNumber: 0,
        access: WalletAccess.of(event.ownerId),
      };

    case 'RedemptionWindowProgressed':
      if (state.status !== 'Active') return state;
      return { ...state, currentWindowNumber: event.windowNumber };

    case 'RedemptionCadenceSet':
      if (state.status === 'NotExisting' || state.status === 'Closed')
        return state;
      return { ...state, cadence: event.cadence };

    case 'WalletAccessGranted':
      if (state.status === 'NotExisting' || state.status === 'Closed')
        return state;
      return { ...state, access: state.access.add(event.memberId) };

    case 'WalletAccessRevoked':
      if (state.status === 'NotExisting' || state.status === 'Closed')
        return state;
      return { ...state, access: state.access.revoke(event.memberId) };

    case 'WalletDeactivated':
      if (state.status !== 'Active') return state;
      return { ...state, status: 'Deactivated' };

    case 'WalletClosed':
      return { status: 'Closed', walletNumber: event.walletNumber };

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
    case 'OpenNextRedemptionWindow':
      return openNextRedemptionWindow(command, state);
    case 'SetRedemptionCadence':
      return setRedemptionCadence(command, state);
    case 'GrantWalletAccess':
      return grantWalletAccess(command, state);
    case 'RevokeWalletAccess':
      return revokeWalletAccess(command, state);
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
    maxRedemptionCount: RedemptionLimit;
    cadence: RedemptionCadence;
  }
>;

export const openLoyaltyWallet = (
  command: OpenLoyaltyWallet['data'],
  state: LoyaltyWallet,
): LoyaltyWalletEvent[] => {
  if (state.status !== 'NotExisting') return [];

  const { walletNumber, ownerId, cadence, maxRedemptionCount } = command;

  return [
    {
      type: 'LoyaltyWalletOpened',
      data: { walletNumber, ownerId, cadence, maxRedemptionCount },
    },
    {
      type: 'RedemptionWindowProgressed',
      data: {
        walletNumber,
        ownerId,
        windowNumber: 1,
        openingBalance: LoyaltyPoints.ZERO,
        maxRedemptionCount,
        access: [ownerId],
      },
    },
  ];
};

export type OpenNextRedemptionWindow = Command<
  'OpenNextRedemptionWindow',
  {
    walletNumber: WalletNumber;
    closedWindowNumber: number;
    closingBalance: LoyaltyPoints;
  }
>;

export const openNextRedemptionWindow = (
  command: OpenNextRedemptionWindow['data'],
  state: LoyaltyWallet,
): RedemptionWindowProgressed | [] => {
  if (state.status !== 'Active') return [];
  if (command.closedWindowNumber !== state.currentWindowNumber) return [];

  return {
    type: 'RedemptionWindowProgressed',
    data: {
      walletNumber: state.walletNumber,
      ownerId: state.ownerId,
      windowNumber: state.currentWindowNumber + 1,
      openingBalance: command.closingBalance,
      maxRedemptionCount: state.maxRedemptionCount,
      access: [...state.access.members],
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

  return {
    type: 'RedemptionCadenceSet',
    data: {
      walletNumber: wallet.walletNumber,
      ownerId: wallet.ownerId,
      cadence: command.cadence,
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
      memberId: command.memberId,
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
    data: { walletNumber: wallet.walletNumber },
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
