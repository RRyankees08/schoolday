import type { CanvasProvider as CanvasProviderContract } from './contracts';
import { CanvasProvider, type CanvasProviderOptions } from './canvas/canvas-provider';
import { MockCanvasProvider } from './mock/mock-canvas-provider';

export type CanvasProviderConfig =
  { mode?: 'fixture' } | ({ mode: 'canvas' } & CanvasProviderOptions);

export function createCanvasProvider(config: CanvasProviderConfig = {}): CanvasProviderContract {
  if (config.mode === 'canvas') return new CanvasProvider(config);
  return new MockCanvasProvider();
}
