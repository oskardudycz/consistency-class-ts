import { InMemorySQLiteDatabase } from '@event-driven-io/dumbo/sqlite3';
import { type PongoClient, pongoClient } from '@event-driven-io/pongo';
import { sqlite3Driver } from '@event-driven-io/pongo/sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemberId } from '../../membership';
import { type ActiveLoyaltyWallet } from '../loyaltyWallet';
import { loyaltyWalletStore } from '../loyaltyWalletStore';
import { openWalletOnMemberVerified } from './openWalletOnMemberVerified';

describe('Opening a wallet when a member is verified', () => {
  const OSKAR = MemberId.random();

  let client: PongoClient;
  let store: ReturnType<typeof loyaltyWalletStore>;

  beforeEach(async () => {
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: InMemorySQLiteDatabase,
    });
    await client.connect();
    store = loyaltyWalletStore(client);
  });

  afterEach(async () => {
    await client.close();
  });

  test('Opens an active wallet with the window derived from the tier', async () => {
    // when
    await openWalletOnMemberVerified(
      { saveLoyaltyWallet: store.saveLoyaltyWallet },
      {
        type: 'MemberVerified',
        data: { memberId: OSKAR, tier: 'Gold' },
      },
    );

    // then an active wallet is opened for the member, the window from their tier
    const [wallet] = await store.findLoyaltyWalletsByOwners([OSKAR]);
    expect(wallet?.status).toBe('Active');
    const active = wallet as ActiveLoyaltyWallet;
    expect(active.ownerId).toBe(OSKAR);
    expect(active.cadence).toBe('Monthly');
    expect(active.pointsLimit.redemptionsLeft).toBe(10);
    expect(active.access.has(OSKAR)).toBe(true);
  });
});
