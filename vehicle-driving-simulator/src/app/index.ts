import { type InputSource, KeyboardInputSource } from '../input/index.js';
import { createPhysicsWorld, type PhysicsWorld } from '../physics/index.js';
import { ControlsOverlay, createScene, FpsCounter, type SceneHandle } from '../render/index.js';
import { FixedStepLoop, SimClock } from '../sim/index.js';
import { attachCsvDownload, TelemetryBuffer } from '../telemetry/index.js';
import { Heightmap } from '../terrain/index.js';
import { BicycleVehicle, type VehicleModel } from '../vehicle/index.js';

// Vehicle's mesh sits this far above the terrain surface — half the box
// height, matching where R2's vehicle sat above the flat ground.
const RIDE_HEIGHT = 0.5;

export interface AppHandle {
  readonly loop: FixedStepLoop;
  readonly scene: SceneHandle;
  readonly physics: PhysicsWorld;
  readonly telemetry: TelemetryBuffer;
  readonly input: InputSource;
  readonly heightmap: Heightmap;
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
  readonly controlsElement?: HTMLElement;
}

export async function bootstrap(opts: BootstrapOptions): Promise<AppHandle> {
  const physics = await createPhysicsWorld();
  const heightmap = new Heightmap();
  const scene = createScene({
    mount: opts.mount,
    width: opts.mount.clientWidth || window.innerWidth,
    height: opts.mount.clientHeight || window.innerHeight,
    heightmap,
  });
  const fps = new FpsCounter(opts.fpsElement);
  const controlsOverlay = opts.controlsElement ? new ControlsOverlay(opts.controlsElement) : null;
  const telemetry = new TelemetryBuffer();
  const input = new KeyboardInputSource();
  const vehicle = new BicycleVehicle();
  const clock = new SimClock();

  // Snap chase camera to its steady-state pose for the initial vehicle state
  // so the very first rendered frame is correctly framed. After this point
  // the camera evolves via exponential decay each render frame.
  {
    const v0 = vehicle.state;
    const y0 = heightmap.heightAt(v0.x, v0.z) + RIDE_HEIGHT;
    scene.snapCamera({ x: v0.x, y: y0, z: v0.z }, v0.heading);
  }

  // Render-frame wall-clock dt for the chase camera. R3 introduces a render-
  // time piece of state (camera) that lives outside the deterministic sim
  // loop, so we track wall-clock dt locally rather than threading it through
  // FixedStepLoop's onRender callback (which only knows about sim alpha).
  let lastRenderMs = performance.now();

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
      const nowMs = performance.now();
      const renderDt = Math.max(0, (nowMs - lastRenderMs) / 1000);
      lastRenderMs = nowMs;
      const v = vehicle.state;
      const worldY = heightmap.heightAt(v.x, v.z) + RIDE_HEIGHT;
      scene.updateVehicle({ x: v.x, y: worldY, z: v.z, heading: v.heading });
      scene.updateCamera({
        vehiclePos: { x: v.x, y: worldY, z: v.z },
        vehicleHeading: v.heading,
        dt: renderDt,
      });
      // Refresh the keyboard overlay each frame from the abstract control
      // state. Re-reading input here doesn't affect the sim (sim sampled it
      // already in onStep) — it's purely a UI refresh.
      if (controlsOverlay) controlsOverlay.update(input.read(clock.time));
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
    heightmap,
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
