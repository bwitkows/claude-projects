import * as THREE from 'three';

const SKY_COLOR = 0x87ceeb;
const GROUND_COLOR = 0x4a7a3a;

export interface SceneHandle {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  render(): void;
  resize(width: number, height: number): void;
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

  // Visual reference origin marker so the scene is not visually empty in R0.
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xff5544 }),
  );
  marker.position.set(0, 0.25, 0);
  scene.add(marker);

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
    dispose: () => {
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
      if (renderer.domElement.parentElement === opts.mount) {
        opts.mount.removeChild(renderer.domElement);
      }
    },
  };
}
