import * as THREE from 'three';
import { buildTerrainGeometry, type Heightmap } from '../terrain/index.js';
import {
  type ChaseCameraParams,
  ChaseCameraState,
  type ChaseStepInput,
  type Vec3,
} from './camera.js';

const SKY_COLOR = 0x87ceeb;
const GROUND_COLOR = 0x4a7a3a;
const VEHICLE_COLOR = 0xff5544;

// Vehicle box dimensions (m): width × height × length. Length aligned with +Z
// at heading=0, matching the kinematic model's coordinate convention.
const VEHICLE_WIDTH = 1.8;
const VEHICLE_HEIGHT = 1.0;
const VEHICLE_LENGTH = 4.0;

export interface VehicleTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

export interface SceneHandle {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  render(): void;
  resize(width: number, height: number): void;
  // Read-only sync from vehicle state into the Three.js mesh transform.
  // The caller (app composition) is responsible for sampling the world-space
  // y from the heightmap; the scene just applies what it's given.
  updateVehicle(t: VehicleTransform): void;
  // Advances the chase camera one render frame and applies the result to
  // the underlying THREE.PerspectiveCamera.
  updateCamera(input: ChaseStepInput): void;
  // Snaps the chase camera to its steady-state position for the given vehicle
  // pose. Useful at bootstrap before any wall-clock dt has been measured.
  snapCamera(vehiclePos: Vec3, vehicleHeading: number): void;
  dispose(): void;
}

export interface CreateSceneOptions {
  readonly mount: HTMLElement;
  readonly width: number;
  readonly height: number;
  readonly heightmap: Heightmap;
  readonly chaseParams?: Partial<ChaseCameraParams>;
}

export function createScene(opts: CreateSceneOptions): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio : 1);
  renderer.setSize(opts.width, opts.height);
  renderer.setClearColor(SKY_COLOR);
  opts.mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);

  const camera = new THREE.PerspectiveCamera(60, opts.width / opts.height, 0.1, 2000);
  // Initial position will be overwritten by snapCamera in the app bootstrap;
  // these defaults are just so the very first render before snapCamera
  // doesn't show a black screen.
  camera.position.set(0, 4, -8);
  camera.lookAt(0, 1, 4);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(20, 30, 10);
  scene.add(sun);

  // Heightmap-derived terrain mesh replaces R0/R1/R2's flat ground plane.
  const terrainGeo = buildTerrainGeometry(opts.heightmap);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 1,
    flatShading: false,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  scene.add(terrainMesh);

  const vehicleGeo = new THREE.BoxGeometry(VEHICLE_WIDTH, VEHICLE_HEIGHT, VEHICLE_LENGTH);
  const vehicleMat = new THREE.MeshStandardMaterial({ color: VEHICLE_COLOR, roughness: 0.6 });
  const vehicleMesh = new THREE.Mesh(vehicleGeo, vehicleMat);
  // Initial pose, overwritten on first updateVehicle call.
  vehicleMesh.position.set(0, VEHICLE_HEIGHT / 2, 0);
  scene.add(vehicleMesh);

  const chase = new ChaseCameraState(opts.chaseParams);

  return {
    scene,
    camera,
    renderer,
    canvas: renderer.domElement,
    render: () => renderer.render(scene, camera),
    resize: (w: number, h: number) => {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    updateVehicle: (t: VehicleTransform) => {
      vehicleMesh.position.set(t.x, t.y, t.z);
      // heading is CCW positive when viewed from +Y, which corresponds to a
      // -Y axis rotation in the right-handed Three.js convention.
      vehicleMesh.rotation.set(0, -t.heading, 0);
    },
    updateCamera: (input: ChaseStepInput) => {
      const frame = chase.step(input);
      camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      camera.lookAt(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
    },
    snapCamera: (vehiclePos: Vec3, vehicleHeading: number) => {
      chase.snap(vehiclePos, vehicleHeading);
      camera.position.set(chase.position.x, chase.position.y, chase.position.z);
      camera.lookAt(chase.lookAt.x, chase.lookAt.y, chase.lookAt.z);
    },
    dispose: () => {
      renderer.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      vehicleGeo.dispose();
      vehicleMat.dispose();
      if (renderer.domElement.parentElement === opts.mount) {
        opts.mount.removeChild(renderer.domElement);
      }
    },
  };
}
