import { testStorage, type TestStorage } from '../testing/testStorage';
import { loyaltyWalletStore } from './loyaltyWalletStore';
import { redemptionWindowStore } from './redemptionWindow';
import { redemptionWindowProjections } from './redemptionWindow/redemptionWindowStore.testStore';

export type TestWalletStore = {
  client: TestStorage['client'];
  expectEventInStream: TestStorage['expectEventInStream'];
  store: ReturnType<typeof loyaltyWalletStore>;
  close: TestStorage['close'];
};

export const testWalletStore = async (): Promise<TestWalletStore> => {
  const { eventStore, client, expectEventInStream, close } =
    await testStorage();

  return {
    client,
    expectEventInStream,
    store: loyaltyWalletStore(eventStore, client),
    close,
  };
};

export type TestLoyaltyWalletStore = {
  client: TestStorage['client'];
  expectEventInStream: TestStorage['expectEventInStream'];
  store: ReturnType<typeof loyaltyWalletStore>;
  windowStore: ReturnType<typeof redemptionWindowStore>;
  close: TestStorage['close'];
};

export const testLoyaltyWalletStore =
  async (): Promise<TestLoyaltyWalletStore> => {
    const { eventStore, client, expectEventInStream, close } =
      await testStorage(redemptionWindowProjections);

    return {
      client,
      expectEventInStream,
      store: loyaltyWalletStore(eventStore, client),
      windowStore: redemptionWindowStore(eventStore, client),
      close,
    };
  };
