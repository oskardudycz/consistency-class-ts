import { LoyaltyPoints } from '../../loyaltyPoints';
import { type MemberId, type Tier } from '../../../membership';
import {
  type Channel,
  type EarnRole,
  type Money,
  type PurchaseInformation,
} from './purchase';

export type ComponentRole = 'Buyer' | EarnRole;
export type PointComponent = Readonly<{
  member: MemberId;
  role: ComponentRole;
  amount: LoyaltyPoints;
}>;
export type ComponentBreakdown = Readonly<{
  components: readonly PointComponent[];
}>;

const rate = (purchaseValue: Money): number =>
  purchaseValue < 100 ? 0.05 : purchaseValue < 500 ? 0.07 : 0.1;

const TIER_MULTIPLIER = {
  Standard: 1,
  Silver: 1.1,
  Gold: 1.25,
  Platinum: 1.5,
} as const satisfies Record<Tier, number>;

const CHANNEL_MULTIPLIER = {
  InStore: 1,
  MobileApp: 1.2,
  Web: 1.1,
} as const satisfies Record<Channel, number>;

/** Each non-buyer role earns its own share of the buyer's points. */
const SHARE_OF_BUYER = {
  Referrer: 0.1,
  Operator: 0.05,
} as const satisfies Record<EarnRole, number>;

const isEvening = (at: Date): boolean =>
  at.getHours() >= 18 && at.getHours() < 22;

// the buyer's base earning: value bracket x tier x channel x evening + promotions
export const buyerPoints = (purchase: PurchaseInformation): LoyaltyPoints => {
  let points = purchase.purchaseValue * rate(purchase.purchaseValue);
  points *= TIER_MULTIPLIER[purchase.tier];
  points *= CHANNEL_MULTIPLIER[purchase.channel];
  if (isEvening(purchase.at)) points *= 1.5;
  points += purchase.promotionBonuses.reduce((sum, bonus) => sum + bonus, 0);
  return LoyaltyPoints.of(Math.round(points));
};

export const PointsCalculator = {
  calculate: (purchase: PurchaseInformation): ComponentBreakdown => {
    const base = buyerPoints(purchase);

    return {
      components: [
        { member: purchase.buyer, role: 'Buyer', amount: base },
        ...purchase.beneficiaries.map((beneficiary) => ({
          member: beneficiary.member,
          role: beneficiary.role,
          amount: LoyaltyPoints.of(
            Math.round(base * SHARE_OF_BUYER[beneficiary.role]),
          ),
        })),
      ],
    };
  },
} as const;
