import RAPIER from '@dimforge/rapier3d-compat';

export interface PhysicsWorldOptions {
  readonly gravityY?: number;
  readonly fixedDt?: number;
}

export interface PhysicsWorld {
  readonly world: RAPIER.World;
  readonly ground: RAPIER.RigidBody;
  step(): void;
  free(): void;
}

let initPromise: Promise<void> | null = null;

export async function ensureRapierReady(): Promise<void> {
  if (!initPromise) initPromise = RAPIER.init();
  await initPromise;
}

// Spec calls for "enhanced-determinism mode" but rapier3d-compat 0.19.x no
// longer exposes a separate enhanced-determinism flag — the single-threaded
// WASM solver in this build is deterministic by default for cross-run replay
// on the same machine + lockfile. We rely on that and use a fixed timestep
// driven externally by the sim core.
export async function createPhysicsWorld(opts: PhysicsWorldOptions = {}): Promise<PhysicsWorld> {
  await ensureRapierReady();
  const gravityY = opts.gravityY ?? -9.81;
  const fixedDt = opts.fixedDt ?? 1 / 240;
  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  world.timestep = fixedDt;

  const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
  const ground = world.createRigidBody(groundDesc);
  // Large finite plane stand-in; a true infinite plane would require
  // halfspaces, which rapier3d-compat does not expose directly.
  const groundCollider = RAPIER.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0);
  world.createCollider(groundCollider, ground);

  return {
    world,
    ground,
    step: () => world.step(),
    free: () => world.free(),
  };
}

export function rapier(): typeof RAPIER {
  return RAPIER;
}
