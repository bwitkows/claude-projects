import * as THREE from 'three';

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
  // Safe for the renderer to call each frame; SHALL NOT mutate the source.
  updateVehicle(t: VehicleTransform): void;
  dispose(): void;
}

export interface CreateSceneOptions {
  readonly mount: HTMLElement;
  readonly width: number;
  readonly height: number;
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
  camera.position.set(0, 6, 14);
  camera.lookAt(0, 1, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(20, 30, 10);
  scene.add(sun);

  const groundGeo = new THREE.PlaneGeometry(1000, 1000, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, 0, 0);
  scene.add(ground);

  const vehicleGeo = new THREE.BoxGeometry(VEHICLE_WIDTH, VEHICLE_HEIGHT, VEHICLE_LENGTH);
  const vehicleMat = new THREE.MeshStandardMaterial({ color: VEHICLE_COLOR, roughness: 0.6 });
  const vehicleMesh = new THREE.Mesh(vehicleGeo, vehicleMat);
  vehicleMesh.position.set(0, VEHICLE_HEIGHT / 2, 0);
  scene.add(vehicleMesh);

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
      vehicleMesh.position.set(t.x, VEHICLE_HEIGHT / 2, t.z);
      // heading is CCW positive when viewed from +Y, which corresponds to a
      // -Y axis rotation in the right-handed Three.js convention.
      vehicleMesh.rotation.set(0, -t.heading, 0);
    },
    dispose: () => {
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      vehicleGeo.dispose();
      vehicleMat.dispose();
      if (renderer.domElement.parentElement === opts.mount) {
        opts.mount.removeChild(renderer.domElement);
      }
    },
  };
}
