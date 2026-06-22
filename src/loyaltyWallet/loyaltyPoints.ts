import { type Brand } from '@event-driven-io/emmett';

export type LoyaltyPoints = Brand<number, 'LoyaltyPoints'>;
export const LoyaltyPoints = {
  ZERO: 0 as LoyaltyPoints,
  of: (value: number): LoyaltyPoints => value as LoyaltyPoints,
  earn: (earned: LoyaltyPoints, points: LoyaltyPoints): LoyaltyPoints =>
    (earned + points) as LoyaltyPoints,
  redeem: (redeemed: LoyaltyPoints, points: LoyaltyPoints): LoyaltyPoints =>
    (redeemed + points) as LoyaltyPoints,
  available: (earned: LoyaltyPoints, redeemed: LoyaltyPoints): LoyaltyPoints =>
    (earned - redeemed) as LoyaltyPoints,
} as const;

export type RedemptionLimit = Brand<number, 'RedemptionLimit'>;
export const RedemptionLimit = {
  ZERO: 0 as RedemptionLimit,
  of: (value: number): RedemptionLimit => value as RedemptionLimit,
  redeem: (redemptionCount: RedemptionLimit): RedemptionLimit =>
    (redemptionCount + 1) as RedemptionLimit,
  redemptionsLeft: (
    maxRedemptionCount: RedemptionLimit,
    redemptionCount: RedemptionLimit,
  ): RedemptionLimit =>
    (maxRedemptionCount - redemptionCount) as RedemptionLimit,
} as const;

export type LoyaltyPointsLimit = Readonly<{
  earnedPoints: LoyaltyPoints;
  redeemedPoints: LoyaltyPoints;
  availablePoints: LoyaltyPoints;
  redemptionCount: RedemptionLimit;
  maxRedemptionCount: RedemptionLimit;
  redemptionsLeft: RedemptionLimit;
  earn: (points: LoyaltyPoints) => LoyaltyPointsLimit;
  redeem: (points: LoyaltyPoints) => LoyaltyPointsLimit;
  resetRedemptionCount: () => LoyaltyPointsLimit;
}>;

type LoyaltyPointsOptions = Readonly<{
  earnedPoints?: LoyaltyPoints;
  redeemedPoints?: LoyaltyPoints;
  redemptionCount?: RedemptionLimit;
  maxRedemptionCount: RedemptionLimit;
}>;

const loyaltyPointsLimit = ({
  earnedPoints = LoyaltyPoints.ZERO,
  redeemedPoints = LoyaltyPoints.ZERO,
  redemptionCount = RedemptionLimit.ZERO,
  maxRedemptionCount,
}: LoyaltyPointsOptions): LoyaltyPointsLimit => {
  const availablePoints = LoyaltyPoints.available(earnedPoints, redeemedPoints);
  const redemptionsLeft = RedemptionLimit.redemptionsLeft(
    maxRedemptionCount,
    redemptionCount,
  );

  return {
    earnedPoints,
    redeemedPoints,
    availablePoints,
    maxRedemptionCount,
    redemptionCount,
    redemptionsLeft,
    earn: (points) =>
      loyaltyPointsLimit({
        earnedPoints: LoyaltyPoints.earn(earnedPoints, points),
        redeemedPoints,
        maxRedemptionCount,
        redemptionCount,
      }),
    redeem: (points) =>
      loyaltyPointsLimit({
        earnedPoints: earnedPoints,
        redeemedPoints: LoyaltyPoints.redeem(redeemedPoints, points),
        maxRedemptionCount,
        redemptionCount: RedemptionLimit.redeem(redemptionCount),
      }),
    resetRedemptionCount: () =>
      loyaltyPointsLimit({
        earnedPoints,
        redeemedPoints,
        maxRedemptionCount,
        redemptionCount: RedemptionLimit.ZERO,
      }),
  };
};

export const LoyaltyPointsLimit = Object.assign(loyaltyPointsLimit, {
  initial: (options: LoyaltyPointsOptions) => loyaltyPointsLimit(options),
} as const);
