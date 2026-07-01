import { type Brand, type Event } from '@event-driven-io/emmett';
import { type LoyaltyPoints } from '../../loyaltyPoints';
import { type MemberId, type Tier } from '../../../membership';

export type Money = Brand<number, 'Money'>;
export const Money = {
  of: (value: number): Money => value as Money,
} as const;

export type Channel = 'InStore' | 'MobileApp' | 'Web';

/**
 * Recipients beyond the buyer - a referrer, the operator, others. The set is
 * open-ended; the number of earners per transaction is not predetermined.
 */
export type EarnRole = 'Referrer' | 'Operator';
export type Beneficiary = Readonly<{ member: MemberId; role: EarnRole }>;

/** A recorded purchase: transaction facts only. Tier is a member attribute, resolved at the edge. */
export type PurchaseRecorded = Event<
  'PurchaseRecorded',
  {
    purchaseValue: Money;
    buyer: MemberId;
    channel: Channel;
    at: Date;
    promotionBonuses: readonly LoyaltyPoints[];
    beneficiaries: readonly Beneficiary[];
  }
>;
export type Purchase = PurchaseRecorded['data'];

/** What the calculator consumes: the recorded facts enriched with the buyer's tier. */
export type PurchaseInformation = Readonly<Purchase & { tier: Tier }>;

export const purchaseInformation = (
  recorded: PurchaseRecorded,
  tier: Tier,
): PurchaseInformation => ({ ...recorded.data, tier });
