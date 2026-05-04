import { type InputSource, KeyboardInputSource } from '../input/index.js';
import { createPhysicsWorld, type PhysicsWorld } from '../physics/index.js';
import { createScene, FpsCounter, type SceneHandle } from '../render/index.js';
import { FixedStepLoop, SimClock } from '../sim/index.js';
import { attachCsvDownload, TelemetryBuffer } from '../telemetry/index.js';
import { BicycleVehicle, type VehicleModel } from '../vehicle/index.js';

export interface AppHandle {
  readonly loop: FixedStepLoop;
  readonly scene: SceneHandle;
  readonly physics: PhysicsWorld;
  readonly telemetry: TelemetryBuffer;
  readonly input: InputSource;
  // Exposed as the abstract interface so external consumers don't depend on
  // the concrete model. Internally the bootstrap holds a typed reference for
  // telemetry access to bicycle-specific state.
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
  const vehicle = new BicycleVehicle();
  const clock = new SimClock();

  // Sim ordering per spec: input is sampled once before integration; then the
  // vehicle is stepped; then Rapier (still present from R0 — the bicycle
  // vehicle, like the kinematic, does not interact with it but the world is
  // part of the scaffold); then telemetry is recorded with post-step state.
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
        vx: v.vx,
        vy: v.vy,
        yaw_rate: v.yawRate,
        slip_f: v.slipF,
        slip_r: v.slipR,
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
