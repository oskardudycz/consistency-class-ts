import {
  type Event,
  type ProjectionRegistration,
} from '@event-driven-io/emmett';
import {
  getSQLiteEventStore,
  type SQLiteEventStore,
  type SQLiteProjectionHandlerContext,
  type SQLiteReadEventMetadata,
} from '@event-driven-io/emmett-sqlite';
import { sqlite3EventStoreDriver } from '@event-driven-io/emmett-sqlite/sqlite3';
import { pongoClient } from '@event-driven-io/pongo';
import { sqlite3Driver } from '@event-driven-io/pongo/sqlite3';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';

export type InlineProjections = ProjectionRegistration<
  'inline',
  SQLiteReadEventMetadata,
  SQLiteProjectionHandlerContext
>[];

export type TestStorage = {
  eventStore: SQLiteEventStore;
  client: ReturnType<typeof pongoClient>;
  expectEventInStream: <E extends Event>(
    streamId: string,
    eventType: E['type'],
    matcher?: Partial<E['data']>,
  ) => Promise<E>;
  close: () => Promise<void>;
};

export const testStorage = async (
  inlineProjections: InlineProjections = [],
): Promise<TestStorage> => {
  const fileName = join(tmpdir(), `loyalty-wallet-${randomUUID()}.db`);

  const eventStore = getSQLiteEventStore({
    driver: sqlite3EventStoreDriver,
    fileName,
    schema: { autoMigration: 'None' },
    projections: inlineProjections,
  });

  const client = pongoClient({
    driver: sqlite3Driver,
    connectionString: fileName,
  });
  await client.connect();
  await eventStore.schema.migrate();

  return {
    eventStore,
    client,
    expectEventInStream: async <E extends Event>(
      streamId: string,
      eventType: E['type'],
      matcher?: Partial<E['data']>,
    ): Promise<E> => {
      const { events } = await eventStore.readStream<E>(streamId);

      const matches = events.filter(
        (event) =>
          event.type === eventType &&
          (matcher === undefined ||
            Object.entries(matcher).every(
              ([key, value]) =>
                (event.data as Record<string, unknown>)[key] === value,
            )),
      );

      expect(
        matches.length,
        `Expected event "${eventType}"${
          matcher ? ` matching ${JSON.stringify(matcher)}` : ''
        } in stream "${streamId}", but stream held: ${
          events.map((event) => event.type).join(', ') || '(no events)'
        }`,
      ).toBeGreaterThan(0);

      return matches[0];
    },
    close: async () => {
      await client.close();
      await eventStore.close();
      rmSync(fileName, { force: true });
      rmSync(`${fileName}-wal`, { force: true });
      rmSync(`${fileName}-shm`, { force: true });
    },
  };
};
