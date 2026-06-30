import { describe, expect, test } from 'vitest';
import { MemberId } from '../membership';
import { LoyaltyPoints, RedemptionLimit } from './loyaltyPoints';
import {
  type ActiveLoyaltyWallet,
  type ClosedLoyaltyWallet,
  closeWallet,
  type DeactivatedLoyaltyWallet,
  deactivateWallet,
  decide,
  earnLoyaltyPoints,
  evolve,
  grantWalletAccess,
  LoyaltyWallet,
  type LoyaltyWalletEvent,
  openLoyaltyWallet,
  redeemLoyaltyPoints,
  resetRedemptionWindow,
  revokeWalletAccess,
  setRedemptionCadence,
  type WalletClosed,
  type WalletDeactivated,
  WalletNumber,
} from './loyaltyWallet';

describe('LoyaltyWallet', () => {
  const walletNumber = WalletNumber.random();
  const owner = MemberId.random();
  const familyMember = MemberId.random();
  const at = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

  const openWallet = (): ActiveLoyaltyWallet =>
    LoyaltyWallet.open({
      walletNumber,
      ownerId: owner,
      cadence: 'Weekly',
      maxRedemptionCount: RedemptionLimit.of(5),
    });

  const walletWithPoints = (points: number): ActiveLoyaltyWallet => {
    const wallet = openWallet();

    return evolve(
      wallet,
      earnLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(points), at },
        wallet,
      ),
    ) as ActiveLoyaltyWallet;
  };

  const deactivated = (): DeactivatedLoyaltyWallet => {
    const wallet = openWallet();
    return evolve(
      wallet,
      deactivateWallet(wallet) as WalletDeactivated,
    ) as DeactivatedLoyaltyWallet;
  };

  const closed = (): ClosedLoyaltyWallet => {
    const wallet = openWallet();
    return evolve(
      wallet,
      closeWallet(wallet) as WalletClosed,
    ) as ClosedLoyaltyWallet;
  };

  const apply = (
    state: LoyaltyWallet,
    result: LoyaltyWalletEvent | LoyaltyWalletEvent[],
  ): LoyaltyWallet =>
    Array.isArray(result)
      ? result.reduce(evolve, state)
      : evolve(state, result);

  const exhaustRedemptions = (
    wallet: ActiveLoyaltyWallet,
  ): ActiveLoyaltyWallet => {
    let state: ActiveLoyaltyWallet = wallet;
    while (state.pointsLimit.redemptionsLeft > 0) {
      state = evolve(
        state,
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(1), at },
          state,
        ),
      ) as ActiveLoyaltyWallet;
    }
    return state;
  };

  describe('Opening', () => {
    test('Opens a not existing wallet and emits LoyaltyWalletOpened', () => {
      // given
      const state = LoyaltyWallet.initial();

      // when
      const opened = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        state,
      );

      // then
      expect(opened).toEqual({
        type: 'LoyaltyWalletOpened',
        data: {
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
          earnedPoints: LoyaltyPoints.ZERO,
          redeemedPoints: LoyaltyPoints.ZERO,
        },
      });
    });

    test('Leaves an already active wallet unchanged without events', () => {
      // given
      const activeWallet = openWallet();

      // when
      const result = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Monthly',
          maxRedemptionCount: RedemptionLimit.of(3),
        },
        activeWallet,
      );

      // then
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test('Leaves a deactivated wallet unchanged', () => {
      // given
      const deactivatedWallet = deactivated();

      // when
      const result = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        deactivatedWallet,
      );

      // then
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test('Leaves a closed wallet unchanged', () => {
      // given
      const closedWallet = closed();

      // when
      const result = openLoyaltyWallet(
        {
          walletNumber,
          ownerId: owner,
          cadence: 'Weekly',
          maxRedemptionCount: RedemptionLimit.of(5),
        },
        closedWallet,
      );

      // then
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('Earning points', () => {
    test('Earns points on an active wallet and emits LoyaltyPointsEarned', () => {
      // when
      const earned = earnLoyaltyPoints(
        { walletNumber, points: LoyaltyPoints.of(100), at },
        openWallet(),
      );

      // then
      expect(earned).toEqual({
        type: 'LoyaltyPointsEarned',
        data: { walletNumber, ownerId: owner, points: 100, at },
      });
    });

    test('Cant earn points if wallet does not exist', () => {
      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100), at },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });

    test('Cant earn points if wallet is deactivated', () => {
      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100), at },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant earn points if wallet is closed', () => {
      expect(() =>
        earnLoyaltyPoints(
          { walletNumber, points: LoyaltyPoints.of(100), at },
          closed(),
        ),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Redeeming points', () => {
    test('Redeems points on an active wallet and emits LoyaltyPointsRedeemed', () => {
      // when
      const redeemed = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
        walletWithPoints(100),
      );

      // then
      expect(redeemed).toEqual({
        type: 'LoyaltyPointsRedeemed',
        data: {
          walletNumber,
          ownerId: owner,
          byMemberId: owner,
          points: 40,
          burned: 40,
          at,
        },
      });
    });

    test('Records both the redeemed and burned amounts when a policy burns fewer points', () => {
      // when
      const redeemed = redeemLoyaltyPoints(
        {
          walletNumber,
          memberId: owner,
          points: LoyaltyPoints.of(100),
          burned: LoyaltyPoints.of(95),
          at,
        },
        walletWithPoints(100),
      );

      // then
      expect(redeemed).toEqual({
        type: 'LoyaltyPointsRedeemed',
        data: {
          walletNumber,
          ownerId: owner,
          byMemberId: owner,
          points: 100,
          burned: 95,
          at,
        },
      });
    });

    test('Burns the policy amount from the balance, not the requested points', () => {
      // given
      const wallet = walletWithPoints(100);

      // when
      const redeemed = redeemLoyaltyPoints(
        {
          walletNumber,
          memberId: owner,
          points: LoyaltyPoints.of(100),
          burned: LoyaltyPoints.of(95),
          at,
        },
        wallet,
      );

      // then
      const newState = evolve(wallet, redeemed);
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(5);
    });

    test('Checks the balance against the burned amount, not the requested points', () => {
      // given
      const wallet = walletWithPoints(10);

      // when
      const redeemed = redeemLoyaltyPoints(
        {
          walletNumber,
          memberId: owner,
          points: LoyaltyPoints.of(100),
          burned: LoyaltyPoints.of(5),
          at,
        },
        wallet,
      );

      // then
      expect(redeemed).toEqual({
        type: 'LoyaltyPointsRedeemed',
        data: {
          walletNumber,
          ownerId: owner,
          byMemberId: owner,
          points: 100,
          burned: 5,
          at,
        },
      });
      const newState = evolve(wallet, redeemed);
      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(5);
    });

    test('Cant redeem more points than available', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(50), at },
          walletWithPoints(20),
        ),
      ).toThrow('Not enough points to redeem');
    });

    test('Cant redeem once the redemption window is exhausted', () => {
      // given
      const exhausted = exhaustRedemptions(walletWithPoints(100));

      // then
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(1), at },
          exhausted,
        ),
      ).toThrow('Redemption window exhausted');
    });

    test('Cant redeem points if wallet does not exist', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });

    test('Cant redeem points if wallet is deactivated', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant redeem points if wallet is closed', () => {
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(40), at },
          closed(),
        ),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Setting redemption cadence', () => {
    test('Changes cadence on an active wallet and emits RedemptionCadenceSet', () => {
      // when
      const cadenceSet = setRedemptionCadence(
        { walletNumber, cadence: 'Monthly' },
        openWallet(),
      );

      // then
      expect(cadenceSet).toEqual({
        type: 'RedemptionCadenceSet',
        data: { walletNumber, ownerId: owner, cadence: 'Monthly' },
      });
    });

    test('Cant set cadence if wallet does not exist', () => {
      expect(() =>
        setRedemptionCadence(
          { walletNumber, cadence: 'Monthly' },
          LoyaltyWallet.initial(),
        ),
      ).toThrow("Wallet doesn't exist");
    });

    test('Cant set cadence if wallet is not active', () => {
      expect(() =>
        setRedemptionCadence(
          { walletNumber, cadence: 'Monthly' },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant set cadence if wallet is closed', () => {
      expect(() =>
        setRedemptionCadence({ walletNumber, cadence: 'Monthly' }, closed()),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Wallet access', () => {
    test('Owner can redeem from the shared balance', () => {
      const points = LoyaltyPoints.of(40);

      const redeemed = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: points, at },
        walletWithPoints(100),
      );

      expect(redeemed.data.points).toBe(points);
    });

    test('Grants access to a family member and emits WalletAccessGranted', () => {
      // when
      const granted = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        openWallet(),
      );

      // then
      expect(granted).toEqual({
        type: 'WalletAccessGranted',
        data: { walletNumber, ownerId: owner, memberId: familyMember },
      });
    });

    test('Revokes access from a family member and emits WalletAccessRevoked', () => {
      // given
      const wallet = openWallet();
      const granted = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        wallet,
      );

      // when
      const revoked = revokeWalletAccess(
        { walletNumber, memberId: familyMember },
        evolve(wallet, granted),
      );

      // then
      expect(revoked).toEqual({
        type: 'WalletAccessRevoked',
        data: { walletNumber, ownerId: owner, memberId: familyMember },
      });
    });

    test('A granted family member can redeem from the shared balance', () => {
      // given
      const wallet = walletWithPoints(100);
      const granted = grantWalletAccess(
        { walletNumber, memberId: familyMember },
        wallet,
      );

      // when
      const redeemed = redeemLoyaltyPoints(
        {
          walletNumber,
          memberId: familyMember,
          points: LoyaltyPoints.of(40),
          at,
        },
        evolve(wallet, granted),
      );

      // then
      expect(redeemed).toEqual({
        type: 'LoyaltyPointsRedeemed',
        data: {
          walletNumber,
          ownerId: owner,
          byMemberId: familyMember,
          points: 40,
          burned: 40,
          at,
        },
      });
    });

    test('Cant redeem without access', () => {
      expect(() =>
        redeemLoyaltyPoints(
          {
            walletNumber,
            memberId: familyMember,
            points: LoyaltyPoints.of(40),
            at,
          },
          walletWithPoints(100),
        ),
      ).toThrow('Not authorized to redeem');
    });

    test('Cant redeem after access is revoked', () => {
      // given
      let wallet: LoyaltyWallet = walletWithPoints(100);
      const granted = grantWalletAccess(
        {
          walletNumber,
          memberId: familyMember,
        },
        wallet,
      );
      // and
      wallet = evolve(wallet, granted);
      const revoked = revokeWalletAccess(
        { walletNumber, memberId: familyMember },
        wallet,
      );

      // then
      expect(() =>
        redeemLoyaltyPoints(
          {
            walletNumber,
            memberId: familyMember,
            points: LoyaltyPoints.of(40),
            at,
          },
          evolve(wallet, revoked),
        ),
      ).toThrow('Not authorized to redeem');
    });

    test('Cant grant access if wallet is not active', () => {
      expect(() =>
        grantWalletAccess(
          { walletNumber, memberId: familyMember },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant grant access if wallet is closed', () => {
      expect(() =>
        grantWalletAccess({ walletNumber, memberId: familyMember }, closed()),
      ).toThrow('Wallet is closed');
    });

    test('Cant revoke access if wallet is not active', () => {
      expect(() =>
        revokeWalletAccess(
          { walletNumber, memberId: familyMember },
          deactivated(),
        ),
      ).toThrow('Wallet is not active');
    });

    test('Cant revoke access if wallet is closed', () => {
      expect(() =>
        revokeWalletAccess({ walletNumber, memberId: familyMember }, closed()),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Resetting the redemption window', () => {
    test('Resets the redemption window and emits RedemptionWindowReset', () => {
      // given
      const wallet = walletWithPoints(100);
      const redeemed = redeemLoyaltyPoints(
        { walletNumber, memberId: owner, points: LoyaltyPoints.of(10), at },
        wallet,
      );

      // when
      const reset = resetRedemptionWindow(
        { walletNumber, at },
        evolve(wallet, redeemed),
      );

      // then
      expect(reset).toEqual({
        type: 'RedemptionWindowReset',
        data: { walletNumber, ownerId: owner, at },
      });
    });

    test('Restores redemptions after the window is exhausted and reset', () => {
      // given
      const exhausted = exhaustRedemptions(walletWithPoints(100));
      expect(exhausted.pointsLimit.redemptionsLeft).toBe(0);

      // when
      const reset = resetRedemptionWindow({ walletNumber, at }, exhausted);
      const afterReset = evolve(exhausted, reset);

      // then
      assertActive(afterReset);
      expect(afterReset.pointsLimit.redemptionsLeft).toBe(5);
      expect(() =>
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(1), at },
          afterReset,
        ),
      ).not.toThrow();
    });

    test('Cant reset window if wallet is not active', () => {
      expect(() =>
        resetRedemptionWindow({ walletNumber, at }, deactivated()),
      ).toThrow('Wallet is not active');
    });

    test('Cant reset window if wallet is closed', () => {
      expect(() =>
        resetRedemptionWindow({ walletNumber, at }, closed()),
      ).toThrow('Wallet is closed');
    });
  });

  describe('Deactivating', () => {
    test('Deactivates an active wallet and emits WalletDeactivated', () => {
      // when
      const deactivatedEvent = deactivateWallet(walletWithPoints(100));

      // then
      expect(deactivatedEvent).toEqual({
        type: 'WalletDeactivated',
        data: { walletNumber, ownerId: owner },
      });
    });

    test('Leaves an already deactivated wallet unchanged without events', () => {
      // when
      const result = deactivateWallet(deactivated());

      // then
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test('Cant deactivate a wallet that does not exist', () => {
      expect(() => deactivateWallet(LoyaltyWallet.initial())).toThrow(
        "Wallet doesn't exist",
      );
    });

    test('Cant deactivate a closed wallet', () => {
      expect(() => deactivateWallet(closed())).toThrow('Wallet is closed');
    });
  });

  describe('Closing', () => {
    test('Closes an active wallet and emits WalletClosed', () => {
      // when
      const closedEvent = closeWallet(openWallet());

      // then
      expect(closedEvent).toEqual({
        type: 'WalletClosed',
        data: { walletNumber },
      });
    });

    test('Closes a deactivated wallet and emits WalletClosed', () => {
      // when
      const closedEvent = closeWallet(deactivated());

      // then
      expect(closedEvent).toEqual({
        type: 'WalletClosed',
        data: { walletNumber },
      });
    });

    test('Leaves an already closed wallet unchanged without events', () => {
      // when
      const result = closeWallet(closed());

      // then
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test('Cant close a wallet that does not exist', () => {
      expect(() => closeWallet(LoyaltyWallet.initial())).toThrow(
        "Wallet doesn't exist",
      );
    });
  });

  describe('decide', () => {
    test('Routes OpenLoyaltyWallet', () => {
      const state = LoyaltyWallet.initial();

      const newState = apply(
        state,
        decide(
          {
            type: 'OpenLoyaltyWallet',
            data: {
              walletNumber,
              ownerId: owner,
              cadence: 'Weekly',
              maxRedemptionCount: RedemptionLimit.of(5),
            },
          },
          state,
        ),
      );

      assertActive(newState);
      expect(newState.walletNumber).toBe(walletNumber);
    });

    test('Routes EarnLoyaltyPoints', () => {
      const wallet = openWallet();

      const newState = apply(
        wallet,
        decide(
          {
            type: 'EarnLoyaltyPoints',
            data: { walletNumber, points: LoyaltyPoints.of(100), at },
          },
          wallet,
        ),
      );

      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(100);
    });

    test('Routes RedeemLoyaltyPoints', () => {
      const wallet = walletWithPoints(100);

      const newState = apply(
        wallet,
        decide(
          {
            type: 'RedeemLoyaltyPoints',
            data: {
              walletNumber,
              memberId: owner,
              points: LoyaltyPoints.of(40),
              at,
            },
          },
          wallet,
        ),
      );

      assertActive(newState);
      expect(newState.pointsLimit.availablePoints).toBe(60);
      expect(newState.pointsLimit.redemptionsLeft).toBe(4);
    });

    test('Routes SetRedemptionCadence', () => {
      const wallet = openWallet();

      const newState = apply(
        wallet,
        decide(
          {
            type: 'SetRedemptionCadence',
            data: { walletNumber, cadence: 'Monthly' },
          },
          wallet,
        ),
      );

      assertActive(newState);
      expect(newState.cadence).toBe('Monthly');
    });

    test('Routes ResetRedemptionWindow', () => {
      const wallet = walletWithPoints(100);
      const afterRedeem = evolve(
        wallet,
        redeemLoyaltyPoints(
          { walletNumber, memberId: owner, points: LoyaltyPoints.of(10), at },
          wallet,
        ),
      );

      const newState = apply(
        afterRedeem,
        decide(
          { type: 'ResetRedemptionWindow', data: { walletNumber, at } },
          afterRedeem,
        ),
      );

      assertActive(newState);
      expect(newState.pointsLimit.redemptionsLeft).toBe(5);
      expect(newState.pointsLimit.availablePoints).toBe(90);
    });

    test('Routes DeactivateWallet', () => {
      const wallet = walletWithPoints(100);

      const newState = apply(
        wallet,
        decide({ type: 'DeactivateWallet', data: { walletNumber } }, wallet),
      );

      assertDeactivated(newState);
      expect(newState.cadence).toBe('Weekly');
      expect(newState.pointsLimit.availablePoints).toBe(100);
    });

    test('Routes CloseWallet', () => {
      const wallet = openWallet();

      const newState = apply(
        wallet,
        decide({ type: 'CloseWallet', data: { walletNumber } }, wallet),
      );

      assertClosed(newState);
    });

    test('Routes GrantWalletAccess', () => {
      const wallet = openWallet();

      const newState = apply(
        wallet,
        decide(
          {
            type: 'GrantWalletAccess',
            data: { walletNumber, memberId: familyMember },
          },
          wallet,
        ),
      );

      assertActive(newState);
      expect(newState.access.has(familyMember)).toBe(true);
    });

    test('Routes RevokeWalletAccess', () => {
      const wallet = evolve(
        openWallet(),
        grantWalletAccess(
          { walletNumber, memberId: familyMember },
          openWallet(),
        ),
      );

      const newState = apply(
        wallet,
        decide(
          {
            type: 'RevokeWalletAccess',
            data: { walletNumber, memberId: familyMember },
          },
          wallet,
        ),
      );

      assertActive(newState);
      expect(newState.access.has(familyMember)).toBe(false);
    });
  });
});

function assertActive(
  wallet: LoyaltyWallet,
): asserts wallet is ActiveLoyaltyWallet {
  expect(wallet.status).toBe('Active');
}

function assertDeactivated(
  wallet: LoyaltyWallet,
): asserts wallet is DeactivatedLoyaltyWallet {
  expect(wallet.status).toBe('Deactivated');
}

function assertClosed(
  wallet: LoyaltyWallet,
): asserts wallet is ClosedLoyaltyWallet {
  expect(wallet.status).toBe('Closed');
}
