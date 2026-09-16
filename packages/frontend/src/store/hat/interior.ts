import {LatheGeometry, Mesh, Vector2, Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {gridGeometry} from './geometry';
import {clothMaterial, withOcclusion} from './materials';
import {bakeInteriorOcclusion} from './occlusion';
import {
  crownHeight,
  crownNormal,
  crownPoint,
  halfDepth,
  halfWidth,
  lengthAtT,
  MM,
  meridianLengths,
  ringSpeed,
  seamAngles,
  surfacePoint,
  tAtHeight,
} from './shape';
import {
  detailTexture,
  greyPixels,
  normalPixels,
  plainMaps,
  type SurfaceMaps,
  twillTile,
} from './textures';

const TAU = Math.PI * 2;
// Everything below the lining is hidden behind the sweatband.
const liningStart = 0.3;
// Model units per repeat of the buckram's open weave, about 1 mm per cell.
const buckramTile = 0.08;
const sweatbandHeight = 0.41;
const sweatbandInset = 0.021;
const tapeWidth = 13 * MM;
const tapeRepeat = 0.6;

/** The inside face of one panel, just behind the crown fabric. */
function lining(panel: number, tile: number) {
  const start = seamAngles[panel] ?? 0;
  const span = (seamAngles[panel + 1] ?? TAU) - start;
  const center = start + span / 2;
  const lengths = meridianLengths(center);
  const bottom = tAtHeight(center, liningStart / crownHeight);
  const columns = 13;
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
      uvs.push(((s - 0.5) * width) / tile, lengthAtT(lengths, t) / tile);
    }
  }
  return gridGeometry(columns, rows, positions, uvs);
}

/** Haircloth buckram behind the front panels: a light grey open weave. */
function buckramMaps(anisotropy: number): SurfaceMaps {
  const size = 64;
  const height = new Float32Array(size * size);
  const shade = new Float32Array(size * size);
  const roughness = new Float32Array(size * size).fill(0.95);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = Math.cos((x / size) * TAU * 8) ** 2;
      const weft = Math.cos((y / size) * TAU * 8) ** 2;
      const thread = Math.max(warp, weft);
      height[y * size + x] = thread;
      shade[y * size + x] = 0.35 + 0.65 * thread ** 0.6;
    }
  }
  const options = {anisotropy, repeat: true};
  return {
    map: detailTexture(greyPixels(shade), size, size, {...options, srgb: true}),
    normalMap: detailTexture(
      normalPixels(height, size, size, 0.4, true),
      size,
      size,
      options
    ),
    roughnessMap: detailTexture(greyPixels(roughness), size, size, options),
  };
}

// 5 x 7 block glyphs for the "59FIFTY" seam tape print, drawn without fonts
// so the texture never waits on font loading.
const glyphs: Record<string, string[]> = {
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
};

/** Black satin seam tape printed with "59FIFTY" and a boxed flag mark. */
function tapeMaps(anisotropy: number): SurfaceMaps {
  const width = 64;
  const rows = 512;
  const print = new Float32Array(width * rows);
  const set = (x: number, y: number) => {
    if (x >= 0 && x < width)
      print[(((y % rows) + rows) % rows) * width + x] = 1;
  };
  const pixel = 3;
  for (const offset of [0, rows / 2]) {
    let cursor = offset + 40;
    for (const letter of '59FIFTY') {
      const glyph = glyphs[letter] ?? [];
      // Letters read along the tape, standing across its width.
      glyph.forEach((line, row) => {
        [...line].forEach((bit, column) => {
          if (bit !== '1') return;
          for (let dy = 0; dy < pixel; dy++) {
            for (let dx = 0; dx < pixel; dx++) {
              set(21 + (6 - row) * pixel + dx, cursor + column * pixel + dy);
            }
          }
        });
      });
      cursor += 6 * pixel;
    }
    // A small box with a flag-like wedge.
    const boxStart = cursor + 24;
    for (let y = boxStart; y < boxStart + 30; y++) {
      for (let x = 17; x < 47; x++) {
        const edge = x < 19 || x > 44 || y < boxStart + 2 || y > boxStart + 27;
        const flag =
          x > 23 &&
          x < 41 &&
          y > boxStart + 7 &&
          y < boxStart + 23 - (x - 23) / 3;
        if (edge || flag) set(x, y);
      }
    }
  }
  const shade = new Float32Array(width * rows);
  const height = new Float32Array(width * rows);
  const roughness = new Float32Array(width * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const border = x < 3 || x > width - 4;
      // Needle perforations along both edges.
      const perforation = (x === 5 || x === width - 6) && y % 12 < 3;
      shade[p] = print[p] ? 0.85 : perforation ? 0.02 : border ? 0.07 : 0.1;
      height[p] = border ? 0.6 : 0;
      roughness[p] = print[p] ? 0.7 : 0.45;
    }
  }
  const options = {anisotropy, repeat: true};
  return {
    map: detailTexture(greyPixels(shade), width, rows, {
      ...options,
      srgb: true,
    }),
    normalMap: detailTexture(
      normalPixels(height, width, rows, 0.5, true),
      width,
      rows,
      options
    ),
    roughnessMap: detailTexture(greyPixels(roughness), width, rows, options),
  };
}

function tape(seam: number, index: number) {
  const lengths = meridianLengths(seam);
  const bottom = tAtHeight(seam, liningStart / crownHeight);
  const rows = 49;
  const positions: number[] = [];
  const uvs: number[] = [];
  const point = new Vector3();
  const halfSpan = Math.PI / 6;
  // Tapes cross under the button, so each sits a hair deeper than the last.
  const lift = -0.0075 - index * 0.0006;
  for (let j = 0; j < rows; j++) {
    const t = bottom + ((0.999 - bottom) * j) / (rows - 1);
    const speed = ringSpeed(seam, t);
    for (const across of [-1, 0, 1]) {
      const angle = Math.max(
        -halfSpan,
        Math.min(halfSpan, (across * tapeWidth) / 2 / Math.max(speed, 1e-3))
      );
      surfacePoint(seam + angle, t, lift, {}, point);
      positions.push(point.x, point.y, point.z);
      uvs.push((across + 1) / 2, lengthAtT(lengths, t) / tapeRepeat);
    }
  }
  return gridGeometry(3, rows, positions, uvs);
}

/** The sweatband, sewn at the base stitch row and folded over at the top. */
function sweatband() {
  const profile = [
    [0.012, -sweatbandInset],
    [0.05, -sweatbandInset],
    [0.12, -sweatbandInset],
    [0.2, -sweatbandInset],
    [0.28, -sweatbandInset],
    [0.35, -sweatbandInset],
    [0.395, -sweatbandInset + 0.001],
    [sweatbandHeight, -0.017],
    [sweatbandHeight + 0.003, -0.011],
    [sweatbandHeight, -0.006],
  ];
  const columns = 241;
  const positions: number[] = [];
  const uvs: number[] = [];
  const point = new Vector3();
  const outward = new Vector3();
  for (const [y = 0, offset = 0] of profile) {
    for (let i = 0; i < columns; i++) {
      const theta = (i / (columns - 1)) * TAU;
      const t = tAtHeight(theta, y / crownHeight);
      crownPoint(theta, t, point);
      crownNormal(theta, t, outward);
      outward.y = 0;
      outward.normalize();
      positions.push(
        point.x + outward.x * offset,
        y,
        point.z + outward.z * offset
      );
      // The band's finer knit uses the twill at half scale.
      const around = (theta * (halfWidth + halfDepth)) / 2;
      uvs.push((2 * around) / twillTile, (2 * y) / twillTile);
    }
  }
  return gridGeometry(columns, profile.length, positions, uvs);
}

/** The metal backer that fixes the button, where the tapes cross. */
function rivet() {
  const profile = [
    [0, 0],
    [0.012, -0.0004],
    [0.022, -0.0012],
    [0.028, -0.0005],
    [0.031, 0.002],
  ].map(([r = 0, y = 0]) => new Vector2(r, y));
  const geometry = new LatheGeometry(profile, 24);
  geometry.translate(0, crownHeight - 0.017, 0);
  return geometry;
}

export function createInterior(twill: SurfaceMaps, anisotropy: number) {
  const buckram = withOcclusion(
    mergeGeometries([lining(0, buckramTile), lining(5, buckramTile)])
  );
  const back = withOcclusion(
    mergeGeometries([1, 2, 3, 4].map(panel => lining(panel, twillTile)))
  );
  const tapes = withOcclusion(
    mergeGeometries(seamAngles.map((seam, i) => tape(seam, i)))
  );
  const band = withOcclusion(sweatband());
  const backer = withOcclusion(rivet());
  for (const geometry of [buckram, back, tapes, band]) {
    bakeInteriorOcclusion(geometry, {flip: true});
  }
  bakeInteriorOcclusion(backer);
  return [
    new Mesh(
      buckram,
      clothMaterial({color: '#8d8d89', maps: buckramMaps(anisotropy)})
    ),
    new Mesh(back, clothMaterial({color: '#2c2c2c', maps: twill})),
    new Mesh(
      tapes,
      clothMaterial({
        color: '#ffffff',
        maps: tapeMaps(anisotropy),
        normalScale: 0.3,
        sheenColor: '#303030',
        specularIntensity: 0.35,
      })
    ),
    new Mesh(
      band,
      clothMaterial({
        color: '#212121',
        maps: twill,
        roughness: 0.8,
        normalScale: 0.2,
        specularIntensity: 0.25,
      })
    ),
    new Mesh(
      backer,
      clothMaterial({
        color: '#b4b4b0',
        maps: plainMaps(anisotropy),
        roughness: 0.35,
        metalness: 1,
        sheen: 0.01,
      })
    ),
  ];
}
