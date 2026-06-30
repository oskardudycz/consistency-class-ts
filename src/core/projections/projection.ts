import type { Event } from '@event-driven-io/emmett';
import {
  type OptionalUnlessRequiredId,
  type PongoDb,
  type PongoDocument,
  type PongoFilter,
  type PongoSession,
} from '@event-driven-io/pongo';

export type Projection<Doc, E extends Event> = {
  collectionName: string;
  canHandle: ReadonlyArray<E['type']>;
  getDocumentId: (event: E) => string;
  evolve: (document: Doc | null, event: E) => Doc | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyProjection = Projection<any, any>;

export const applyProjections = async (
  db: PongoDb,
  projections: AnyProjection[],
  events: Event | ReadonlyArray<Event>,
  session: PongoSession,
): Promise<void> => {
  for (const projection of projections) {
    await applyProjection(db, projection, events, session);
  }
};

export const applyProjection = async <
  Doc extends PongoDocument,
  E extends Event,
>(
  db: PongoDb,
  projection: Projection<Doc, E>,
  events: Event | ReadonlyArray<Event>,
  session: PongoSession,
): Promise<void> => {
  const collection = db.collection<Doc>(projection.collectionName);

  events = Array.isArray(events) ? events : [events];

  for (const event of events) {
    if (!projection.canHandle.includes(event.type)) continue;

    const handled = event as E;
    const _id = projection.getDocumentId(handled);
    const filter = { _id } as PongoFilter<Doc>;

    const current = await collection.findOne(filter, { session });
    const next = projection.evolve(current, handled);

    if (next === null) continue;

    if (current) await collection.replaceOne(filter, next, { session });
    else
      await collection.insertOne(next as OptionalUnlessRequiredId<Doc>, {
        session,
      });
  }
};
