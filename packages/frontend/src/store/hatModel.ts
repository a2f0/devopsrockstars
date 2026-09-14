import {
  Box3,
  CatmullRomCurve3,
  DataTexture,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import {ParametricGeometry} from 'three/addons/geometries/ParametricGeometry.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';

// Proportions follow New Era's Low Profile reference photos; see the artwork README.
const height = 1.3;
const width = 1.08;
const depth = 1.15;
const billTop = 0.015;
// Keep the visor's side overhang modest relative to the low crown.
const billWidthScale = 0.885;
const billDepthScale = 0.78;

export interface HatArtwork {
  front: string;
  side: string;
  rear: string;
}

function crownPoint(angle: number, elevation: number, offset = 0) {
  const radius = Math.cos(elevation);
  return new Vector3(
    (width * radius + offset) * Math.sin(angle),
    height * Math.sin(elevation) ** 0.72,
    (depth * radius + offset) * Math.cos(angle)
  );
}

// A small repeating weave gives the black fabric enough relief to read in light.
function fabricTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = 100 + ((x + y) % 4) * 25 + ((x * 17 + y * 13) % 19);
      const index = (y * size + x) * 4;
      pixels.set([value, value, value, 255], index);
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(20, 12);
  texture.needsUpdate = true;
  return texture;
}

function frontLogo(source: string) {
  // Reuse the original vector paths, including their Illustrator transforms.
  // The silhouette has no depth information; only the Logo group is projected.
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  const logo = document.getElementById('Logo');
  if (!logo || document.querySelector('parsererror')) {
    throw new Error('The hat SVG is missing its logo.');
  }
  const svg = document.documentElement.cloneNode(false);
  svg.appendChild(logo.cloneNode(true));
  return new XMLSerializer().serializeToString(svg);
}

function addLogo(
  hat: Group,
  source: string,
  placement: {
    name: string;
    angle: number;
    width: number;
    y: number;
    centerOnPath?: string;
  }
) {
  const data = new SVGLoader().parse(source);
  const geometries = data.paths.map(
    path => new ShapeGeometry(SVGLoader.createShapes(path))
  );
  const bounds = new Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
  }
  const center = bounds.getCenter(new Vector3());
  if (placement.centerOnPath) {
    const anchor =
      geometries[
        data.paths.findIndex(path => {
          const node = path.userData?.['node'];
          return node instanceof Element && node.id === placement.centerOnPath;
        })
      ]?.boundingBox;
    if (!anchor || anchor.isEmpty()) {
      for (const geometry of geometries) geometry.dispose();
      throw new Error('The hat artwork is missing its alignment anchor.');
    }
    // Keep the complete mark together, with the star centered on the seam.
    center.x = anchor.getCenter(new Vector3()).x;
  }
  const sourceWidth = bounds.getSize(new Vector3()).x;
  const scale = placement.width / sourceWidth;
  const halfHeight = (bounds.getSize(new Vector3()).y * scale) / 2;
  if (
    !Number.isFinite(scale) ||
    placement.y - halfHeight < 0 ||
    placement.y + halfHeight >= height
  ) {
    for (const geometry of geometries) geometry.dispose();
    throw new Error('The hat artwork does not fit on the crown.');
  }
  // Subdivide filled areas before wrapping them, so the badge's center follows
  // the crown instead of cutting through it between widely spaced vertices.
  const tessellate = new TessellateModifier(sourceWidth / 12, 6);
  for (const [index, original] of geometries.entries()) {
    const geometry = tessellate.modify(original);
    original.dispose();
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = (positions.getX(i) - center.x) * scale;
      const y = placement.y - (positions.getY(i) - center.y) * scale;
      const elevation = Math.asin((y / height) ** (1 / 0.72));
      const tangentRadius =
        Math.hypot(
          width * Math.cos(placement.angle),
          depth * Math.sin(placement.angle)
        ) * Math.cos(elevation);
      const point = crownPoint(
        placement.angle + x / tangentRadius,
        elevation,
        0.012 + index * 0.002
      );
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
    const embroidery = new MeshStandardMaterial({
      color: data.paths[index]?.color ?? '#f4f4f4',
      roughness: 0.94,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, embroidery);
    mesh.name = placement.name;
    hat.add(mesh);
  }
}

export function createHatModel(artwork: HatArtwork) {
  const hat = new Group();
  const bumpMap = fabricTexture();
  const fabric = new MeshStandardMaterial({
    color: '#191a1c',
    roughness: 0.94,
    bumpMap,
    bumpScale: 0.008,
    side: DoubleSide,
  });
  const thread = new MeshStandardMaterial({color: '#343538', roughness: 1});
  const underside = new MeshStandardMaterial({color: '#0c0d0e', roughness: 1});
  const crown = new ParametricGeometry(
    (u, v, target) =>
      target.copy(crownPoint(u * Math.PI * 2, (v * Math.PI) / 2)),
    96,
    48
  );
  hat.add(new Mesh(crown, fabric));

  // Six panels, with a covered button and an open fitted band underneath.
  for (let panel = 0; panel < 6; panel++) {
    const angle = (panel * Math.PI) / 3;
    const points = Array.from({length: 49}, (_, i) =>
      crownPoint(angle, ((i / 48) * Math.PI) / 2, 0.006)
    );
    hat.add(
      new Mesh(
        new TubeGeometry(new CatmullRomCurve3(points), 48, 0.006, 5, false),
        thread
      )
    );
    const eyelet = new Mesh(new TorusGeometry(0.026, 0.007, 6, 16), thread);
    eyelet.position.copy(crownPoint(angle + Math.PI / 6, 0.7, 0.006));
    eyelet.lookAt(
      eyelet.position
        .clone()
        .add(
          new Vector3(
            Math.sin(angle + Math.PI / 6),
            0.6,
            Math.cos(angle + Math.PI / 6)
          )
        )
    );
    hat.add(eyelet);
  }
  const button = new Mesh(new SphereGeometry(0.09, 24, 12), fabric);
  button.scale.y = 0.45;
  button.position.y = height;
  hat.add(button);

  const band = new Mesh(new TorusGeometry(1, 0.045, 10, 96), underside);
  band.rotation.x = Math.PI / 2;
  band.scale.set(width, depth, 1);
  band.position.y = 0.02;
  hat.add(band);

  const bill = new Shape();
  bill.moveTo(-0.98, 0.38);
  bill.bezierCurveTo(-0.7, 1.15, 0.7, 1.15, 0.98, 0.38);
  bill.bezierCurveTo(1.34, 0.73, 1.47, 1.55, 1.08, 1.94);
  bill.bezierCurveTo(0.61, 2.31, -0.61, 2.31, -1.08, 1.94);
  bill.bezierCurveTo(-1.47, 1.55, -1.34, 0.73, -0.98, 0.38);
  // A factory-flat visor has parallel top and bottom surfaces throughout.
  const billGeometry = new ExtrudeGeometry(bill, {
    depth: 0.055,
    bevelEnabled: false,
    curveSegments: 36,
    steps: 1,
  });
  const positions = billGeometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) * billWidthScale;
    const z = 0.38 + (positions.getY(i) - 0.38) * billDepthScale;
    const y = billTop - positions.getZ(i);
    positions.setXYZ(i, x, y, z);
  }
  billGeometry.computeVertexNormals();
  hat.add(new Mesh(billGeometry, fabric));

  // Concentric stitching lies just above the flat top of the bill.
  for (let row = 0; row < 5; row++) {
    const points = Array.from({length: 65}, (_, i) => {
      const angle = -1.05 + (i / 64) * 2.1;
      const x = (1.38 - row * 0.065) * Math.sin(angle) * billWidthScale;
      const z =
        0.38 + (0.35 + (1.43 - row * 0.085) * Math.cos(angle)) * billDepthScale;
      return new Vector3(x, billTop + 0.007, z);
    });
    hat.add(
      new Mesh(
        new TubeGeometry(new CatmullRomCurve3(points), 64, 0.003, 4, false),
        thread
      )
    );
  }
  try {
    addLogo(hat, frontLogo(artwork.front), {
      name: 'Front embroidery',
      angle: 0,
      width: 0.92,
      y: height * 0.52,
      centerOnPath: 'path3757_2_',
    });
    // +X is the viewer's right when facing the front (the wearer's left).
    addLogo(hat, artwork.side, {
      name: 'New Era flag',
      angle: Math.PI / 2,
      width: 0.34,
      y: 0.32,
    });
    addLogo(hat, artwork.rear, {
      name: 'MLB Batterman',
      angle: Math.PI,
      width: 0.4,
      y: 0.21,
    });
  } catch (error) {
    disposeHatModel(hat);
    throw error;
  }
  return hat;
}

export function disposeHatModel(hat: Group) {
  const materials = new Set<MeshStandardMaterial>();
  hat.traverse(object => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      const entries = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of entries) materials.add(material);
    }
  });
  for (const material of materials) {
    material.bumpMap?.dispose();
    material.dispose();
  }
}
