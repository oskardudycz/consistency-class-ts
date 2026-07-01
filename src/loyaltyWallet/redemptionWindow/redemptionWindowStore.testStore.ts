import { projections } from '@event-driven-io/emmett';
import { testStorage, type TestStorage } from '../../testing/testStorage';
import { activityReportProjection } from '../activityReport';
import { monthlySummaryProjection } from '../monthlySummary';
import { redemptionWindowStore } from './redemptionWindowStore';
import { currentWindowProjection } from './windowLifecycle';

export const redemptionWindowProjections = projections.inline([
  activityReportProjection,
  monthlySummaryProjection,
  currentWindowProjection,
]);

export type TestRedemptionWindowStore = {
  client: TestStorage['client'];
  expectEventInStream: TestStorage['expectEventInStream'];
  windowStore: ReturnType<typeof redemptionWindowStore>;
  close: TestStorage['close'];
};

export const testRedemptionWindowStore =
  async (): Promise<TestRedemptionWindowStore> => {
    const { eventStore, client, expectEventInStream, close } =
      await testStorage(redemptionWindowProjections);

    return {
      client,
      expectEventInStream,
      windowStore: redemptionWindowStore(eventStore, client),
      close,
    };
  };
