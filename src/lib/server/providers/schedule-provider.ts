import type { ScheduleProvider } from './contracts';
import { BellLogicProvider, type BellLogicProviderOptions } from './belllogic/belllogic-provider';
import { MockBellLogicProvider, type MockScheduleVariant } from './mock/mock-belllogic-provider';

export type ScheduleProviderConfig =
  | {
      mode?: 'fixture';
      fixtureVariant?: MockScheduleVariant;
    }
  | ({
      mode: 'belllogic';
    } & BellLogicProviderOptions);

export function createScheduleProvider(config: ScheduleProviderConfig = {}): ScheduleProvider {
  if (config.mode === 'belllogic') return new BellLogicProvider(config);
  return new MockBellLogicProvider(config.fixtureVariant);
}
