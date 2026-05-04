import { describe, expect, it } from 'vitest';
import { Heightmap } from './heightmap.js';
import { buildTerrainGeometry } from './mesh.js';

describe('buildTerrainGeometry', () => {
  it('produces (segments+1)² vertex positions', () => {
    const h = new Heightmap();
    const segments = 64;
    const geo = buildTerrainGeometry(h, { segments });
    const expectedCount = (segments + 1) ** 2;
    const positions = geo.getAttribute('position') as { count: number };
    expect(positions.count).toBe(expectedCount);
  });

  it('produces segments² * 6 triangle index entries', () => {
    const h = new Heightmap();
    const segments = 32;
    const geo = buildTerrainGeometry(h, { segments });
    const index = geo.getIndex();
    expect(index).not.toBeNull();
    expect(index!.count).toBe(segments * segments * 2 * 3);
  });

  it('contains no NaN or Infinity vertex positions', () => {
    const h = new Heightmap();
    const geo = buildTerrainGeometry(h, { segments: 16, size: 100 });
    const positions = geo.getAttribute('position') as { array: ArrayLike<number>; count: number };
    for (let i = 0; i < positions.count * 3; i += 1) {
      expect(Number.isFinite(positions.array[i])).toBe(true);
    }
  });

  it('vertex y values match heightmap.heightAt at the grid points', () => {
    const h = new Heightmap();
    const segments = 8;
    const size = 80;
    const geo = buildTerrainGeometry(h, { segments, size });
    const positions = geo.getAttribute('position') as { array: ArrayLike<number> };
    const verts = segments + 1;
    const cell = size / segments;
    const half = size / 2;
    for (let i = 0; i <= segments; i += 1) {
      for (let j = 0; j <= segments; j += 1) {
        const idx = (i * verts + j) * 3;
        const x = -half + j * cell;
        const z = -half + i * cell;
        expect(positions.array[idx]).toBeCloseTo(x, 5);
        expect(positions.array[idx + 1]).toBeCloseTo(h.heightAt(x, z), 5);
        expect(positions.array[idx + 2]).toBeCloseTo(z, 5);
      }
    }
  });

  it('rejects invalid segments', () => {
    const h = new Heightmap();
    expect(() => buildTerrainGeometry(h, { segments: 0 })).toThrow();
    expect(() => buildTerrainGeometry(h, { segments: 1.5 })).toThrow();
    expect(() => buildTerrainGeometry(h, { segments: -4 })).toThrow();
  });
});
