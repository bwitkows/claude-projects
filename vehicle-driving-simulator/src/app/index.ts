import { type ControlState, type InputSource, KeyboardInputSource } from '../input/index.js';
import { createPhysicsWorld, type PhysicsWorld } from '../physics/index.js';
import { createScene, FpsCounter, type SceneHandle } from '../render/index.js';
import { FixedStepLoop, SimClock } from '../sim/index.js';
import { attachCsvDownload, TelemetryBuffer } from '../telemetry/index.js';

export interface AppHandle {
  readonly loop: FixedStepLoop;
  readonly scene: SceneHandle;
  readonly physics: PhysicsWorld;
  readonly telemetry: TelemetryBuffer;
  readonly input: InputSource;
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface BootstrapOptions {
  readonly mount: HTMLElement;
  readonly fpsElement: HTMLElement;
}

export async function bootstrap(opts: BootstrapOptions): Promise<AppHandle> {
  const physics = await createPhysicsWorld();
  const scene = createScene({
    mount: opts.mount,
    width: opts.mount.clientWidth || window.innerWidth,
    height: opts.mount.clientHeight || window.innerHeight,
  });
  const fps = new FpsCounter(opts.fpsElement);
  const telemetry = new TelemetryBuffer();
  const input = new KeyboardInputSource();
  const clock = new SimClock();

  // The sim core is the single owner of physics stepping; the renderer reads
  // state from physics but never advances it.
  const loop = new FixedStepLoop({
    clock,
    onStep: (s) => {
      // Sample input exactly once per step, before integration.
      const _control: ControlState = input.read(s.time);
      void _control; // R0 has no vehicle; control is read for spec compliance.
      physics.step();
      telemetry.push({ t: s.time, step: s.step });
    },
    onRender: () => {
      scene.render();
      fps.tick();
    },
  });

  const downloadHandle = attachCsvDownload({ buffer: telemetry });

  const onResize = (): void => {
    scene.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    loop,
    scene,
    physics,
    telemetry,
    input,
    start: () => loop.run(),
    stop: () => loop.stop(),
    dispose: () => {
      loop.stop();
      window.removeEventListener('resize', onResize);
      downloadHandle.detach();
      input.dispose?.();
      scene.dispose();
      physics.free();
    },
  };
}
