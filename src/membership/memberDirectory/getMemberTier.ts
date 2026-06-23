import { type PongoCollection } from '@event-driven-io/pongo';
import { type Member, type MemberId } from '../member';
import { type Tier } from '../tierProgram';

export type GetMemberTier = (memberId: MemberId) => Promise<Tier>;

export const getMemberTier =
  (members: PongoCollection<Member>): GetMemberTier =>
  async (memberId) => {
    const member = await members.findOne({ memberId });

    if (!member) throw new Error('Unknown member');

    return member.tier;
  };
