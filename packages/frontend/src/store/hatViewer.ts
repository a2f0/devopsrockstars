import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createHatModel, disposeHatModel} from './hatModel';

export function createHatViewer(canvas: HTMLCanvasElement, svg: string) {
  const renderer = new WebGLRenderer({canvas, alpha: true, antialias: true});
  const scene = new Scene();
  let hat: ReturnType<typeof createHatModel>;
  try {
    hat = createHatModel(svg);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  scene.add(hat);
  scene.add(new HemisphereLight('#ffffff', '#626776', 2.2));
  const key = new DirectionalLight('#ffffff', 4);
  key.position.set(-3, 5, 4);
  const rim = new DirectionalLight('#b8c6dc', 3);
  rim.position.set(3, 2, -3);
  scene.add(key, rim);

  const camera = new PerspectiveCamera(34, 1, 0.1, 40);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.38, 0.55);
  camera.position.set(3.15, 2.35, 5.55);
  controls.enablePan = false;
  // Disable viewer zoom so the mouse wheel keeps scrolling the page.
  controls.enableZoom = false;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI - 0.08;
  controls.update();
  controls.saveState();

  // Render only when the view changes; an idle product uses no animation loop.
  const render = () => renderer.render(scene, camera);
  const resize = () => {
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
      const offset = new Vector3().subVectors(camera.position, controls.target);
      const spherical = new Spherical().setFromVector3(offset);
      spherical.theta += horizontal;
      spherical.phi = Math.max(
        controls.minPolarAngle,
        Math.min(controls.maxPolarAngle, spherical.phi + vertical)
      );
      camera.position
        .copy(controls.target)
        .add(offset.setFromSpherical(spherical));
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
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}
