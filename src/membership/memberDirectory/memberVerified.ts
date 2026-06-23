import { type Event } from '@event-driven-io/emmett';
import { type PongoCollection } from '@event-driven-io/pongo';
import { type Member, type MemberId } from '../member';
import { type Tier } from '../tierProgram';

type Dependencies = Readonly<{
  members: PongoCollection<Member>;
}>;

export type MemberVerified = Event<
  'MemberVerified',
  {
    memberId: MemberId;
    tier: Tier;
  }
>;

export const memberVerifiedHandler = async (
  { members }: Dependencies,
  { data }: MemberVerified,
) => {
  await members.insertOne({ memberId: data.memberId, tier: data.tier });
};
