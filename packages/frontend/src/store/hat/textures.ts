import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
} from 'three';

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

export interface TextureOptions {
  anisotropy: number;
  srgb?: boolean;
  repeat?: boolean;
}

export function detailTexture(
  pixels: Uint8Array,
  width: number,
  height: number,
  {anisotropy, srgb = false, repeat = false}: TextureOptions
) {
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
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
// Model units per twill repeat: 16 wales about 2 mm apart, roughly twice the
// real pitch, so the weave survives mipmapping at product size.
export const twillTile = 0.5;

export interface Twill {
  height: Float32Array;
  fibre: Float32Array;
  heather: Float32Array;
}

/**
 * A tileable twill: rounded diagonal wales built from short yarn floats, the
 * fine 45 degree rib that shows on New Era's polyester crown fabric.
 */
export function twillField(seed = 5950): Twill {
  const random = seededRandom(seed);
  const size = twillSize;
  // 16 wales and 32 floats per tile keep the pattern tileable.
  const wale = size / 16;
  const float = size / 32;
  const height = new Float32Array(size * size);
  const fibre = Float32Array.from({length: size * size}, () => random());
  const slub = tileNoise(size, 32, random);
  const heather = tileNoise(size, 64, random);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const across = (x + y + 0.5) / wale;
      const index = Math.floor(across);
      const rib = Math.sin(Math.PI * (across - index)) ** 0.7;
      // Floats in neighboring wales are staggered, like interlaced yarn.
      const along = (x - y + size) / float + index / 2;
      const yarn = Math.sin(Math.PI * (along - Math.floor(along))) ** 0.5;
      const p = y * size + x;
      height[p] =
        rib * (0.75 + 0.25 * yarn) +
        ((fibre[p] ?? 0) - 0.5) * 0.12 +
        ((slub[p] ?? 0) - 0.5) * 0.1;
    }
  }
  return {height, fibre, heather};
}

/** Twill albedo scale in 0..1: heathered yarn with sparse light lint specks. */
export function twillShade(twill: Twill, p: number) {
  const fibre = twill.fibre[p] ?? 0;
  return (
    0.9 +
    ((twill.heather[p] ?? 0) - 0.5) * 0.16 +
    (fibre > 0.9975 ? 0.5 : fibre > 0.985 ? 0.12 : 0) +
    (twill.height[p] ?? 0) * 0.06
  );
}

/** Twill roughness in 0..1: yarn crowns are slightly smoother than valleys. */
export function twillRoughness(twill: Twill, p: number) {
  return (
    0.86 - 0.26 * (twill.height[p] ?? 0) + ((twill.fibre[p] ?? 0) - 0.5) * 0.1
  );
}

export function twillMaps(twill: Twill, anisotropy: number): SurfaceMaps {
  const size = twillSize;
  const shade = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  for (let p = 0; p < size * size; p++) {
    shade[p] = twillShade(twill, p);
    roughness[p] = twillRoughness(twill, p);
  }
  const options = {anisotropy, repeat: true};
  return {
    map: detailTexture(greyPixels(shade), size, size, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(
      normalPixels(twill.height, size, size, 1.2, true),
      size,
      size,
      options
    ),
    roughnessMap: detailTexture(greyPixels(roughness), size, size, options),
  };
}

/** Plain maps for smooth parts that still share the cloth shader program. */
export function plainMaps(anisotropy: number, shade = 1): SurfaceMaps {
  const size = 4;
  const options = {anisotropy, repeat: true};
  return {
    map: detailTexture(
      greyPixels(new Float32Array(size * size).fill(shade)),
      size,
      size,
      {...options, srgb: true}
    ),
    normalMap: detailTexture(
      normalPixels(new Float32Array(size * size), size, size, 0, true),
      size,
      size,
      options
    ),
    roughnessMap: detailTexture(
      greyPixels(new Float32Array(size * size).fill(1)),
      size,
      size,
      options
    ),
  };
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

/**
 * A tileable lockstitch: 3 mm tonal thread dashes pulled into the fabric,
 * with needle holes between them. u runs across the row, v along it, one
 * stitch per texture repeat.
 */
export function stitchMaps(anisotropy: number): SurfaceMaps {
  const width = 32;
  const rows = 64;
  const height = new Float32Array(width * rows);
  const shade = new Float32Array(width * rows);
  const roughness = new Float32Array(width * rows);
  for (let y = 0; y < rows; y++) {
    const along = (y + 0.5) / rows;
    const dash = Math.sin(
      Math.PI * Math.min(1, Math.max(0, (along - 0.1) / 0.8))
    );
    const hole = Math.exp(-(((along < 0.5 ? along : along - 1) / 0.04) ** 2));
    for (let x = 0; x < width; x++) {
      const across = ((x + 0.5) / width) * 2 - 1;
      const thread = Math.sqrt(Math.max(0, 1 - (across / 0.42) ** 2)) * dash;
      const p = y * width + x;
      const groove = Math.exp(-((across / 0.55) ** 2));
      height[p] = thread * 0.9 - groove * 0.5;
      shade[p] = (0.9 - 0.12 * groove + 0.3 * thread) * (1 - 0.55 * hole);
      roughness[p] = 0.8 - 0.22 * thread;
    }
  }
  const options = {anisotropy, repeat: true};
  return {
    map: detailTexture(greyPixels(shade), width, rows, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(
      normalPixels(height, width, rows, 0.35, true),
      width,
      rows,
      options
    ),
    roughnessMap: detailTexture(greyPixels(roughness), width, rows, options),
  };
}
