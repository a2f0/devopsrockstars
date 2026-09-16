import {type BufferGeometry, Vector3} from 'three';
import {
  crownHeight,
  halfDepth,
  halfWidth,
  radiusFraction,
  tAtHeight,
  visorOutline,
  visorRoot,
  visorThickness,
  visorTop,
} from './shape';

// Per-vertex occlusion is baked once on the CPU into the color attribute. It
// darkens direct and image-based light alike, which is right for the tight
// creases of a cap, and it is deterministic, unlike screen-space AO.

export type Solid = (x: number, y: number, z: number) => boolean;

const TAU = Math.PI * 2;

/** The crown as a solid, from a table of wall radii by azimuth and height. */
export function crownSolid(): Solid {
  const angles = 96;
  const heights = 64;
  const radii = new Float32Array((angles + 1) * (heights + 1));
  for (let a = 0; a <= angles; a++) {
    const theta = (a / angles) * TAU;
    for (let k = 0; k <= heights; k++) {
      radii[a * (heights + 1) + k] = radiusFraction(
        theta,
        tAtHeight(theta, (k / heights) * 0.999)
      );
    }
  }
  return (x, y, z) => {
    if (y < 0 || y >= crownHeight) return false;
    const u = x / halfWidth;
    const v = z / halfDepth;
    const fa = ((Math.atan2(u, v) + TAU) % TAU) * (angles / TAU);
    const fk = (y / crownHeight) * heights;
    const a = Math.min(Math.floor(fa), angles - 1);
    const k = Math.min(Math.floor(fk), heights - 1);
    const ta = fa - a;
    const tk = fk - k;
    const at = (i: number, j: number) => radii[i * (heights + 1) + j] ?? 0;
    const low = at(a, k) + (at(a + 1, k) - at(a, k)) * ta;
    const high = at(a, k + 1) + (at(a + 1, k + 1) - at(a, k + 1)) * ta;
    return Math.hypot(u, v) < low + (high - low) * tk;
  };
}

/** The visor slab, rasterized in plan so each test is a lookup. */
export function visorSolid(): Solid {
  const columns = 256;
  const rows = 200;
  const [x0, x1, z0, z1] = [-1.25, 1.25, 0.1, 2.05];
  const polygon = visorOutline(160);
  for (let i = 60; i >= 0; i--) polygon.push(visorRoot(i / 60));
  const inside = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    const z = z0 + ((row + 0.5) / rows) * (z1 - z0);
    const crossings: number[] = [];
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (a && b && a.y > z !== b.y > z) {
        crossings.push(a.x + ((b.x - a.x) * (z - a.y)) / (b.y - a.y));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let c = 0; c + 1 < crossings.length; c += 2) {
      const from = Math.ceil(
        ((crossings[c] ?? 0) - x0) / ((x1 - x0) / columns) - 0.5
      );
      const to = Math.floor(
        ((crossings[c + 1] ?? 0) - x0) / ((x1 - x0) / columns) - 0.5
      );
      for (
        let column = Math.max(0, from);
        column <= Math.min(columns - 1, to);
        column++
      ) {
        inside[row * columns + column] = 1;
      }
    }
  }
  return (x, y, z) => {
    if (y > visorTop + 0.002 || y < visorTop - visorThickness) return false;
    const column = Math.floor(((x - x0) / (x1 - x0)) * columns);
    const row = Math.floor(((z - z0) / (z1 - z0)) * rows);
    if (column < 0 || column >= columns || row < 0 || row >= rows) return false;
    return inside[row * columns + column] === 1;
  };
}

export function buttonSolid(): Solid {
  return (x, y, z) =>
    y > crownHeight - 0.01 &&
    y < crownHeight + 0.06 &&
    Math.hypot(x, z) < 0.085;
}

export function unionSolid(...solids: Solid[]): Solid {
  return (x, y, z) => solids.some(solid => solid(x, y, z));
}

// Cosine-weighted Fibonacci directions around +Z.
function hemisphere(count: number) {
  return Array.from({length: count}, (_, i) => {
    const r = Math.sqrt((i + 0.5) / count);
    const phi = i * 2.399963229728653;
    return new Vector3(
      r * Math.cos(phi),
      r * Math.sin(phi),
      Math.sqrt(1 - r * r)
    );
  });
}

const reach = [0.012, 0.03, 0.06, 0.1, 0.16, 0.25, 0.38, 0.55];

function multiplyColor(
  geometry: BufferGeometry,
  shade: (position: Vector3, normal: Vector3) => number
) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = geometry.getAttribute('color');
  const position = new Vector3();
  const normal = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    position.fromBufferAttribute(positions, i);
    normal.fromBufferAttribute(normals, i);
    const value = shade(position, normal);
    if (value === 1) continue;
    colors.setXYZ(
      i,
      colors.getX(i) * value,
      colors.getY(i) * value,
      colors.getZ(i) * value
    );
  }
}

interface OcclusionOptions {
  strength?: number;
  // Skip vertices nothing can occlude, which keeps the bake fast.
  include?: (position: Vector3) => boolean;
}

/** Hemisphere occlusion against analytic solids, with nearer hits darker. */
export function bakeOcclusion(
  geometry: BufferGeometry,
  solid: Solid,
  {strength = 1, include}: OcclusionOptions = {}
) {
  const directions = hemisphere(12);
  const tangent = new Vector3();
  const bitangent = new Vector3();
  const ray = new Vector3();
  multiplyColor(geometry, (position, normal) => {
    if (include && !include(position)) return 1;
    tangent
      .set(
        Math.abs(normal.y) < 0.9 ? 0 : 1,
        Math.abs(normal.y) < 0.9 ? 1 : 0,
        0
      )
      .cross(normal)
      .normalize();
    bitangent.crossVectors(normal, tangent);
    const x = position.x + normal.x * 0.008;
    const y = position.y + normal.y * 0.008;
    const z = position.z + normal.z * 0.008;
    let hits = 0;
    for (const direction of directions) {
      ray
        .copy(tangent)
        .multiplyScalar(direction.x)
        .addScaledVector(bitangent, direction.y)
        .addScaledVector(normal, direction.z);
      for (const distance of reach) {
        if (
          solid(
            x + ray.x * distance,
            y + ray.y * distance,
            z + ray.z * distance
          )
        ) {
          hits += 1 - distance / 0.8;
          break;
        }
      }
    }
    return 1 - (strength * hits) / directions.length;
  });
}

/**
 * Inside the crown, light arrives only through the opening: the share of the
 * hemisphere that escapes through the base ellipse sets the shade.
 */
export function bakeInteriorOcclusion(
  geometry: BufferGeometry,
  {floor = 0.35, gain = 2.6, flip = false} = {}
) {
  const directions = hemisphere(32);
  const tangent = new Vector3();
  const bitangent = new Vector3();
  const ray = new Vector3();
  multiplyColor(geometry, (position, normal) => {
    if (flip) normal.negate();
    tangent
      .set(
        Math.abs(normal.y) < 0.9 ? 0 : 1,
        Math.abs(normal.y) < 0.9 ? 1 : 0,
        0
      )
      .cross(normal)
      .normalize();
    bitangent.crossVectors(normal, tangent);
    let open = 0;
    for (const direction of directions) {
      ray
        .copy(tangent)
        .multiplyScalar(direction.x)
        .addScaledVector(bitangent, direction.y)
        .addScaledVector(normal, direction.z);
      if (ray.y > -0.02) continue;
      const distance = -position.y / ray.y;
      const x = (position.x + ray.x * distance) / (halfWidth * 0.97);
      const z = (position.z + ray.z * distance) / (halfDepth * 0.97);
      if (x * x + z * z < 1) open++;
    }
    return floor + (1 - floor) * Math.min(1, (open / directions.length) * gain);
  });
}
