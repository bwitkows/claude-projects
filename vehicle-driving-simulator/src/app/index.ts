import { type InputSource, KeyboardInputSource } from '../input/index.js';
import { addTerrainCollider, createPhysicsWorld, type PhysicsWorld } from '../physics/index.js';
import { ControlsOverlay, createScene, FpsCounter, type SceneHandle } from '../render/index.js';
import { FixedStepLoop, SimClock } from '../sim/index.js';
import {
  attachCsvDownload,
  Recorder,
  serializeRecording,
  TelemetryBuffer,
} from '../telemetry/index.js';
import { Heightmap } from '../terrain/index.js';
import { FourWheelVehicle, type VehicleModel } from '../vehicle/index.js';

// Vehicle ride-height is now owned by FourWheelVehicle (it sets body Y from
// terrain.heightAt + its own rideHeight). This constant is kept only for the
// initial chase-camera snap before the first sim step has run.
const INITIAL_CAMERA_RIDE = 0.5;

export interface AppHandle {
  readonly loop: FixedStepLoop;
  readonly scene: SceneHandle;
  readonly physics: PhysicsWorld;
  readonly telemetry: TelemetryBuffer;
  readonly recorder: Recorder;
  readonly input: InputSource;
  readonly heightmap: Heightmap;
  readonly vehicle: VehicleModel;
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface BootstrapOptions {
  readonly mount: HTMLElement;
  readonly fpsElement: HTMLElement;
  readonly controlsElement?: HTMLElement;
  readonly recElement?: HTMLElement;
}

export async function bootstrap(opts: BootstrapOptions): Promise<AppHandle> {
  // R4 makes terrain a Rapier collider — skip the R0 flat-plane ground so
  // wheel raycasts hit only the trimesh.
  const physics = await createPhysicsWorld({ includeGroundPlane: false });
  const heightmap = new Heightmap();
  // Build the trimesh terrain collider, then run one warmup physics step so
  // Rapier's broad phase indexes the collider before the first wheel raycast.
  addTerrainCollider(physics.world, heightmap);
  physics.step();

  const scene = createScene({
    mount: opts.mount,
    width: opts.mount.clientWidth || window.innerWidth,
    height: opts.mount.clientHeight || window.innerHeight,
    heightmap,
  });
  const fps = new FpsCounter(opts.fpsElement);
  const controlsOverlay = opts.controlsElement ? new ControlsOverlay(opts.controlsElement) : null;
  const telemetry = new TelemetryBuffer();
  const recorder = new Recorder({ rung: 'R7', vehicle: 'FourWheelVehicle' });
  const input = new KeyboardInputSource();
  const vehicle = new FourWheelVehicle({ world: physics.world, terrain: heightmap });
  const clock = new SimClock();

  // Snap chase camera to its steady-state pose for the initial vehicle state.
  {
    const v0 = vehicle.state;
    const y0 = heightmap.heightAt(v0.x, v0.z) + INITIAL_CAMERA_RIDE;
    scene.snapCamera({ x: v0.x, y: y0, z: v0.z }, v0.heading);
  }

  let lastRenderMs = performance.now();

  // R8: 'R' key toggles recording. On stop, downloads JSON of the recorded
  // run — parallel to R0's 'T' key for CSV download. Prevents auto-repeat
  // by ignoring `event.repeat`.
  const setRecIndicator = (active: boolean): void => {
    if (!opts.recElement) return;
    if (active) {
      opts.recElement.classList.add('active');
      opts.recElement.textContent = 'REC ●';
    } else {
      opts.recElement.classList.remove('active');
      opts.recElement.textContent = 'REC ⚪ (R to start)';
    }
  };

  const onRecKey = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() !== 'r') return;
    if (recorder.isRunning()) {
      const finalStep = { dt: clock.dt, step: clock.step, time: clock.time };
      const recording = recorder.stop(finalStep, vehicle.state);
      const blob = new Blob([serializeRecording(recording)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setRecIndicator(false);
    } else {
      const v = vehicle.state;
      recorder.start({ x: v.x, z: v.z, heading: v.heading });
      setRecIndicator(true);
    }
  };
  window.addEventListener('keydown', onRecKey);
  setRecIndicator(false);

  const loop = new FixedStepLoop({
    clock,
    onStep: (s) => {
      const control = input.read(s.time);
      vehicle.step(s.dt, control);
      physics.step();
      // `vehicle` is typed as the concrete FourWheelVehicle inside this
      // closure even though the AppHandle exposes only `VehicleModel`.
      const v = vehicle.state;
      const w = v.wheels;
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
        fz_fl: w.fl.fz,
        fz_fr: w.fr.fz,
        fz_rl: w.rl.fz,
        fz_rr: w.rr.fz,
        c_fl: w.fl.compression,
        c_fr: w.fr.compression,
        c_rl: w.rl.compression,
        c_rr: w.rr.compression,
      });
      // R8: feed the recorder when running. Lives alongside the CSV
      // telemetry; both subscribe to the same onStep.
      if (recorder.isRunning()) {
        recorder.observe(s, control, v);
      }
    },
    onRender: () => {
      const nowMs = performance.now();
      const renderDt = Math.max(0, (nowMs - lastRenderMs) / 1000);
      lastRenderMs = nowMs;
      const v = vehicle.state;
      // R4: body Y is owned by FourWheelVehicle (it sets it from terrain
      // each step). The vehicle mesh's render Y comes directly from the
      // body's translation, not from a fresh heightmap sample.
      const worldY = heightmap.heightAt(v.x, v.z) + INITIAL_CAMERA_RIDE;
      scene.updateVehicle({ x: v.x, y: worldY, z: v.z, heading: v.heading });
      scene.updateCamera({
        vehiclePos: { x: v.x, y: worldY, z: v.z },
        vehicleHeading: v.heading,
        dt: renderDt,
      });
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
    recorder,
    input,
    heightmap,
    vehicle,
    start: () => loop.run(),
    stop: () => loop.stop(),
    dispose: () => {
      loop.stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onRecKey);
      downloadHandle.detach();
      input.dispose?.();
      scene.dispose();
      physics.free();
    },
  };
}
