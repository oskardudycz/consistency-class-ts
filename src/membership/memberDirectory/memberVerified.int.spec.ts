import { InMemorySQLiteDatabase } from '@event-driven-io/dumbo/sqlite3';
import {
  type PongoClient,
  type PongoCollection,
  pongoClient,
} from '@event-driven-io/pongo';
import { sqlite3Driver } from '@event-driven-io/pongo/sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { type Member, MemberId } from '../member';
import { memberVerifiedHandler } from './memberVerified';

describe('Verifying a member', () => {
  const OSKAR = MemberId.random();

  let client: PongoClient;
  let members: PongoCollection<Member>;

  beforeEach(async () => {
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: InMemorySQLiteDatabase,
    });
    await client.connect();
    members = client.db().collection<Member>('members');
  });

  afterEach(async () => {
    await client.close();
  });

  test('Records the member in the directory on their tier', async () => {
    // when
    await memberVerifiedHandler(
      { members },
      {
        type: 'MemberVerified',
        data: { memberId: OSKAR, tier: 'Gold' },
      },
    );

    // then the member is in the directory on their tier
    const member = await members.findOne({ memberId: OSKAR });
    expect(member).toMatchObject({ memberId: OSKAR, tier: 'Gold' });
  });
});
