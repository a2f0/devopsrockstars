import {
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  type Side,
  SphereGeometry,
  Spherical,
  Vector3,
  WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createHatModel, disposeHatModel, type HatArtwork} from './hatModel';

// A long lens from slightly above, like New Era's catalogue photography.
const fieldOfView = 17;
const cameraDistance = 11.2;
const cameraAzimuth = Math.atan2(2.95, 4.7);
const cameraElevation = (13 * Math.PI) / 180;
const target = new Vector3(0, 0.46, 0.4);
// The cap sits on its stand pitched slightly front-up.
const standPitch = (-5 * Math.PI) / 180;

/**
 * A small product studio rendered once into an environment map: a dark
 * cyclorama with an overhead softbox, a key and fill box and two rim strips.
 * Black fabric reads almost entirely through reflections of large sources.
 */
function studioEnvironment(renderer: WebGLRenderer) {
  const studio = new Scene();
  const box = new BoxGeometry();
  const geometries = [
    new SphereGeometry(30, 32, 16),
    box,
    new PlaneGeometry(40, 40),
  ] as const;
  const materials: MeshBasicMaterial[] = [];
  const material = (color: Color, side: Side = BackSide) => {
    const result = new MeshBasicMaterial({color, side});
    materials.push(result);
    return result;
  };
  studio.add(new Mesh(geometries[0], material(new Color(0.02, 0.02, 0.02))));
  const panel = (
    width: number,
    height: number,
    position: [number, number, number],
    intensity: number
  ) => {
    // Values above 1 are fine: the PMREM target is half float.
    const mesh = new Mesh(
      box,
      material(new Color(1, 1, 1).multiplyScalar(intensity), FrontSide)
    );
    mesh.scale.set(width, height, 0.05);
    mesh.position.set(...position);
    mesh.lookAt(0, 0.4, 0);
    studio.add(mesh);
  };
  panel(9, 9, [0, 12, 1.5], 3.2);
  panel(6, 8, [-9, 5, 7], 6);
  panel(5, 7, [9, 3, 6], 0.7);
  panel(1.6, 10, [-8, 4, -8], 3.5);
  panel(1.6, 10, [8, 4, -8], 3.5);
  // A broad, dim bounce from behind the camera keeps the shadow side legible.
  panel(14, 8, [10, 3, 16], 0.3);
  // A grey sweep below lifts the under-visor and interior slightly.
  const floor = new Mesh(
    geometries[2],
    material(new Color(0.2, 0.2, 0.2), FrontSide)
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4;
  studio.add(floor);

  const generator = new PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, 0, 0.1, 100, {size: 64});
  } finally {
    generator.dispose();
    for (const item of materials) item.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}

// Builds the cap and its lighting, releasing the renderer if either fails so
// the preview can fall back to the static artwork.
function build(renderer: WebGLRenderer, artwork: HatArtwork) {
  let hat: Group | undefined;
  try {
    hat = createHatModel(
      artwork,
      Math.min(8, renderer.capabilities.getMaxAnisotropy())
    );
    return {hat, environment: studioEnvironment(renderer)};
  } catch (error) {
    if (hat) disposeHatModel(hat);
    renderer.dispose();
    throw error;
  }
}

export function createHatViewer(
  canvas: HTMLCanvasElement,
  artwork: HatArtwork
) {
  const renderer = new WebGLRenderer({canvas, alpha: true, antialias: true});
  renderer.toneMapping = NeutralToneMapping;
  const {hat, environment} = build(renderer, artwork);
  const scene = new Scene();
  scene.environment = environment.texture;
  scene.environmentIntensity = 2.5;
  const key = new DirectionalLight('#ffffff', 2.5);
  key.position.set(-3, 5, 4);
  scene.add(key);

  // The studio, lights and camera stay fixed and the cap turns on its stand,
  // so every view is lit like a catalogue shot. The controls drive a virtual
  // orbit camera whose motion is applied to the cap in reverse.
  const turntable = new Group();
  turntable.matrixAutoUpdate = false;
  const stand = new Object3D();
  stand.rotation.x = standPitch;
  stand.add(hat);
  turntable.add(stand);
  scene.add(turntable);

  const offset = new Vector3().setFromSphericalCoords(
    cameraDistance,
    Math.PI / 2 - cameraElevation,
    cameraAzimuth
  );
  const camera = new PerspectiveCamera(
    fieldOfView,
    1,
    cameraDistance - 4,
    cameraDistance + 4
  );
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const orbit = camera.clone();
  const controls = new OrbitControls(orbit, canvas);
  controls.target.copy(target);
  controls.enablePan = false;
  // Disable viewer zoom so the mouse wheel keeps scrolling the page.
  controls.enableZoom = false;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI - 0.08;
  controls.update();
  controls.saveState();

  // Render only when the view changes; an idle product uses no animation loop.
  const render = () => {
    orbit.updateMatrixWorld();
    turntable.matrix.multiplyMatrices(
      camera.matrixWorld,
      orbit.matrixWorldInverse
    );
    turntable.matrixWorldNeedsUpdate = true;
    renderer.render(scene, camera);
  };
  const resize = () => {
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    // Supersample even on 1x displays: it resolves stitching and twill.
    renderer.setPixelRatio(2);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  controls.addEventListener('change', render);
  resize();

  return {
    rotate(horizontal: number, vertical = 0) {
      const position = new Vector3().subVectors(
        orbit.position,
        controls.target
      );
      const spherical = new Spherical().setFromVector3(position);
      spherical.theta += horizontal;
      spherical.phi = Math.max(
        controls.minPolarAngle,
        Math.min(controls.maxPolarAngle, spherical.phi + vertical)
      );
      orbit.position
        .copy(controls.target)
        .add(position.setFromSpherical(spherical));
      controls.update();
    },
    reset() {
      controls.reset();
    },
    dispose() {
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      disposeHatModel(hat);
      environment.dispose();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}
