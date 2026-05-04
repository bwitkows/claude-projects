import RAPIER from '@dimforge/rapier3d-compat';
import type { Heightmap } from '../terrain/index.js';
import type { BuildTerrainOptions } from '../terrain/mesh.js';

export interface PhysicsWorldOptions {
  readonly gravityY?: number;
  readonly fixedDt?: number;
  // R0 added a 1000×0.2×1000 cuboid ground at y=0 for tests. R4 wants the
  // heightmap-trimesh to be the only ground, so it can disable the cuboid.
  readonly includeGroundPlane?: boolean;
}

export interface PhysicsWorld {
  readonly world: RAPIER.World;
  readonly ground: RAPIER.RigidBody | null;
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
  const includeGroundPlane = opts.includeGroundPlane ?? true;
  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  world.timestep = fixedDt;

  let ground: RAPIER.RigidBody | null = null;
  if (includeGroundPlane) {
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    ground = world.createRigidBody(groundDesc);
    // Large finite plane stand-in; a true infinite plane would require
    // halfspaces, which rapier3d-compat does not expose directly.
    const groundCollider = RAPIER.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0);
    world.createCollider(groundCollider, ground);
  }

  return {
    world,
    ground,
    step: () => world.step(),
    free: () => world.free(),
  };
}

export interface AddTerrainColliderOptions extends BuildTerrainOptions {}

export interface TerrainColliderHandle {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly triangleCount: number;
}

// Builds a Rapier trimesh collider from the heightmap using the same vertex
// grid as `buildTerrainGeometry`, attached to a new fixed body at the world
// origin. The trimesh is what wheel raycasts hit in R4. Rapier expects
// vertices as Float32Array of (x,y,z) triples and indices as Uint32Array.
export function addTerrainCollider(
  world: RAPIER.World,
  heightmap: Heightmap,
  opts: AddTerrainColliderOptions = {},
): TerrainColliderHandle {
  const segments = opts.segments ?? 128;
  const size = opts.size ?? 200;
  const verts = segments + 1;
  const half = size / 2;
  const cell = size / segments;

  const positions = new Float32Array(verts * verts * 3);
  for (let i = 0; i <= segments; i += 1) {
    for (let j = 0; j <= segments; j += 1) {
      const x = -half + j * cell;
      const z = -half + i * cell;
      const y = heightmap.heightAt(x, z);
      const idx = (i * verts + j) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  const indices = new Uint32Array(segments * segments * 6);
  let k = 0;
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * verts + j;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const bodyDesc = RAPIER.RigidBodyDesc.fixed();
  const body = world.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.trimesh(positions, indices);
  const collider = world.createCollider(colliderDesc, body);

  return { body, collider, triangleCount: segments * segments * 2 };
}

export function rapier(): typeof RAPIER {
  return RAPIER;
}
