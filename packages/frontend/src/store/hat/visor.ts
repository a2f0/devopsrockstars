import {Mesh, Vector2, Vector3} from 'three';
import {BuildTask} from './buildTask';
import {gridGeometry} from './geometry';
import {clothMaterial, fabricColor, withOcclusion} from './materials';
import {bakeOcclusion, crownSolid} from './occlusion';
import type {HatResources} from './resources';
import {
  halfDepth,
  halfWidth,
  MM,
  surfacePoint,
  visorEdgeRadius,
  visorOutline,
  visorRootDepth,
  visorTaperAt,
  visorThickness,
  visorTop,
} from './shape';
import {
  detailTexture,
  distanceTransform,
  greyPixels,
  normalPixels,
  type Twill,
  twillRoughness,
  twillShade,
  twillSize,
  twillTile,
} from './textures';

// Owner decision: black under the visor, like New Era's blank black Low
// Profile. The classic light grey is '#c4c6c4'.
const undervisorColor = fabricColor;

// Twill texels per model unit, as on the crown. Each map texel covers a
// whole number of twill texels, so the bake box-filters the weave rather
// than point sampling it into stripes.
const twillScale = twillSize / twillTile;
const step = Math.max(1, Math.round(0.002 * twillScale));
const texel = step / twillScale;
// Plan-view region covered by the visor maps (x, z), aligned to the twill.
const originX = -Math.ceil(1.2 / texel);
const originZ = Math.floor(0.44 / texel);
const mapWidth = -2 * originX;
const mapRows = Math.ceil(2.01 / texel) - originZ;
const x0 = originX * texel;
const z0 = originZ * texel;
const x1 = x0 + mapWidth * texel;
const z1 = z0 + mapRows * texel;

const rowCount = 8;
const firstRowInset = 7 * MM;
const rowPitch = 5.75 * MM;
const stitchLength = 3.2 * MM;
// Twill relief in model units per unit of twill height.
const twillRelief = 1.15 / twillScale;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return k * k * (3 - 2 * k);
};

/** The twill's height, shade and roughness averaged over step x step blocks. */
async function boxedTwill(twill: Twill, task: BuildTask) {
  const size = twillSize;
  const weight = 1 / (step * step);
  const height = new Float32Array(size * size);
  const shade = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    if (y % 8 === 0) await task.checkpoint();
    for (let x = 0; x < size; x++) {
      let h = 0;
      let c = 0;
      let r = 0;
      for (let j = 0; j < step; j++) {
        for (let i = 0; i < step; i++) {
          const p = ((y + j) % size) * size + ((x + i) % size);
          h += twill.height[p] ?? 0;
          c += twillShade(twill, p);
          r += twillRoughness(twill, p);
        }
      }
      const p = y * size + x;
      height[p] = h * weight;
      shade[p] = c * weight;
      roughness[p] = r * weight;
    }
  }
  return {height, shade, roughness};
}

/** Bilinear lookup in a wrapping twill tile. */
function sampleTile(values: Float32Array, x: number, y: number) {
  const size = twillSize;
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  const left = ((fx % size) + size) % size;
  const bottom = ((fy % size) + size) % size;
  const right = (left + 1) % size;
  const top = (bottom + 1) % size;
  const a = values[bottom * size + left] ?? 0;
  const b = values[bottom * size + right] ?? 0;
  const c = values[top * size + left] ?? 0;
  const d = values[top * size + right] ?? 0;
  return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
}

/**
 * Twill plus the eight stitch rows, baked in plan view. Every row is a true
 * offset of the outer edge, found through a distance transform of the edge:
 * a shallow groove holding near-flush tonal thread. Past the edge line the
 * map carries the rolled edge, with its wales running along the edge.
 */
async function visorMaps(
  resources: HatResources,
  twill: Twill,
  anisotropy: number,
  task: BuildTask
) {
  // Edge samples about 0.25 mm apart, with unit tangents.
  const count = 1601;
  const outline = visorOutline(count);
  const spacing =
    (outline[0] ?? new Vector2()).distanceTo(outline[1] ?? new Vector2()) || 1;
  const px = Float32Array.from(outline, point => point.x);
  const pz = Float32Array.from(outline, point => point.y);
  const tx = new Float32Array(count);
  const tz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    const dx = (px[b] ?? 0) - (px[a] ?? 0);
    const dz = (pz[b] ?? 0) - (pz[a] ?? 0);
    const length = Math.sqrt(dx * dx + dz * dz) || 1;
    tx[i] = dx / length;
    tz[i] = dz / length;
  }
  // Inner rows are shorter than the edge; keep their stitches 3.2 mm long.
  const rowLength = new Float32Array(rowCount * count);
  const rowShrink = new Float32Array(rowCount * count);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    // Positive where the edge turns inward, as it does all the way round.
    const curvature =
      -((tx[a] ?? 0) * (tz[b] ?? 0) - (tz[a] ?? 0) * (tx[b] ?? 0)) /
      ((b - a) * spacing);
    for (let k = 0; k < rowCount; k++) {
      const j = k * count + i;
      rowShrink[j] = Math.max(
        0.05,
        1 - (firstRowInset + k * rowPitch) * curvature
      );
      if (i > 0) {
        rowLength[j] = (rowLength[j - 1] ?? 0) + spacing * (rowShrink[j] ?? 1);
      }
    }
  }
  // Nearest edge sample for each texel, from a half-resolution transform.
  const lowWidth = Math.ceil(mapWidth / 2);
  const lowRows = Math.ceil(mapRows / 2);
  const seeds = new Uint8Array(lowWidth * lowRows);
  const seedIndex = new Uint16Array(lowWidth * lowRows);
  for (let i = 0; i < count; i++) {
    const column = Math.floor(((px[i] ?? 0) - x0) / (2 * texel));
    const row = Math.floor(((pz[i] ?? 0) - z0) / (2 * texel));
    if (column < 0 || column >= lowWidth || row < 0 || row >= lowRows) {
      continue;
    }
    seeds[row * lowWidth + column] = 1;
    seedIndex[row * lowWidth + column] = i;
  }
  const {nearest} = await distanceTransform(seeds, lowWidth, lowRows, task);

  const tile = await boxedTwill(twill, task);
  const tileHeight = tile.height;
  const tileShade = tile.shade;
  const tileRoughness = tile.roughness;
  const radius = visorEdgeRadius;
  // The rolled edge spans from the edge line's inner tangent (-radius) to
  // where the under-visor starts, about 2.1 radii outside the line.
  const rollStart = -radius - 0.4 * MM;
  const rollEnd = 2.4 * radius;
  const rotated = twillScale / Math.SQRT2;
  // Compact bell curves (zero beyond their width) keep the loop cheap.
  const grooveWidth = 1.1 * MM;
  const shoulderWidth = 2.8 * MM;
  const threadWidth = 0.32 * MM;
  const height = new Float32Array(mapWidth * mapRows);
  const shade = new Float32Array(mapWidth * mapRows);
  const roughness = new Float32Array(mapWidth * mapRows);
  for (let row = 0; row < mapRows; row++) {
    if (row % 4 === 0) await task.checkpoint();
    const z = z0 + (row + 0.5) * texel;
    // Mirrored in z: the wales run from the wearer's right front toward the
    // left back, as on New Era's visors, rather than across the default view,
    // where grazing light would alias them into stripes.
    const tileRow =
      ((((-(originZ + row) * step) % twillSize) + twillSize) % twillSize) *
      twillSize;
    const lowRow = (row >> 1) * lowWidth;
    for (let column = 0; column < mapWidth; column++) {
      const x = x0 + (column + 0.5) * texel;
      const p = row * mapWidth + column;
      const tp =
        tileRow +
        (((((originX + column) * step) % twillSize) + twillSize) % twillSize);
      const i = seedIndex[nearest[lowRow + (column >> 1)] ?? 0] ?? 0;
      const dx = x - (px[i] ?? 0);
      const dz = z - (pz[i] ?? 0);
      const sx = tx[i] ?? 0;
      const sz = tz[i] ?? 0;
      // Signed distance from the edge line; the outward normal is (-tz, tx).
      const outside = sx * dz - sz * dx;
      const sideways = dx * sx + dz * sz;
      let h = (tileHeight[tp] ?? 0) * twillRelief;
      let c = tileShade[tp] ?? 0;
      let r = tileRoughness[tp] ?? 0;
      if (
        outside > rollStart &&
        outside < rollEnd &&
        Math.abs(sideways) < 2 * spacing
      ) {
        // Wales along the rolled edge, with a softer relief.
        const roll = smoothstep(rollStart, -radius + 0.2 * MM, outside);
        const along = i * spacing + sideways;
        const u = (outside + along) * rotated;
        const v = (outside - along) * rotated;
        h += roll * (sampleTile(tileHeight, u, v) * twillRelief * 0.45 - h);
        c += roll * (sampleTile(tileShade, u, v) - c);
        r += roll * (sampleTile(tileRoughness, u, v) - r);
      }
      const k = Math.round((-outside - firstRowInset) / rowPitch);
      // Rows end where they run under the crown's base edge.
      const under =
        (1 - Math.sqrt((x / halfWidth) ** 2 + (z / halfDepth) ** 2)) *
        halfDepth;
      const rows = 1 - smoothstep(-0.3 * MM, 0.9 * MM, under);
      if (k >= 0 && k < rowCount && rows > 0) {
        const offset = -outside - (firstRowInset + k * rowPitch);
        const across = offset < 0 ? -offset : offset;
        let dh = 0;
        let dc = 1;
        let dr = 0;
        // The thread pulls a narrow groove and rounds the bands beside it.
        if (across < shoulderWidth) {
          const w = 1 - (across / shoulderWidth) ** 2;
          dh -= 0.06 * MM * w * w;
        }
        if (across < grooveWidth) {
          const w = 1 - (across / grooveWidth) ** 2;
          const groove = w * w * w;
          dh -= 0.3 * MM * groove;
          dc *= 1 - 0.16 * groove;
          dr += 0.05 * groove;
          if (across < threadWidth) {
            const j = k * count + i;
            const stitch =
              ((rowLength[j] ?? 0) + sideways * (rowShrink[j] ?? 1)) /
              stitchLength;
            const phase = stitch - Math.floor(stitch);
            // Tonal thread lies nearly flush; needle holes sit between.
            const dash = Math.sin(
              Math.PI * Math.min(1, Math.max(0, (phase - 0.1) / 0.8))
            );
            const thread = (1 - (across / threadWidth) ** 2) ** 2 * dash;
            const gap = phase < 0.5 ? phase : 1 - phase;
            const hole = gap < 0.12 ? (1 - (gap / 0.12) ** 2) ** 2 : 0;
            dh += 0.05 * MM * thread;
            dc *=
              (1 + 0.08 * thread) *
              (1 - 0.3 * hole * (1 - across / threadWidth));
            dr -= 0.12 * thread;
          }
        }
        h += dh * rows;
        c *= 1 + (dc - 1) * rows;
        r += dr * rows;
      }
      height[p] = h;
      shade[p] = c;
      roughness[p] = r;
    }
  }
  const options = {anisotropy};
  return {
    map: detailTexture(resources, greyPixels(shade), mapWidth, mapRows, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(
      resources,
      await normalPixels(
        height,
        mapWidth,
        mapRows,
        1 / (2 * texel),
        false,
        task
      ),
      mapWidth,
      mapRows,
      options
    ),
    roughnessMap: detailTexture(
      resources,
      greyPixels(roughness),
      mapWidth,
      mapRows,
      options
    ),
  };
}

const columns = 241;
// Distances from the crown's base edge, along each column, where the top
// needs vertices: dense at the crease, sparse toward the rolled edge.
const creaseRows = [
  -0.01, 0, 0.003, 0.007, 0.013, 0.021, 0.032, 0.048, 0.07, 0.1, 0.15, 0.22,
  0.31, 0.42, 0.56, 0.7,
];
// The turned edge wraps a little underneath before the under-visor starts.
const wrap = 0.45;
const edgeSteps = 10;
// The under-visor turns up into the root over its last 1.5 mm.
const rootBevel = 1.5 * MM;

interface Column {
  // Unit direction of the column, straight out from the crown's center.
  ray: Vector2;
  // Distances along the ray to the crown's base edge, the root and the
  // rolled edge's inner tangent line.
  wall: number;
  root: number;
  inner: number;
  // Outer edge point, its outward normal and the insert thickness fraction.
  point: Vector2;
  outward: Vector2;
  taper: number;
}

/**
 * The visor in columns along the outline. Each column runs straight out from
 * the crown's center, so columns never cross, and rows at fixed distances
 * from the crown's base edge trace the crease exactly.
 */
function visorColumns(): Column[] {
  const outline = visorOutline(columns);
  const spacing =
    (outline[0] ?? new Vector2()).distanceTo(outline[1] ?? new Vector2()) || 1;
  const base = new Vector3();
  return outline.map((point, i) => {
    const a = outline[Math.max(0, i - 1)] ?? point;
    const b = outline[Math.min(columns - 1, i + 1)] ?? point;
    const outward = new Vector2(a.y - b.y, b.x - a.x).normalize();
    const taper = visorTaperAt(Math.min(i, columns - 1 - i) * spacing);
    const inner = point
      .clone()
      .addScaledVector(outward, -visorEdgeRadius * taper);
    const ray = inner.clone().normalize();
    // The crown's relieved base edge: rolled under, dipping at the seam.
    const theta = Math.atan2(ray.x / halfWidth, ray.y / halfDepth);
    surfacePoint(theta, 0, 0, {}, base);
    const wall = Math.hypot(base.x, base.z);
    const distance = inner.length();
    return {
      ray,
      wall,
      root: Math.min(wall - visorRootDepth, distance),
      inner: distance,
      point,
      outward,
      taper,
    };
  });
}

type Row = (column: Column) => void;

function visorSurface(resources: HatResources, top: boolean, layout: Column[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const plan = new Vector2();
  const texture = new Vector2();
  const push = (y: number, nx: number, ny: number, nz: number) => {
    positions.push(plan.x, y, plan.y);
    normals.push(nx, ny, nz);
    uvs.push((texture.x - x0) / (x1 - x0), (texture.y - z0) / (z1 - z0));
  };
  const surfaceY = (column: Column, lower: boolean) =>
    lower ? visorTop - visorThickness * column.taper : visorTop;
  // A flat row at a distance along each column, with plan-view UVs.
  const flat =
    (distance: (column: Column) => number, lower: boolean): Row =>
    column => {
      const along = Math.min(
        Math.max(distance(column), column.root),
        column.inner
      );
      plan.copy(column.ray).multiplyScalar(along);
      texture.copy(plan);
      push(surfaceY(column, lower), 0, lower ? -1 : 1, 0);
    };
  // The edge line's UVs sit on the full-size tangent line and the rolled
  // edge unrolls outward from it, so tapered wings keep the edge band.
  const inner =
    (lower: boolean): Row =>
    column => {
      plan.copy(column.ray).multiplyScalar(column.inner);
      texture
        .copy(column.point)
        .addScaledVector(column.outward, -visorEdgeRadius);
      push(surfaceY(column, lower), 0, lower ? -1 : 1, 0);
    };
  const edge =
    (phi: number): Row =>
    column => {
      const radius = visorEdgeRadius * column.taper;
      // A slightly squared bullnose, like fabric turned over a stiff insert.
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const c = Math.sign(cos) * Math.abs(cos) ** 0.8;
      const s = Math.sign(sin) * Math.abs(sin) ** 0.8;
      plan
        .copy(column.ray)
        .multiplyScalar(column.inner)
        .addScaledVector(column.outward, radius * c);
      texture
        .copy(column.point)
        .addScaledVector(
          column.outward,
          visorEdgeRadius * (Math.PI / 2 - phi - 1)
        );
      push(
        visorTop - radius + radius * s,
        column.outward.x * cos,
        sin,
        column.outward.y * cos
      );
    };
  const rows: Row[] = [];
  if (top) {
    // From under the edge, over it, then in to the root.
    for (let k = 0; k <= edgeSteps; k++) {
      rows.push(edge(-Math.PI / 2 + wrap + ((Math.PI - wrap) * k) / edgeSteps));
    }
    rows.push(inner(false));
    for (let j = creaseRows.length - 1; j >= 0; j--) {
      const offset = creaseRows[j] ?? 0;
      rows.push(flat(column => column.wall + offset, false));
    }
    rows.push(flat(column => column.root, false));
  } else {
    // From the root, turned up to meet the top, out to the edge.
    rows.push(column => {
      plan.copy(column.ray).multiplyScalar(column.root);
      texture.copy(plan);
      push(visorTop, -column.ray.x * 0.26, -0.966, -column.ray.y * 0.26);
    });
    rows.push(flat(column => column.root + rootBevel, true));
    rows.push(flat(column => column.wall + 0.012, true));
    rows.push(flat(column => column.wall + 0.2, true));
    rows.push(inner(true));
    for (let k = 0; k <= 3; k++) {
      rows.push(edge(-Math.PI / 2 + (wrap * k) / 3));
    }
  }
  for (const row of rows) {
    for (const column of layout) row(column);
  }
  return gridGeometry(resources, columns, rows.length, positions, uvs, normals);
}

// Where the crown's folded edge presses onto the visor: the top's normals
// lean away from the crown over 12 mm, as the fabric rises into the seam,
// and a 3 mm contact shadow darkens it. Tilting the normal also damps the
// grazing sheen that vertex occlusion cannot reach.
const creaseTilt = (45 * Math.PI) / 180;
const creaseWidth = 12 * MM;
const contactWidth = 3 * MM;

export async function createVisor(
  resources: HatResources,
  twill: Twill,
  anisotropy: number,
  task = new BuildTask()
) {
  const maps = await visorMaps(resources, twill, anisotropy, task);
  const layout = visorColumns();
  const upper = withOcclusion(visorSurface(resources, true, layout));
  await bakeOcclusion(
    upper,
    crownSolid(),
    {
      strength: 1.15,
      include: position => position.y > visorTop - 1e-5,
    },
    task
  );
  const colors = upper.getAttribute('color');
  const positions = upper.getAttribute('position');
  const normals = upper.getAttribute('normal');
  const rows = positions.count / columns;
  layout.forEach((column, i) => {
    for (let k = edgeSteps + 1; k < rows; k++) {
      const p = k * columns + i;
      const offset = Math.max(
        0,
        Math.hypot(positions.getX(p), positions.getZ(p)) - column.wall
      );
      const shade =
        Math.max(0, colors.getX(p)) *
        (1 - 0.5 * Math.exp(-offset / contactWidth));
      colors.setXYZ(p, shade, shade, shade);
      if (offset >= creaseWidth) continue;
      const tilt = creaseTilt * (1 - offset / creaseWidth) ** 2;
      normals.setXYZ(
        p,
        column.ray.x * Math.sin(tilt),
        Math.cos(tilt),
        column.ray.y * Math.sin(tilt)
      );
    }
    // The rolled edge takes the value at its inner tangent line.
    const edge = colors.getX((edgeSteps + 1) * columns + i);
    for (let k = 0; k <= edgeSteps; k++) {
      colors.setXYZ(k * columns + i, edge, edge, edge);
    }
  });
  const under = withOcclusion(visorSurface(resources, false, layout));
  // The crown shades the under-visor where it turns up into the root, but
  // not at the narrow wing ends, which are seen from outside.
  const shades = under.getAttribute('color');
  layout.forEach((column, i) => {
    const reach = smoothstep(4 * MM, 12 * MM, column.inner - column.wall);
    const root = 1 - 0.65 * reach;
    const bevel = 1 - 0.4 * reach;
    shades.setXYZ(i, root, root, root);
    shades.setXYZ(columns + i, bevel, bevel, bevel);
  });
  return [
    new Mesh(
      upper,
      clothMaterial(resources, {color: fabricColor, maps, normalScale: 1})
    ),
    new Mesh(
      under,
      clothMaterial(resources, {color: undervisorColor, maps, normalScale: 1})
    ),
  ];
}
