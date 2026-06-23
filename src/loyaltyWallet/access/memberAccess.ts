import type { MemberId } from '../../membership';

export type WalletAccess = Readonly<{
  // note, we assume here, all members have the same level of access
  // if we want to allow read only, this will need to be a wrapper
  members: ReadonlySet<MemberId>;
  size: number;
  has: (memberId: MemberId) => boolean;
  add: (memberId: MemberId) => WalletAccess;
  revoke: (memberId: MemberId) => WalletAccess;
}>;

const walletAccess = (
  members: ReadonlySet<MemberId> = new Set(),
): WalletAccess => {
  return {
    members,
    size: members.size,
    has: (memberId) => members.has(memberId),
    add: (memberId) => {
      const newOwners = new Set(members);
      newOwners.add(memberId);
      return walletAccess(newOwners);
    },
    revoke: (memberId) => {
      const newOwners = new Set(members);
      newOwners.delete(memberId);
      return walletAccess(newOwners);
    },
  };
};

export const WalletAccess = Object.assign(walletAccess, {
  empty: () => walletAccess(new Set()),
  of: (...members: MemberId[]) => walletAccess(new Set(members)),
} as const);
