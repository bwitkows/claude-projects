import { type InputSource, KeyboardInputSource } from '../input/index.js';
import { createPhysicsWorld, type PhysicsWorld } from '../physics/index.js';
import { createScene, FpsCounter, type SceneHandle } from '../render/index.js';
import { FixedStepLoop, SimClock } from '../sim/index.js';
import { attachCsvDownload, TelemetryBuffer } from '../telemetry/index.js';
import { KinematicVehicle, type VehicleModel } from '../vehicle/index.js';

export interface AppHandle {
  readonly loop: FixedStepLoop;
  readonly scene: SceneHandle;
  readonly physics: PhysicsWorld;
  readonly telemetry: TelemetryBuffer;
  readonly input: InputSource;
  readonly vehicle: VehicleModel;
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
  const vehicle = new KinematicVehicle();
  const clock = new SimClock();

  // Sim ordering per spec: input is sampled once before integration; then the
  // vehicle is stepped; then Rapier (still present from R0 — the kinematic
  // vehicle does not interact with it but the world is part of the scaffold);
  // then telemetry is recorded with post-step vehicle state.
  const loop = new FixedStepLoop({
    clock,
    onStep: (s) => {
      const control = input.read(s.time);
      vehicle.step(s.dt, control);
      physics.step();
      const v = vehicle.state;
      telemetry.push({
        t: s.time,
        step: s.step,
        x: v.x,
        z: v.z,
        heading: v.heading,
        speed: v.speed,
      });
    },
    onRender: () => {
      const v = vehicle.state;
      scene.updateVehicle({ x: v.x, z: v.z, heading: v.heading });
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
    vehicle,
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
