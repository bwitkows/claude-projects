import * as THREE from 'three';
import type { Heightmap } from './heightmap.js';

export interface BuildTerrainOptions {
  readonly size?: number; // total side length (m)
  readonly segments?: number; // cells per side; vertices = (segments+1)²
}

export const DEFAULT_TERRAIN_SIZE = 200;
export const DEFAULT_TERRAIN_SEGMENTS = 128;

// Builds a heightmap-shaped BufferGeometry centered on the origin. Vertices
// are sampled from heightmap.heightAt at a regular (segments+1)² grid.
// Triangulation: each cell is split into two triangles (a-c-b, b-c-d) using
// the canonical clockwise-when-viewed-from-+Y winding so face normals point up.
export function buildTerrainGeometry(
  heightmap: Heightmap,
  opts: BuildTerrainOptions = {},
): THREE.BufferGeometry {
  const size = opts.size ?? DEFAULT_TERRAIN_SIZE;
  const segments = opts.segments ?? DEFAULT_TERRAIN_SEGMENTS;
  if (segments < 1 || !Number.isInteger(segments)) {
    throw new Error(`buildTerrainGeometry: segments must be a positive integer (got ${segments})`);
  }

  const verts = segments + 1;
  const positions = new Float32Array(verts * verts * 3);
  const half = size / 2;
  const cell = size / segments;

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

  const indices: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * verts + j;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      // Two triangles per cell. Winding chosen so computeVertexNormals points +Y.
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
