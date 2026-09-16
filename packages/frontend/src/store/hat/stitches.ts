import type {DataTexture} from 'three';
import type {HatResources} from './resources';
import {MM} from './shape';
import {detailTexture, type SurfaceMaps, twillTile} from './textures';

// Stitched details on the crown carry the cloth's own twill texels, so the
// parts around the thread match the panels exactly and only the stitching
// itself stands out.

/** A deterministic hash in 0..1 for per-stitch jitter. */
function jitter(index: number, salt: number) {
  let h =
    Math.imul(index ^ 0x5bd1e995, 0x2c1b3c6d) ^ Math.imul(salt, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return k * k * (3 - 2 * k);
};

interface StitchTexel {
  // Twill texel to show underneath.
  x: number;
  y: number;
  // Stitch relief in millimetres.
  height: number;
  // How much the thread hides the twill, 0..1.
  cover: number;
  // Albedo and roughness scales, relative to the mean cloth.
  shade: number;
  roughness: number;
}

/**
 * Composes stitch maps over the cloth's twill. `texel` fills in each output
 * texel; the relief becomes normals at the cloth material's normal scale.
 */
function composeStitches(
  resources: HatResources,
  cloth: SurfaceMaps,
  normalScale: number,
  width: number,
  rows: number,
  wrap: boolean,
  anisotropy: number,
  texel: (x: number, y: number, out: StitchTexel) => void
): SurfaceMaps {
  const read = (texture: DataTexture) =>
    (texture.image.data ?? new Uint8Array(4)) as Uint8Array;
  const shade = read(cloth.map);
  const normal = read(cloth.normalMap);
  const rough = read(cloth.roughnessMap);
  const size = cloth.map.image.width;
  const count = size * size;
  let shadeMean = 0;
  let roughMean = 0;
  for (let p = 0; p < count; p++) {
    shadeMean += (shade[p * 4] ?? 0) / count;
    roughMean += (rough[p * 4] ?? 0) / count;
  }
  const texelMM = twillTile / size / MM;
  const height = new Float32Array(width * rows);
  const cover = new Float32Array(width * rows);
  const source = new Int32Array(width * rows);
  const albedo = new Uint8Array(width * rows * 4);
  const roughness = new Uint8Array(width * rows * 4);
  const out: StitchTexel = {
    x: 0,
    y: 0,
    height: 0,
    cover: 0,
    shade: 1,
    roughness: 1,
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      out.height = out.cover = 0;
      out.shade = out.roughness = 1;
      texel(x, y, out);
      const i = y * width + x;
      const s =
        ((((out.y % size) + size) % size) * size +
          (((out.x % size) + size) % size)) *
        4;
      source[i] = s;
      height[i] = out.height;
      cover[i] = out.cover;
      const base = (value: number, mean: number) =>
        value + (mean - value) * out.cover;
      const value = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
      albedo[i * 4] =
        albedo[i * 4 + 1] =
        albedo[i * 4 + 2] =
          value(base(shade[s] ?? 0, shadeMean) * out.shade);
      roughness[i * 4] =
        roughness[i * 4 + 1] =
        roughness[i * 4 + 2] =
          value(base(rough[s] ?? 0, roughMean) * out.roughness);
      albedo[i * 4 + 3] = roughness[i * 4 + 3] = 255;
    }
  }
  const at = (x: number, y: number) => {
    const column = wrap
      ? (x + width) % width
      : Math.min(width - 1, Math.max(0, x));
    const row = wrap ? (y + rows) % rows : Math.min(rows - 1, Math.max(0, y));
    return height[row * width + column] ?? 0;
  };
  const normals = new Uint8Array(width * rows * 4);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const s = source[i] ?? 0;
      const keep = 1 - (cover[i] ?? 0);
      // Cloth slopes as encoded, plus the stitch relief's true slope undone
      // by the material's normal scale.
      const nz = ((normal[s + 2] ?? 255) - 127.5) / 127.5 || 1;
      const dx =
        (-((normal[s] ?? 127.5) - 127.5) / 127.5 / nz) * keep +
        (at(x + 1, y) - at(x - 1, y)) / (2 * texelMM) / normalScale;
      const dy =
        (-((normal[s + 1] ?? 127.5) - 127.5) / 127.5 / nz) * keep +
        (at(x, y + 1) - at(x, y - 1)) / (2 * texelMM) / normalScale;
      const length = Math.hypot(dx, dy, 1);
      normals[i * 4] = Math.round((-dx / length) * 127.5 + 127.5);
      normals[i * 4 + 1] = Math.round((-dy / length) * 127.5 + 127.5);
      normals[i * 4 + 2] = Math.round((1 / length) * 127.5 + 127.5);
      normals[i * 4 + 3] = 255;
    }
  }
  const options = {anisotropy, repeat: wrap};
  return {
    map: detailTexture(resources, albedo, width, rows, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(resources, normals, width, rows, options),
    roughnessMap: detailTexture(resources, roughness, width, rows, options),
  };
}

export interface RibbonLayout {
  maps: SurfaceMaps;
  // Model units: the ribbon's width and the length of one texture repeat.
  width: number;
  repeat: number;
  // Texture u ranges for ribbons along the meridians and around the base.
  meridian: [number, number];
  ring: [number, number];
}

/**
 * A lockstitch row on the cloth: 3 mm tonal thread dashes pulled slightly
 * into the fabric, with needle holes between them. v runs along the row and
 * the texture repeats every twill tile. The left half suits rows that run up
 * the meridians, the right half rows that run around the crown, with the
 * twill turned to match the panels either way.
 */
export function stitchRibbon(
  resources: HatResources,
  cloth: SurfaceMaps,
  normalScale: number,
  anisotropy: number
): RibbonLayout {
  const size = cloth.map.image.width;
  const texelMM = twillTile / size / MM;
  const half = Math.round(1.5 / texelMM);
  const rows = size;
  const stitches = Math.round((rows * texelMM) / 3.1);
  const pitch = (rows * texelMM) / stitches;
  const maps = composeStitches(
    resources,
    cloth,
    normalScale,
    half * 2,
    rows,
    true,
    anisotropy,
    (x, y, out) => {
      const turned = x >= half;
      const column = turned ? x - half : x;
      const across = (column + 0.5 - half / 2) * texelMM;
      const along = (y + 0.5) * texelMM;
      // Around the crown the row runs along the panels' u and across their -v.
      out.x = turned ? y : x;
      out.y = turned ? -column : y;
      const phase = along / pitch;
      const stitch = Math.floor(phase);
      const f = phase - stitch;
      const fromHole = Math.min(f, 1 - f) * pitch;
      const hole = (f < 0.5 ? stitch : stitch + 1) % stitches;
      const center = (jitter(stitch, 1) - 0.5) * 0.08;
      const halfWidth = 0.19 + jitter(stitch, 2) * 0.04;
      const gap = 0.2 + jitter(hole, 3) * 0.12;
      const q = (across - center) / halfWidth;
      const round = q * q < 1 ? Math.sqrt(1 - q * q) : 0;
      const dash = smoothstep(gap, gap + 0.35, fromHole);
      const thread = round * dash;
      const twist =
        0.5 + 0.5 * Math.sin(2 * Math.PI * (phase * 10 + across * 2.5));
      const holeSpot = Math.exp(-(fromHole ** 2 + across ** 2) / 0.14 ** 2);
      out.height =
        0.07 * thread ** 0.7 +
        0.01 * twist * thread -
        0.035 * Math.exp(-((across / 0.45) ** 2)) -
        0.06 *
          Math.exp(-((fromHole / 0.3) ** 2)) *
          Math.exp(-((across / 0.3) ** 2));
      out.cover = smoothstep(0, 0.35, thread);
      out.shade =
        (1 + (0.12 + 0.04 * (jitter(stitch, 4) - 0.5)) * out.cover) *
        (1 - 0.4 * holeSpot);
      out.roughness = 1 - 0.25 * out.cover;
    }
  );
  const texel = twillTile / size;
  const span = half * 2;
  return {
    maps,
    width: (half - 1) * texel,
    repeat: rows * texel,
    meridian: [0.5 / span, (half - 0.5) / span],
    ring: [(half + 0.5) / span, (span - 0.5) / span],
  };
}

/** Eyelet disc radius, in model units, covered by `eyeletMaps`. */
export function eyeletRadius(cloth: SurfaceMaps) {
  const size = cloth.map.image.width;
  return eyeletTexels(size) * 0.5 * (twillTile / size);
}

const eyeletTexels = (size: number) =>
  2 * Math.round((5.45 * MM) / (twillTile / size));

/** Radii of the punched hole and the satin ring's edge, in millimetres. */
export const eyeletHole = 1.5;
const eyeletRing = 4.7;

/**
 * An embroidered eyelet: a raised ring of radial satin stitches with jittered
 * angle, width and length around a punched, near-black hole, fading into the
 * twill. u runs around the crown and v up the meridian, like the panels.
 */
export function eyeletMaps(
  resources: HatResources,
  cloth: SurfaceMaps,
  normalScale: number,
  anisotropy: number
) {
  const size = cloth.map.image.width;
  const texelMM = twillTile / size / MM;
  const width = eyeletTexels(size);
  const count = 58;
  // Uneven boundaries between neighboring stitches.
  const bounds = Array.from(
    {length: count + 1},
    (_, i) => i + (i % count === 0 ? 0 : (jitter(i, 7) - 0.5) * 0.5)
  );
  return composeStitches(
    resources,
    cloth,
    normalScale,
    width,
    width,
    false,
    anisotropy,
    (x, y, out) => {
      out.x = x;
      out.y = y;
      const dx = (x + 0.5 - width / 2) * texelMM;
      const dy = (y + 0.5 - width / 2) * texelMM;
      const r = Math.hypot(dx, dy);
      // Satin threads lean slightly as they wrap over the ring.
      const turn =
        ((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * count + (r - 3) * 0.35;
      const k = ((turn % count) + count) % count;
      let stitch = Math.floor(k);
      while (stitch > 0 && (bounds[stitch] ?? 0) > k) stitch--;
      while (stitch < count - 1 && (bounds[stitch + 1] ?? count) <= k) {
        stitch++;
      }
      const from = bounds[stitch] ?? stitch;
      const phase = (k - from) / ((bounds[stitch + 1] ?? from + 1) - from);
      const inner = eyeletHole + (jitter(stitch, 8) - 0.5) * 0.2;
      const outer = eyeletRing + (jitter(stitch, 9) - 0.5) * 0.6;
      const ring =
        smoothstep(inner - 0.1, inner + 0.15, r) *
        (1 - smoothstep(outer - 0.15, outer + 0.05, r));
      const thread = Math.sin(Math.PI * phase) ** 0.6;
      const hole = 1 - smoothstep(eyeletHole - 0.35, eyeletHole - 0.05, r);
      out.cover = Math.max(ring, hole);
      out.height = 0.12 * thread * ring;
      const halo = r > outer ? 0.25 * Math.exp(-(((r - outer) / 0.5) ** 2)) : 0;
      out.shade =
        (1 +
          ring *
            (0.15 + 0.08 * (jitter(stitch, 10) - 0.5) - 0.25 * (1 - thread))) *
        (1 - halo) *
        (1 - 0.94 * hole);
      out.roughness = 1 - 0.22 * ring * thread + 0.3 * hole;
    }
  );
}
