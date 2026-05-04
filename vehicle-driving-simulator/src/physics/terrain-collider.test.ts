import { describe, expect, it } from 'vitest';
import { Heightmap } from '../terrain/heightmap.js';
import { addTerrainCollider, createPhysicsWorld, ensureRapierReady, rapier } from './world.js';

describe('addTerrainCollider', () => {
  it('attaches a trimesh collider with the expected triangle count', async () => {
    const phys = await createPhysicsWorld({ includeGroundPlane: false });
    const heightmap = new Heightmap();
    const handle = addTerrainCollider(phys.world, heightmap, { segments: 32, size: 100 });
    expect(handle.triangleCount).toBe(32 * 32 * 2);
    expect(phys.world.colliders.len()).toBeGreaterThan(0);
    phys.free();
  });

  it('downward raycast from above origin returns a hit at heightmap.heightAt(0,0)', async () => {
    await ensureRapierReady();
    const RAPIER = rapier();
    const phys = await createPhysicsWorld({ includeGroundPlane: false });
    const heightmap = new Heightmap();
    addTerrainCollider(phys.world, heightmap, { segments: 64, size: 200 });
    // Step once so Rapier's broad phase indexes the new collider before
    // queries hit it.
    phys.step();
    const expectedY = heightmap.heightAt(0, 0);
    const ray = new RAPIER.Ray({ x: 0, y: 50, z: 0 }, { x: 0, y: -1, z: 0 });
    const hit = phys.world.castRayAndGetNormal(ray, 100, true);
    expect(hit).not.toBeNull();
    if (hit) {
      // hitY = origin.y + dir.y * timeOfImpact = 50 - timeOfImpact
      const hitY = 50 - hit.timeOfImpact;
      // Trimesh interpolates linearly so the hit may differ from the analytic
      // function by up to ~1 cm at the chosen segments=64 resolution.
      expect(Math.abs(hitY - expectedY)).toBeLessThan(0.05);
      // Surface normal points roughly +Y.
      expect(hit.normal.y).toBeGreaterThan(0.5);
    }
    phys.free();
  });

  it('downward raycast at an off-grid location matches the analytic heightmap within a vertex of resolution', async () => {
    await ensureRapierReady();
    const RAPIER = rapier();
    const phys = await createPhysicsWorld({ includeGroundPlane: false });
    const heightmap = new Heightmap();
    addTerrainCollider(phys.world, heightmap, { segments: 128, size: 200 });
    phys.step();
    const samples: [number, number][] = [
      [12.5, -7.3],
      [-25, 15],
      [50.5, 0.1],
    ];
    for (const [x, z] of samples) {
      const ray = new RAPIER.Ray({ x, y: 50, z }, { x: 0, y: -1, z: 0 });
      const hit = phys.world.castRayAndGetNormal(ray, 100, true);
      expect(hit).not.toBeNull();
      if (hit) {
        const hitY = 50 - hit.timeOfImpact;
        expect(Math.abs(hitY - heightmap.heightAt(x, z))).toBeLessThan(0.05);
      }
    }
    phys.free();
  });
});
