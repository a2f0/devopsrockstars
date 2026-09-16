import {LatheGeometry, Mesh, Vector2, Vector3} from 'three';
import type {BuildTask} from './buildTask';
import {gridGeometry} from './geometry';
import {type LabelRegion, labelArt, tapeArt} from './interiorArt';
import {clothMaterial, withOcclusion} from './materials';
import {bakeInteriorOcclusion} from './occlusion';
import type {HatResources} from './resources';
import {
  crownHeight,
  crownNormal,
  crownPoint,
  eyelets,
  halfDepth,
  halfWidth,
  lengthAtT,
  MM,
  meridianLengths,
  radiusFraction,
  ringSpeed,
  seamAngles,
  surfacePoint,
  tAtHeight,
  tAtLength,
} from './shape';
import {
  detailTexture,
  greyPixels,
  normalPixels,
  type SurfaceMaps,
  twillTile,
} from './textures';

const TAU = Math.PI * 2;
// Everything below the lining is hidden behind the sweatband.
const liningStart = 0.3;

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = clamp01((x - edge0) / (edge1 - edge0));
  return k * k * (3 - 2 * k);
};

/** An integer hash in 0..1, so texture grain is identical on every engine. */
function hash(x: number, y: number, seed: number) {
  let h =
    Math.imul(x, 0x27d4eb2d) ^
    Math.imul(y, 0x165667b1) ^
    Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Fields {
  shade: Float32Array;
  height: Float32Array;
  roughness: Float32Array;
}

function fields(count: number): Fields {
  return {
    shade: new Float32Array(count),
    height: new Float32Array(count),
    roughness: new Float32Array(count),
  };
}

async function surfaceMaps(
  resources: HatResources,
  width: number,
  rows: number,
  {shade, height, roughness}: Fields,
  slope: number,
  anisotropy: number,
  repeat: boolean,
  task: BuildTask
): Promise<SurfaceMaps> {
  const options = {anisotropy, repeat};
  return {
    map: detailTexture(resources, greyPixels(shade), width, rows, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(
      resources,
      await normalPixels(height, width, rows, slope, repeat, task),
      width,
      rows,
      options
    ),
    roughnessMap: detailTexture(
      resources,
      greyPixels(roughness),
      width,
      rows,
      options
    ),
  };
}

/** The inside face of one panel, just behind the crown fabric. */
function lining(
  resources: HatResources,
  panel: number,
  tileU: number,
  tileV: number
) {
  const start = seamAngles[panel] ?? 0;
  const span = (seamAngles[panel + 1] ?? TAU) - start;
  const center = start + span / 2;
  const lengths = meridianLengths(center);
  const bottom = tAtHeight(center, liningStart / crownHeight);
  const columns = 17;
  const rows = 41;
  const positions: number[] = [];
  const uvs: number[] = [];
  const point = new Vector3();
  for (let j = 0; j < rows; j++) {
    const t = bottom + ((1 - bottom) * j) / (rows - 1);
    const width = span * ringSpeed(center, t);
    for (let i = 0; i < columns; i++) {
      const s = i / (columns - 1);
      surfacePoint(start + s * span, t, -0.004, {}, point);
      positions.push(point.x, point.y, point.z);
      uvs.push(((s - 0.5) * width) / tileU, lengthAtT(lengths, t) / tileV);
    }
  }
  return gridGeometry(resources, columns, rows, positions, uvs);
}

// Buckram behind the front panels: a stiff grey knit with round holes on a
// staggered grid. The real grid is about 0.6 mm; 1.6 mm survives mipmapping
// at product size.
const buckramPitch = 1.6;
const buckramPx = 10;
const buckramColumns = 8;
const buckramRows = 8;
const buckramWidth = buckramColumns * buckramPitch * buckramPx;
const buckramHeight = Math.round(
  ((buckramRows * buckramPitch * Math.sqrt(3)) / 2) * buckramPx
);

async function buckramMaps(
  resources: HatResources,
  anisotropy: number,
  task: BuildTask
): Promise<SurfaceMaps> {
  const width = buckramWidth;
  const rows = buckramHeight;
  const columnPitch = width / buckramColumns;
  const rowPitch = rows / buckramRows;
  const radius = 0.42 * buckramPx;
  const wrap = (value: number, size: number) =>
    value - size * Math.round(value / size);
  const out = fields(width * rows);
  for (let y = 0; y < rows; y++) {
    if (y % 8 === 0) await task.checkpoint();
    const row = Math.floor(y / rowPitch);
    for (let x = 0; x < width; x++) {
      let distance = Infinity;
      for (const r of [row - 1, row, row + 1]) {
        const cy = (r + 0.5) * rowPitch;
        const shift = (((r % 2) + 2) % 2) * 0.5 + 0.5;
        const column = Math.round(x / columnPitch - shift);
        for (const c of [column - 1, column, column + 1]) {
          const cx = (c + shift) * columnPitch;
          distance = Math.min(
            distance,
            Math.hypot(wrap(x + 0.5 - cx, width), wrap(y + 0.5 - cy, rows))
          );
        }
      }
      const p = y * width + x;
      const hole = 1 - smoothstep(radius - 0.9, radius + 0.9, distance);
      const fibre = hash(x, y, 11);
      const loop = hash(Math.floor(x / 3), Math.floor(y / 3), 12);
      out.shade[p] =
        (0.52 + 0.07 * (loop - 0.5) + 0.09 * (fibre - 0.5)) * (1 - 0.85 * hole);
      out.height[p] = (1 - hole) * (0.85 + 0.15 * loop);
      out.roughness[p] = 0.96;
    }
  }
  return surfaceMaps(resources, width, rows, out, 0.3, anisotropy, true, task);
}

// Seam tape: black satin 13 mm wide, printed with "59FIFTY®" and the flag
// box on a 90 mm repeat. The texture holds a printed and a plain copy side
// by side; the plain copy covers the tape near the button, so the print
// stops short of the hub instead of piling up under it.
const tapeMm = 13;
const tapeWidth = tapeMm * MM;
const tapePx = 8;
const tapeRepeat = 90;
const tapeStitchPitch = 2.5;
const hubClearance = 15;

async function tapeMaps(
  resources: HatResources,
  anisotropy: number,
  task: BuildTask
) {
  const column = tapeMm * tapePx;
  const width = 2 * column;
  const rows = tapeRepeat * tapePx;
  const {print, elements} = tapeArt(column, rows, tapePx, tapeMm);
  const out = fields(width * rows);
  for (let y = 0; y < rows; y++) {
    if (y % 8 === 0) await task.checkpoint();
    const along = (y + 0.5) / tapePx;
    const phase = (along % tapeStitchPitch) / tapeStitchPitch;
    const dash = Math.sin(Math.PI * clamp01((phase - 0.14) / 0.72));
    for (let x = 0; x < width; x++) {
      const inner = x % column;
      const across = (inner + 0.5) / tapePx;
      const edge = Math.min(across, tapeMm - across);
      const selvedge = 1 - smoothstep(0.35, 0.8, edge);
      const line = Math.exp(-(((edge - 1.25) / 0.22) ** 2));
      const thread = line * dash;
      const needle = line * (1 - dash) ** 4;
      // Both copies share grain, so the switch to the plain copy is seamless.
      const fibre = hash(inner, y, 21);
      const streak = hash(inner, 0, 22);
      const ink = x < column ? (print[y * column + x] ?? 0) : 0;
      const satin =
        0.13 * (0.92 + 0.1 * streak + 0.12 * (fibre - 0.5)) +
        0.05 * thread +
        0.03 * selvedge;
      const p = y * width + x;
      out.shade[p] =
        satin * (1 - 0.6 * needle) +
        ink * (0.86 + 0.08 * (fibre - 0.5) - satin);
      out.height[p] = 0.3 * selvedge + 0.7 * thread - 0.4 * needle + 0.12 * ink;
      out.roughness[p] =
        0.48 + 0.08 * (fibre - 0.5) + 0.22 * ink + 0.25 * thread;
    }
  }
  return {
    maps: await surfaceMaps(
      resources,
      width,
      rows,
      out,
      0.45,
      anisotropy,
      true,
      task
    ),
    elements,
  };
}

interface TapeRun {
  // Reads toward the hub rather than away from it.
  reversed: boolean;
  // Offset of the print repeat from the hub, in millimetres.
  phase: number;
}

// A tape runs through the hub, so its two halves read in opposite directions.
// Their phases sum to a multiple of the stitch pitch, so the edge stitching
// stays continuous where the halves meet.
// Around the hub the first marks alternate between wordmark and flag box.
const tapeRuns: TapeRun[] = [
  {reversed: false, phase: 11.5},
  {reversed: false, phase: 48.5},
  {reversed: true, phase: 70},
  {reversed: true, phase: 11},
  {reversed: true, phase: 71.5},
  {reversed: false, phase: 47.5},
];

/** Print repeat position, in millimetres, at a distance from the hub. */
function printPosition({reversed, phase}: TapeRun, distance: number) {
  const b = reversed ? phase - distance : distance - phase;
  return ((b % tapeRepeat) + tapeRepeat) % tapeRepeat;
}

/** The first distance from the hub, at least the clearance, between marks. */
function printStart(run: TapeRun, elements: [number, number][]) {
  const printed = (distance: number) => {
    const b = printPosition(run, distance);
    return elements.some(([start, end]) => b > start - 1 && b < end + 1);
  };
  let distance = hubClearance;
  while (printed(distance)) distance += 0.25;
  return distance;
}

/** t where a meridian's radius falls to `fraction`, on the crown's top. */
function tAtRadius(theta: number, fraction: number) {
  let low = 0.5;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    if (radiusFraction(theta, middle) > fraction) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

const tapeAcross = [-1, -0.5, 0, 0.5, 1];

/**
 * One half of a seam tape, from the hub down the seam to behind the
 * sweatband. On the walls it wraps the rings of the crown; near the hub,
 * where rings shrink to a point, it lies flat across the top so the three
 * tapes cross at full width. Returns the plain and printed stretches.
 */
function tape(
  resources: HatResources,
  index: number,
  run: TapeRun,
  printFrom: number
) {
  const seam = seamAngles[index] ?? 0;
  const lengths = meridianLengths(seam);
  const total = lengths[lengths.length - 1] ?? 0;
  const bottom = tAtHeight(seam, liningStart / crownHeight);
  const end = (total - lengthAtT(lengths, bottom)) / MM;
  // The three tapes cross under the button in layers.
  const lift = -0.0075 - (index % 3) * 0.0008;
  const across = new Vector3(
    halfDepth * Math.cos(seam),
    0,
    -halfWidth * Math.sin(seam)
  ).normalize();
  const center = new Vector3();
  const wrapped = new Vector3();
  const flat = new Vector3();
  const strip = (from: number, to: number, column: number) => {
    const count = Math.max(2, Math.ceil((to - from) / 2.5) + 1);
    const positions: number[] = [];
    const uvs: number[] = [];
    for (let j = 0; j < count; j++) {
      const distance = from + ((to - from) * j) / (count - 1);
      const t = tAtLength(lengths, total - distance * MM);
      const flatness = 1 - smoothstep(18, 34, distance);
      // The seam allowance swells the tape, except where the tapes cross.
      const swell = 0.0015 * smoothstep(6, 16, distance);
      const speed = Math.max(ringSpeed(seam, t), 1e-4);
      crownPoint(seam, t, center);
      for (const s of tapeAcross) {
        const offset = (s * tapeWidth) / 2;
        const depth = lift - swell * (1 - s * s);
        surfacePoint(seam + offset / speed, t, depth, {}, wrapped);
        if (flatness > 0) {
          const u = (center.x + across.x * offset) / halfWidth;
          const v = (center.z + across.z * offset) / halfDepth;
          const theta = Math.atan2(u, v);
          surfacePoint(
            theta,
            tAtRadius(theta, Math.hypot(u, v)),
            depth,
            {},
            flat
          );
          wrapped.lerp(flat, flatness);
        }
        positions.push(wrapped.x, wrapped.y, wrapped.z);
        uvs.push(
          // Seen from inside the crown, u runs against the ring direction.
          column + (run.reversed ? 1 + s : 1 - s) / 4,
          (run.reversed ? run.phase - distance : distance - run.phase) /
            tapeRepeat
        );
      }
    }
    return gridGeometry(resources, tapeAcross.length, count, positions, uvs);
  };
  return [strip(0, printFrom, 0.5), strip(printFrom, end, 0)];
}

// Sweatband cross-section as (height, offset along the wall's outward
// normal): the face, then a rolled top fold back to the crown wall.
const bandFace = -0.021;
const bandTop = 0.405;
const bandFold = 0.008;
const bandProfile: [number, number][] = [
  [0.008, bandFace + 0.0006],
  [0.02, bandFace],
  [0.052, bandFace],
  [0.1, bandFace],
  [0.16, bandFace],
  [0.22, bandFace],
  [0.28, bandFace],
  [0.34, bandFace],
  [bandTop - bandFold, bandFace],
  ...Array.from({length: 9}, (_, i): [number, number] => {
    const angle = Math.PI - ((i + 1) / 10) * Math.PI;
    return [
      bandTop - bandFold + bandFold * Math.sin(angle),
      bandFace + bandFold + bandFold * Math.cos(angle),
    ];
  }),
  [bandTop - bandFold, bandFace + 2 * bandFold],
  [bandTop - 0.02, bandFace + 2 * bandFold + 0.0002],
];
// Millimetres along the profile at each row.
const bandLengths = bandProfile.map((_, i) =>
  bandProfile.slice(1, i + 1).reduce((length, [y = 0, o = 0], k) => {
    const [py = 0, po = 0] = bandProfile[k] ?? [];
    return length + Math.hypot(y - py, o - po) / MM;
  }, 0)
);
const bandPx = 10;
// Two 3.2 mm base stitches per repeat around the band.
const bandRepeat = 6.4;
const baseStitchHeight = 4.5 * MM;

/** Where a band row sits at height `y` on the face, in millimetres. */
function bandLengthAt(y: number) {
  for (let i = 1; i < bandProfile.length; i++) {
    const [y0 = 0] = bandProfile[i - 1] ?? [];
    const [y1 = 0] = bandProfile[i] ?? [];
    if (y >= y0 && y <= y1) {
      const a = bandLengths[i - 1] ?? 0;
      const b = bandLengths[i] ?? a;
      return a + ((b - a) * (y - y0)) / (y1 - y0);
    }
  }
  return 0;
}

/** A matte knit band with the base stitch row and the crease of its fold. */
async function bandMaps(
  resources: HatResources,
  anisotropy: number,
  task: BuildTask
) {
  const width = Math.round(bandRepeat * bandPx);
  const lengthMm = bandLengths[bandLengths.length - 1] ?? 0;
  const rows = Math.ceil(lengthMm * bandPx);
  const stitch = bandLengthAt(baseStitchHeight);
  const fold = bandLengthAt(bandTop - bandFold);
  const out = fields(width * rows);
  const course = 0.7;
  for (let y = 0; y < rows; y++) {
    if (y % 8 === 0) await task.checkpoint();
    const along = (y + 0.5) / bandPx;
    const index = Math.floor(along / course);
    const rib = Math.sin(Math.PI * (along / course - index)) ** 0.7;
    const crease = Math.exp(-(((along - fold) / 0.5) ** 2));
    const line = Math.exp(-(((along - stitch) / 0.25) ** 2));
    for (let x = 0; x < width; x++) {
      const around = (x + 0.5) / bandPx;
      // Courses run around the band; wales only faintly break them up.
      const wale = 0.5 + 0.5 * Math.cos((TAU * around) / 0.8);
      const knit = rib * (0.85 + 0.15 * wale);
      const phase = (around % 3.2) / 3.2;
      const dash = Math.sin(Math.PI * clamp01((phase - 0.1) / 0.8));
      const thread = line * dash;
      const needle = line * (1 - dash) ** 4;
      const fibre = hash(x, y, 31);
      const p = y * width + x;
      out.shade[p] =
        (0.13 * (0.85 + 0.25 * knit + 0.12 * (fibre - 0.5)) + 0.025 * thread) *
        (1 - 0.3 * crease) *
        (1 - 0.6 * needle);
      out.height[p] =
        0.5 * knit + 0.1 * fibre + 0.8 * thread - 0.6 * crease - 0.5 * needle;
      out.roughness[p] = 0.97 - 0.12 * thread;
    }
  }
  return surfaceMaps(resources, width, rows, out, 0.35, anisotropy, true, task);
}

const bandPoint = new Vector3();
const bandNormal = new Vector3();

/** A point on the wall at height `y`, moved along its horizontal normal. */
function wallPoint(theta: number, y: number, offset: number, target: Vector3) {
  const t = tAtHeight(theta, y / crownHeight);
  crownPoint(theta, t, bandPoint);
  crownNormal(theta, t, bandNormal);
  bandNormal.y = 0;
  bandNormal.normalize();
  return target.set(
    bandPoint.x + bandNormal.x * offset,
    y,
    bandPoint.z + bandNormal.z * offset
  );
}

/** The sweatband, sewn at the base stitch row and folded over at the top. */
function sweatband(resources: HatResources) {
  const columns = 241;
  const around = [0];
  const point = new Vector3();
  const previous = wallPoint(0, 0.2, bandFace, new Vector3());
  for (let i = 1; i < columns; i++) {
    wallPoint((i / (columns - 1)) * TAU, 0.2, bandFace, point);
    around.push((around[i - 1] ?? 0) + point.distanceTo(previous) / MM);
    previous.copy(point);
  }
  const circumference = around[columns - 1] ?? 1;
  const repeats = Math.round(circumference / bandRepeat);
  const rows = (bandLengths[bandLengths.length - 1] ?? 1) * bandPx;
  const textureMm = Math.ceil(rows) / bandPx;
  const positions: number[] = [];
  const uvs: number[] = [];
  bandProfile.forEach(([y = 0, offset = 0], j) => {
    for (let i = 0; i < columns; i++) {
      wallPoint((i / (columns - 1)) * TAU, y, offset, point);
      positions.push(point.x, point.y, point.z);
      uvs.push(
        ((around[i] ?? 0) / circumference) * repeats,
        (bandLengths[j] ?? 0) / textureMm
      );
    }
  });
  return gridGeometry(resources, columns, bandProfile.length, positions, uvs);
}

// Atlas for the small woven and metal parts, at 8 pixels per millimetre.
const atlasPx = 8;
const atlasWidth = 512;
const atlasRows = 224;
const brandRegion: LabelRegion = {x: 0, y: 0, width: 232, rows: 184};
const sizeRegion: LabelRegion = {x: 240, y: 0, width: 184, rows: 200};
const eyeletRegion: LabelRegion = {x: 432, y: 0, width: 64, rows: 64};
const rivetRegion: LabelRegion = {x: 432, y: 80, width: 64, rows: 64};
const eyeletRadius = 2.9;
const rivetRadius = 3.2;

async function atlasMaps(
  resources: HatResources,
  anisotropy: number,
  task: BuildTask
) {
  const art = labelArt(atlasWidth, atlasRows, atlasPx, brandRegion, sizeRegion);
  const out = fields(atlasWidth * atlasRows);
  const inside = ({x, y, width, rows}: LabelRegion, px: number, py: number) =>
    px >= x && px < x + width && py >= y && py < y + rows;
  for (let y = 0; y < atlasRows; y++) {
    if (y % 8 === 0) await task.checkpoint();
    for (let x = 0; x < atlasWidth; x++) {
      const p = y * atlasWidth + x;
      const fibre = hash(x, y, 41);
      if (inside(eyeletRegion, x, y) || inside(rivetRegion, x, y)) {
        const region = inside(eyeletRegion, x, y) ? eyeletRegion : rivetRegion;
        const dx = (x + 0.5 - region.x - region.width / 2) / atlasPx;
        const dy = (y + 0.5 - region.y - region.rows / 2) / atlasPx;
        const r = Math.hypot(dx, dy);
        if (region === eyeletRegion) {
          // The back of an embroidered eyelet: black radial satin round a
          // punched hole.
          const threads =
            0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 36 + 6 * fibre);
          const ring = clamp01((r - 1.05) / (eyeletRadius - 1.05));
          const satin = Math.sin(Math.PI * ring) ** 0.6;
          const hole = 1 - smoothstep(0.95, 1.2, r);
          out.shade[p] =
            (0.1 + 0.12 * satin * (0.6 + 0.4 * threads)) *
              smoothstep(1.0, 1.6, r) *
              (1 - hole) +
            0.01 * hole;
          out.height[p] = satin * (0.7 + 0.3 * threads) - hole;
          out.roughness[p] = 0.8 - 0.1 * satin + 0.2 * hole;
        } else {
          // Rivet face: albedo comes from the material; a pressed ring and
          // fine turning marks.
          const bead = Math.exp(-(((r - 2.45) / 0.18) ** 2));
          out.shade[p] = 1 - 0.25 * bead;
          out.height[p] = bead + 0.04 * Math.sin(r * 40) + 0.03 * fibre;
          out.roughness[p] = 0.9 + 0.2 * (fibre - 0.5) + 0.2 * bead;
        }
        continue;
      }
      // Woven labels: black picks with white woven artwork and folded ends.
      const region = inside(brandRegion, x, y)
        ? brandRegion
        : inside(sizeRegion, x, y)
          ? sizeRegion
          : undefined;
      const ink = art[p] ?? 0;
      const pick = 0.5 + 0.5 * Math.sin((TAU * (y + 0.5)) / 4);
      const end = region
        ? Math.min(x + 0.5 - region.x, region.x + region.width - x - 0.5) /
          atlasPx
        : 0;
      const hem = region ? Math.exp(-(((end - 1) / 0.35) ** 2)) : 0;
      out.shade[p] =
        (0.075 + (0.8 - 0.075) * ink) *
        (0.9 + 0.1 * pick + 0.1 * (fibre - 0.5)) *
        (1 - 0.35 * hem);
      out.height[p] = 0.35 * pick + 0.4 * ink - 0.5 * hem;
      out.roughness[p] = 0.92 - 0.12 * ink;
    }
  }
  return surfaceMaps(
    resources,
    atlasWidth,
    atlasRows,
    out,
    0.4,
    anisotropy,
    false,
    task
  );
}

interface Label {
  region: LabelRegion;
  theta: number;
  // Bottom and top heights above the base, in model units.
  bottom: number;
  top: number;
}

// The New Era label at the center back and the size label to the wearer's
// right of it, both sewn flat onto the sweatband.
const labels: Label[] = [
  {region: brandRegion, theta: Math.PI, bottom: 0.075, top: 0.34},
  {region: sizeRegion, theta: Math.PI + 0.62, bottom: 0.058, top: 0.345},
];

function label(resources: HatResources, {region, theta, bottom, top}: Label) {
  const columns = 9;
  const rows = 5;
  const t = tAtHeight(theta, (bottom + top) / 2 / crownHeight);
  const speed = ringSpeed(theta, t);
  const halfSpan = (region.width / atlasPx / 2) * MM;
  const positions: number[] = [];
  const uvs: number[] = [];
  const point = new Vector3();
  for (let j = 0; j < rows; j++) {
    const b = j / (rows - 1);
    for (let i = 0; i < columns; i++) {
      const a = i / (columns - 1);
      // Seen from inside, the label's left is toward larger azimuths.
      const angle = theta + ((1 - 2 * a) * halfSpan) / speed;
      const lift = 0.0028 + 0.0008 * Math.sin(Math.PI * a);
      wallPoint(angle, top - b * (top - bottom), bandFace - lift, point);
      positions.push(point.x, point.y, point.z);
      uvs.push(
        (region.x + a * region.width) / atlasWidth,
        (region.y + b * region.rows) / atlasRows
      );
    }
  }
  return gridGeometry(resources, columns, rows, positions, uvs);
}

/** Eyelets seen from inside: dark stitched rings punched through the lining. */
function eyeletBacks(resources: HatResources) {
  const rings = 3;
  const sectors = 32;
  const center = new Vector2(
    eyeletRegion.x + eyeletRegion.width / 2,
    eyeletRegion.y + eyeletRegion.rows / 2
  );
  return eyelets.map(({theta, t}, index) => {
    const lengths = meridianLengths(theta);
    const meridian = lengthAtT(lengths, t);
    const speed = ringSpeed(theta, t);
    const positions: number[] = [];
    const uvs: number[] = [];
    const point = new Vector3();
    for (let i = 0; i <= sectors; i++) {
      const angle = (i / sectors) * TAU;
      // Stitches leave a slightly ragged outline.
      const edge = 1 + 0.12 * (hash(i % sectors, index, 51) - 0.5);
      for (let j = 0; j <= rings; j++) {
        const r = (j / rings) * eyeletRadius * (j === rings ? edge : 1);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        surfacePoint(
          theta + (x * MM) / speed,
          tAtLength(lengths, meridian + y * MM),
          -0.0065,
          {},
          point
        );
        positions.push(point.x, point.y, point.z);
        uvs.push(
          (center.x + x * atlasPx) / atlasWidth,
          (center.y + y * atlasPx) / atlasRows
        );
      }
    }
    return gridGeometry(resources, rings + 1, sectors + 1, positions, uvs);
  });
}

/** The button's backing rivet: a gunmetal dome over the crossed tapes. */
function rivet(resources: HatResources) {
  // Crown height at a distance from the apex, lowest over all azimuths.
  const surface = (r: number) => {
    let lowest = crownHeight;
    for (let i = 0; i < 12; i++) {
      const theta = (i / 12) * TAU;
      const reach = Math.hypot(
        halfWidth * Math.sin(theta),
        halfDepth * Math.cos(theta)
      );
      const t = tAtRadius(theta, r / reach);
      lowest = Math.min(lowest, surfacePoint(theta, t, 0).y);
    }
    return lowest;
  };
  const stack = 0.0099;
  const profile = [
    [0, 1.1],
    [0.6, 1.07],
    [1.2, 0.96],
    [1.7, 0.78],
    [2.05, 0.56],
    [2.3, 0.36],
    [2.55, 0.27],
    [2.9, 0.22],
    [3.1, 0.12],
    [rivetRadius, 0],
  ].map(
    ([r = 0, dome = 0]) =>
      new Vector2(r * MM, surface(r * MM) - stack - dome * MM)
  );
  const geometry = resources.own(new LatheGeometry(profile, 32));
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  const scale = atlasPx / MM;
  for (let i = 0; i < positions.count; i++) {
    uvs.setXY(
      i,
      (rivetRegion.x + rivetRegion.width / 2 + positions.getX(i) * scale) /
        atlasWidth,
      (rivetRegion.y + rivetRegion.rows / 2 + positions.getZ(i) * scale) /
        atlasRows
    );
  }
  return geometry;
}

export async function createInterior(
  resources: HatResources,
  twill: SurfaceMaps,
  anisotropy: number,
  task: BuildTask
) {
  const tapeTextures = await tapeMaps(resources, anisotropy, task);
  const buckramTileU = (buckramWidth / buckramPx) * MM;
  const buckramTileV = (buckramHeight / buckramPx) * MM;
  const buckram = withOcclusion(
    resources.merge([
      lining(resources, 0, buckramTileU, buckramTileV),
      lining(resources, 5, buckramTileU, buckramTileV),
    ])
  );
  const back = withOcclusion(
    resources.merge(
      [1, 2, 3, 4].map(panel => lining(resources, panel, twillTile, twillTile))
    )
  );
  const tapes = withOcclusion(
    resources.merge(
      tapeRuns.flatMap((run, i) =>
        tape(resources, i, run, printStart(run, tapeTextures.elements))
      )
    )
  );
  const band = withOcclusion(sweatband(resources));
  const trims = withOcclusion(
    resources.merge([
      ...labels.map(item => label(resources, item)),
      ...eyeletBacks(resources),
    ])
  );
  const backer = withOcclusion(rivet(resources));
  for (const geometry of [buckram, back, band, trims]) {
    await bakeInteriorOcclusion(geometry, {flip: true}, task);
  }
  for (const geometry of [tapes, backer])
    await bakeInteriorOcclusion(geometry, {}, task);

  const atlas = await atlasMaps(resources, anisotropy, task);
  // The back of the crown twill is duller than its face.
  const matte = detailTexture(
    resources,
    greyPixels(new Float32Array(16).fill(1)),
    4,
    4,
    {
      anisotropy,
      repeat: true,
    }
  );
  return [
    new Mesh(
      buckram,
      clothMaterial(resources, {
        color: '#dcd8d0',
        maps: await buckramMaps(resources, anisotropy, task),
        normalScale: 0.5,
        sheen: 0.4,
        sheenColor: '#303030',
        specularIntensity: 0.05,
      })
    ),
    new Mesh(
      back,
      clothMaterial(resources, {
        color: '#2a2a2a',
        maps: {...twill, roughnessMap: matte},
        roughness: 0.95,
        normalScale: 0.15,
        sheen: 0.5,
        sheenColor: '#262626',
        sheenRoughness: 0.8,
        specularIntensity: 0.06,
      })
    ),
    new Mesh(
      tapes,
      clothMaterial(resources, {
        color: '#ffffff',
        maps: tapeTextures.maps,
        normalScale: 0.4,
        sheen: 0.5,
        sheenColor: '#2a2a2a',
        specularIntensity: 0.3,
      })
    ),
    new Mesh(
      band,
      clothMaterial(resources, {
        color: '#ffffff',
        maps: await bandMaps(resources, anisotropy, task),
        normalScale: 0.5,
        sheen: 0.25,
        sheenColor: '#1c1c1c',
        sheenRoughness: 0.85,
        specularIntensity: 0.08,
      })
    ),
    new Mesh(
      trims,
      clothMaterial(resources, {
        color: '#ffffff',
        maps: atlas,
        normalScale: 0.5,
        sheen: 0.4,
        sheenColor: '#2a2a2a',
        specularIntensity: 0.15,
      })
    ),
    new Mesh(
      backer,
      clothMaterial(resources, {
        color: '#4a4a4a',
        maps: atlas,
        roughness: 0.45,
        metalness: 1,
        normalScale: 0.6,
        sheen: 0.01,
      })
    ),
  ];
}
