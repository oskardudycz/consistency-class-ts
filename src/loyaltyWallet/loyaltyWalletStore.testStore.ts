import { projections } from '@event-driven-io/emmett';
import { getSQLiteEventStore } from '@event-driven-io/emmett-sqlite';
import { sqlite3EventStoreDriver } from '@event-driven-io/emmett-sqlite/sqlite3';
import { pongoClient } from '@event-driven-io/pongo';
import { sqlite3Driver } from '@event-driven-io/pongo/sqlite3';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activityReportProjection } from './activityReport';
import { loyaltyWalletStore } from './loyaltyWalletStore';
import { monthlySummaryProjection } from './monthlySummary';
import { walletDetailsProjection } from './walletDetails';

export type TestLoyaltyWalletStore = {
  store: ReturnType<typeof loyaltyWalletStore>;
  client: ReturnType<typeof pongoClient>;
  close: () => Promise<void>;
};

export const testLoyaltyWalletStore =
  async (): Promise<TestLoyaltyWalletStore> => {
    const fileName = join(tmpdir(), `loyalty-wallet-${randomUUID()}.db`);

    const eventStore = getSQLiteEventStore({
      driver: sqlite3EventStoreDriver,
      fileName,
      schema: { autoMigration: 'None' },
      projections: projections.inline([
        walletDetailsProjection,
        activityReportProjection,
        monthlySummaryProjection,
      ]),
    });

    const client = pongoClient({
      driver: sqlite3Driver,
      connectionString: fileName,
    });
    await client.connect();
    await eventStore.schema.migrate();

    const store = loyaltyWalletStore(eventStore, client);

    return {
      store,
      client,
      close: async () => {
        await client.close();
        await eventStore.close();
        rmSync(fileName, { force: true });
        rmSync(`${fileName}-wal`, { force: true });
        rmSync(`${fileName}-shm`, { force: true });
      },
    };
  };
