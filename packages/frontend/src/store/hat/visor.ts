import {Mesh, Vector2} from 'three';
import {gridGeometry} from './geometry';
import {clothMaterial, fabricColor, withOcclusion} from './materials';
import {bakeOcclusion, crownSolid} from './occlusion';
import {
  MM,
  visorEdgeRadius,
  visorOutline,
  visorRoot,
  visorStitchContour,
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

// Plan-view region covered by the visor detail maps (x, z).
const [x0, x1, z0] = [-1.22, 1.22, 0.15];
const mapWidth = 1024;
const texel = (x1 - x0) / mapWidth;
const mapRows = Math.ceil((2 - z0) / texel);
const z1 = z0 + mapRows * texel;

const rowCount = 8;
const firstRowInset = 7 * MM;
const rowPitch = 5.75 * MM;
const stitchLength = 3.2 * MM;

/**
 * Twill plus the eight concentric stitch rows, baked in plan view. Each row
 * is an offset of the outer edge: a shallow groove pulled by tonal thread
 * dashes with needle holes, so the rows read as faint corduroy.
 */
function visorMaps(twill: Twill, anisotropy: number) {
  const guide = visorStitchContour(1200);
  const seeds = new Uint8Array(mapWidth * mapRows);
  const seedLength = new Float32Array(mapWidth * mapRows);
  let length = 0;
  guide.forEach((corner, i) => {
    const next = guide[i + 1];
    if (!next) return;
    const segment = corner.distanceTo(next);
    const steps = Math.ceil(segment / (texel / 2));
    for (let k = 0; k < steps; k++) {
      const x = corner.x + ((next.x - corner.x) * k) / steps;
      const z = corner.y + ((next.y - corner.y) * k) / steps;
      const column = Math.floor((x - x0) / texel);
      const row = Math.floor((z - z0) / texel);
      if (column < 0 || column >= mapWidth || row < 0 || row >= mapRows) {
        continue;
      }
      seeds[row * mapWidth + column] = 1;
      seedLength[row * mapWidth + column] = length + (segment * k) / steps;
    }
    length += segment;
  });
  const {distance, nearest} = distanceTransform(seeds, mapWidth, mapRows);
  const height = new Float32Array(mapWidth * mapRows);
  const shade = new Float32Array(mapWidth * mapRows);
  const roughness = new Float32Array(mapWidth * mapRows);
  const twillScale = twillSize / twillTile;
  // Twill relief in model units, matching the crown's normal map strength.
  const twillRelief = 2.4 * (twillTile / twillSize);
  for (let row = 0; row < mapRows; row++) {
    const z = z0 + (row + 0.5) * texel;
    for (let column = 0; column < mapWidth; column++) {
      const x = x0 + (column + 0.5) * texel;
      const p = row * mapWidth + column;
      const tx =
        ((Math.floor(x * twillScale) % twillSize) + twillSize) % twillSize;
      const ty =
        ((Math.floor(z * twillScale) % twillSize) + twillSize) % twillSize;
      const tp = ty * twillSize + tx;
      const inset = (distance[p] ?? 0) * texel;
      const k = Math.round((inset - firstRowInset) / rowPitch);
      let groove = 0;
      let thread = 0;
      let hole = 0;
      if (k >= 0 && k < rowCount) {
        const offset = inset - (firstRowInset + k * rowPitch);
        groove = Math.exp(-((offset / (0.6 * MM)) ** 2));
        const along = (seedLength[nearest[p] ?? 0] ?? 0) / stitchLength;
        const phase = along - Math.floor(along);
        const dash = Math.sin(
          Math.PI * Math.min(1, Math.max(0, (phase - 0.12) / 0.76))
        );
        thread = Math.sqrt(Math.max(0, 1 - (offset / (0.28 * MM)) ** 2)) * dash;
        hole =
          Math.exp(-(((phase < 0.5 ? phase : phase - 1) / 0.05) ** 2)) *
          Math.exp(-((offset / (0.3 * MM)) ** 2));
      }
      height[p] =
        (twill.height[tp] ?? 0) * twillRelief -
        groove * 0.25 * MM +
        thread * 0.22 * MM;
      shade[p] =
        twillShade(twill, tp) *
        (1 - 0.1 * groove + 0.35 * thread) *
        (1 - 0.6 * hole);
      roughness[p] = twillRoughness(twill, tp) - 0.2 * thread;
    }
  }
  const options = {anisotropy};
  return {
    map: detailTexture(greyPixels(shade), mapWidth, mapRows, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(
      normalPixels(height, mapWidth, mapRows, 1 / (2 * texel), false),
      mapWidth,
      mapRows,
      options
    ),
    roughnessMap: detailTexture(
      greyPixels(roughness),
      mapWidth,
      mapRows,
      options
    ),
  };
}

// Across the visor from the root to where the edge starts rolling.
const flat = [
  0, 0.012, 0.03, 0.055, 0.09, 0.14, 0.21, 0.3, 0.42, 0.56, 0.72, 0.88, 1,
];
// The turned edge wraps a little underneath before the under-visor starts.
const wrap = 0.45;
const edgeSteps = 10;

function visorSurface(top: boolean) {
  const columns = 181;
  const outline = visorOutline(columns);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const root = new Vector2();
  const inner = new Vector2();
  const outward = new Vector2();
  const rows: ((i: number) => void)[] = [];
  const push = (
    x: number,
    y: number,
    z: number,
    normal: [number, number, number],
    unrolled?: number
  ) => {
    positions.push(x, y, z);
    normals.push(...normal);
    // Plan-view UVs, with the rounded edge unrolled so the twill keeps scale.
    const u = unrolled === undefined ? x : inner.x + outward.x * unrolled;
    const v = unrolled === undefined ? z : inner.y + outward.y * unrolled;
    uvs.push((u - x0) / (x1 - x0), (v - z0) / (z1 - z0));
  };
  const frame = (i: number) => {
    const a = outline[Math.max(0, i - 1)] ?? new Vector2();
    const b = outline[Math.min(columns - 1, i + 1)] ?? a;
    const point = outline[i] ?? a;
    outward
      .set(b.y - a.y, -(b.x - a.x))
      .normalize()
      .negate();
    inner.copy(point).addScaledVector(outward, -visorEdgeRadius);
    visorRoot(i / (columns - 1), root);
  };
  const flatRow = (w: number, y: number, up: number) => (i: number) => {
    frame(i);
    push(root.x + (inner.x - root.x) * w, y, root.y + (inner.y - root.y) * w, [
      0,
      up,
      0,
    ]);
  };
  const edgeRow = (phi: number) => (i: number) => {
    frame(i);
    // A slightly squared bullnose, like fabric turned over a stiff insert.
    const c = Math.sign(Math.cos(phi)) * Math.abs(Math.cos(phi)) ** 0.8;
    const s = Math.sign(Math.sin(phi)) * Math.abs(Math.sin(phi)) ** 0.8;
    push(
      inner.x + outward.x * visorEdgeRadius * c,
      visorTop - visorEdgeRadius + visorEdgeRadius * s,
      inner.y + outward.y * visorEdgeRadius * c,
      [outward.x * Math.cos(phi), Math.sin(phi), outward.y * Math.cos(phi)],
      visorEdgeRadius * (top ? Math.PI / 2 - phi : phi + Math.PI / 2)
    );
  };
  if (top) {
    // Rows run from under the edge, over it, then in to the root.
    for (let k = 0; k <= edgeSteps; k++) {
      rows.push(
        edgeRow(-Math.PI / 2 + wrap + ((Math.PI - wrap) * k) / edgeSteps)
      );
    }
    for (let j = flat.length - 2; j >= 0; j--) {
      rows.push(flatRow(flat[j] ?? 0, visorTop, 1));
    }
  } else {
    const bottom = visorTop - visorThickness;
    for (const w of flat.slice(0, -1)) rows.push(flatRow(w, bottom, -1));
    for (let k = 0; k <= 3; k++) {
      rows.push(edgeRow(-Math.PI / 2 + (wrap * k) / 3));
    }
  }
  for (const row of rows) {
    for (let i = 0; i < columns; i++) row(i);
  }
  return gridGeometry(columns, rows.length, positions, uvs, normals);
}

export function createVisor(twill: Twill, anisotropy: number) {
  const maps = visorMaps(twill, anisotropy);
  const crown = crownSolid();
  const upper = withOcclusion(visorSurface(true));
  // The crown's front edge sits on the visor in a tight, dark crease.
  bakeOcclusion(upper, crown, {strength: 1.15});
  const under = withOcclusion(visorSurface(false));
  return [
    new Mesh(upper, clothMaterial({color: fabricColor, maps, normalScale: 1})),
    new Mesh(
      under,
      clothMaterial({color: undervisorColor, maps, normalScale: 1})
    ),
  ];
}
