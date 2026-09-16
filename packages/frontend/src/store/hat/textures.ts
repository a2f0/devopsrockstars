import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
} from 'three';
import type {HatResources} from './resources';

/** A seeded generator, so procedural detail is identical on every load. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SurfaceMaps {
  map: DataTexture;
  normalMap: DataTexture;
  roughnessMap: DataTexture;
}

interface TextureOptions {
  anisotropy: number;
  srgb?: boolean;
  repeat?: boolean;
}

export function detailTexture(
  resources: HatResources,
  pixels: Uint8Array,
  width: number,
  height: number,
  {anisotropy, srgb = false, repeat = false}: TextureOptions
) {
  const texture = resources.own(
    new DataTexture(pixels, width, height, RGBAFormat)
  );
  // DataTexture defaults to nearest filtering without mipmaps, which shimmers.
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Encodes a height field as a tangent-space normal map. `slope` converts a
 * height difference between neighboring texels into a surface gradient.
 */
export function normalPixels(
  height: Float32Array,
  width: number,
  rows: number,
  slope: number,
  wrap: boolean
) {
  const pixels = new Uint8Array(width * rows * 4);
  const at = (x: number, y: number) => {
    const column = wrap
      ? (x + width) % width
      : Math.min(width - 1, Math.max(0, x));
    const row = wrap ? (y + rows) % rows : Math.min(rows - 1, Math.max(0, y));
    return height[row * width + column] ?? 0;
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * slope;
      const dy = (at(x, y + 1) - at(x, y - 1)) * slope;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      pixels[i] = Math.round((-dx / length) * 127.5 + 127.5);
      pixels[i + 1] = Math.round((-dy / length) * 127.5 + 127.5);
      pixels[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

/** Grey pixels from values in 0..1. */
export function greyPixels(values: Float32Array) {
  const pixels = new Uint8Array(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const value = Math.round(Math.min(1, Math.max(0, values[i] ?? 0)) * 255);
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

// Tileable value noise on a size x size grid with `cells` lattice cells.
function tileNoise(size: number, cells: number, random: () => number) {
  const lattice = Float32Array.from({length: cells * cells}, () => random());
  const values = new Float32Array(size * size);
  const at = (i: number, j: number) =>
    lattice[(j % cells) * cells + (i % cells)] ?? 0;
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    const ty = ease(fy - y0);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const tx = ease(fx - x0);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      values[y * size + x] = a + (b - a) * ty;
    }
  }
  return values;
}

export const twillSize = 512;
// Model units per twill repeat.
export const twillTile = 0.5;
// Wales per repeat: about 1.1 mm apart measured perpendicular to the wale.
// Mipmaps and anisotropic filtering resolve the weave at product size.
const wales = 28;
// Small breaks and changes of sheen along each continuous diagonal wale.
const floats = 32;

export interface Twill {
  /** Relief: rounded wales split by narrow grooves, in 0..1. */
  height: Float32Array;
  /** How exposed the yarn crest is, in 0..1; crests are smoother. */
  crest: Float32Array;
  /** Fibres combed along the wale, roughly -1..1. */
  streak: Float32Array;
  /** Seeded 0..1 per texel, for sparse bright fibre specks. */
  fibre: Float32Array;
  /** Faint dye variation over a few centimetres, roughly -0.5..0.5. */
  heather: Float32Array;
}

/**
 * A tileable 2/2 twill: long diagonal wales of yarn floats with only a small
 * dip where each float dives under, like New Era's polyester crown fabric.
 * Each wale's floats get their own phase so no cross diagonal forms.
 */
export function twillField(seed = 5950): Twill {
  const random = seededRandom(seed);
  const size = twillSize;
  const wale = size / wales;
  const floatLength = size / floats;
  const phases = Float32Array.from({length: wales}, () => random());
  const floatTone = Float32Array.from({length: wales * floats}, () => random());
  const fibre = Float32Array.from({length: size * size}, () => random());
  const heather = tileNoise(size, 4, random).map(value => value - 0.5);
  // Fibres run along the wale: average the per-texel noise along (1, -1).
  const reach = 6;
  const streak = new Float32Array(size * size);
  const gain = Math.sqrt(12 * (2 * reach + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let i = -reach; i <= reach; i++) {
        const column = (x + i + size) % size;
        const row = (y - i + size) % size;
        sum += fibre[row * size + column] ?? 0;
      }
      streak[y * size + x] = (sum / (2 * reach + 1) - 0.5) * gain;
    }
  }
  const height = new Float32Array(size * size);
  const crest = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const across = (x + y + 0.5) / wale;
      const index = Math.floor(across);
      const rib = Math.sin(Math.PI * (across - index)) ** 0.5;
      const along =
        (x - y + size + 0.5) / floatLength + (phases[index % wales] ?? 0);
      const end = along - Math.round(along);
      const dip = Math.exp(-((end / 0.12) ** 2));
      const tone =
        floatTone[(index % wales) * floats + (Math.round(along) % floats)] ??
        0.5;
      const p = y * size + x;
      height[p] =
        rib * (1 - 0.07 * dip) +
        0.09 * rib * (streak[p] ?? 0) +
        ((fibre[p] ?? 0) - 0.5) * 0.03;
      // Broken glints along the floats, without a crosswise height pattern.
      crest[p] = rib * rib * (1 - 0.3 * dip) * (0.5 + 0.5 * tone);
    }
  }
  return {height, crest, streak, fibre, heather};
}

/**
 * Twill albedo scale in 0..1. Nearly uniform: the weave shows through
 * roughness and relief, plus sparse bright fibre specks.
 */
export function twillShade(twill: Twill, p: number) {
  const fibre = twill.fibre[p] ?? 0;
  return (
    0.78 +
    0.04 * ((twill.crest[p] ?? 0) - 0.5) +
    0.05 * (twill.heather[p] ?? 0) +
    (fibre > 0.998 ? 0.22 : fibre > 0.985 ? 0.1 : 0)
  );
}

/** Twill roughness in 0..1: float crests are smooth, grooves are dull. */
export function twillRoughness(twill: Twill, p: number) {
  return (
    0.95 -
    0.62 * (twill.crest[p] ?? 0) +
    0.1 * (twill.streak[p] ?? 0) -
    ((twill.fibre[p] ?? 0) > 1 - 0.015 ? 0.15 : 0)
  );
}

export function twillMaps(
  resources: HatResources,
  twill: Twill,
  anisotropy: number
): SurfaceMaps {
  const size = twillSize;
  const shade = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  for (let p = 0; p < size * size; p++) {
    shade[p] = twillShade(twill, p);
    roughness[p] = twillRoughness(twill, p);
  }
  const options = {anisotropy, repeat: true};
  return {
    map: detailTexture(resources, greyPixels(shade), size, size, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(
      resources,
      normalPixels(twill.height, size, size, 1.2, true),
      size,
      size,
      options
    ),
    roughnessMap: detailTexture(
      resources,
      greyPixels(roughness),
      size,
      size,
      options
    ),
  };
}

/**
 * Twill UVs for a crown panel cut on its own straight grain. `across` is the
 * distance from the panel's centre line around the crown, `along` the
 * distance up that line and `length` the whole line from base to button.
 * Rows unroll as arcs around the button, the way a gore lies flat, so the
 * wales stay straight on the flat top instead of fanning into arcs.
 */
export function panelGrain(across: number, along: number, length: number) {
  const radius = Math.max(length - along, 1e-6);
  const angle = across / radius;
  return [
    (radius * Math.sin(angle)) / twillTile,
    (length - radius * Math.cos(angle)) / twillTile,
  ] as const;
}

// Felzenszwalb-Huttenlocher squared distance transform along one line,
// recording which sample each position is nearest to.
function distanceLine(
  f: Float64Array,
  n: number,
  distance: Float64Array,
  nearest: Int32Array,
  v: Int32Array,
  z: Float64Array
) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    const fq = (f[q] ?? 0) + q * q;
    let vk = v[k] ?? 0;
    let s = (fq - ((f[vk] ?? 0) + vk * vk)) / (2 * q - 2 * vk);
    while (s <= (z[k] ?? 0)) {
      k--;
      vk = v[k] ?? 0;
      s = (fq - ((f[vk] ?? 0) + vk * vk)) / (2 * q - 2 * vk);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? 0) < q) k++;
    const vk = v[k] ?? 0;
    distance[q] = (q - vk) ** 2 + (f[vk] ?? 0);
    nearest[q] = vk;
  }
}

/**
 * Exact Euclidean distance (in texels) from every texel to the nearest seed,
 * plus the index of that seed texel.
 */
export function distanceTransform(
  seeds: Uint8Array,
  width: number,
  rows: number
) {
  const n = Math.max(width, rows);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const line = new Int32Array(n);
  const grid = new Float64Array(width * rows);
  const nearestRow = new Int32Array(width * rows);
  for (let i = 0; i < width * rows; i++) grid[i] = seeds[i] ? 0 : 1e20;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < rows; y++) f[y] = grid[y * width + x] ?? 0;
    distanceLine(f, rows, d, line, v, z);
    for (let y = 0; y < rows; y++) {
      grid[y * width + x] = d[y] ?? 0;
      nearestRow[y * width + x] = line[y] ?? 0;
    }
  }
  const distance = new Float32Array(width * rows);
  const nearest = new Int32Array(width * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x] ?? 0;
    distanceLine(f, width, d, line, v, z);
    for (let x = 0; x < width; x++) {
      const column = line[x] ?? 0;
      distance[y * width + x] = Math.sqrt(d[x] ?? 0);
      nearest[y * width + x] =
        (nearestRow[y * width + column] ?? 0) * width + column;
    }
  }
  return {distance, nearest};
}
