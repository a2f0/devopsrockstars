import {
  type BufferGeometry,
  LatheGeometry,
  Mesh,
  Vector2,
  Vector3,
} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {gridGeometry} from './geometry';
import {clothMaterial, fabricColor, withOcclusion} from './materials';
import {
  bakeOcclusion,
  buttonSolid,
  crownSolid,
  unionSolid,
  visorSolid,
} from './occlusion';
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
  ringSpeed,
  seamAngles,
  surfaceNormal,
  surfacePoint,
  tAtHeight,
  tAtLength,
} from './shape';
import {
  detailTexture,
  greyPixels,
  normalPixels,
  type SurfaceMaps,
  stitchMaps,
  twillTile,
} from './textures';

const TAU = Math.PI * 2;
const stitchPitch = 3.2 * MM;
const topstitchOffset = 5 * MM;
const baseStitchHeight = 4.5 * MM;

// Distances from a seam where the seam valley and topstitching need vertices.
const seamDistances = [
  0, 0.004, 0.009, 0.016, 0.026, 0.04, 0.05, 0.056, 0.066, 0.085, 0.11,
];

function goreColumns(width: number) {
  const reference = Math.max(width, 0.4);
  const scale = width / reference;
  const middle = 9;
  const edge = seamDistances[seamDistances.length - 1] ?? 0;
  const distances = [...seamDistances];
  for (let i = 1; i <= middle; i++) {
    distances.push(edge + ((reference / 2 - edge) * i) / middle);
  }
  const half = distances.map(d => (d * scale) / width);
  const columns = [...half];
  for (let i = half.length - 2; i >= 0; i--) columns.push(1 - (half[i] ?? 0));
  return columns;
}

// Dense rows at the folded base edge, even spacing above it.
const goreRows = Array.from({length: 61}, (_, j) => {
  const u = j / 60;
  return u - 0.9 * u * (1 - u) ** 6;
});

function gore(panel: number) {
  const start = seamAngles[panel] ?? 0;
  const span = (seamAngles[panel + 1] ?? TAU) - start;
  const center = start + span / 2;
  const lengths = meridianLengths(center);
  const positions: number[] = [];
  const uvs: number[] = [];
  const point = new Vector3();
  let columnCount = 0;
  for (const t of goreRows) {
    const width = span * ringSpeed(center, t);
    const columns = goreColumns(Math.max(width, 1e-4));
    columnCount = columns.length;
    const v = lengthAtT(lengths, t);
    for (const s of columns) {
      surfacePoint(start + s * span, t, 0, {}, point);
      positions.push(point.x, point.y, point.z);
      // Arc-length UVs per panel: each panel is cut on its own grain, so the
      // twill changes direction at every seam.
      uvs.push(((s - 0.5) * width) / twillTile, v / twillTile);
    }
  }
  return gridGeometry(columnCount, goreRows.length, positions, uvs);
}

/** Tonal topstitching beside each seam and around the base of the crown. */
function stitchRibbons() {
  const halfWidth = 0.45 * MM;
  const ribbons: BufferGeometry[] = [];
  const point = new Vector3();
  const normal = new Vector3();
  const across = new Vector3();
  const previous = new Vector3();
  const ribbon = (
    samples: {theta: number; t: number; across: 'ring' | 'meridian'}[]
  ) => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    let along = 0;
    samples.forEach(({theta, t, across: direction}, i) => {
      surfacePoint(theta, t, 0.0006, {}, point);
      surfaceNormal(theta, t, {}, normal);
      if (i > 0) along += point.distanceTo(previous);
      previous.copy(point);
      if (direction === 'ring') {
        crownPoint(theta + 1e-3, t, across).sub(crownPoint(theta - 1e-3, t));
      } else {
        crownPoint(theta, t + 1e-3, across).sub(crownPoint(theta, t - 1e-3));
      }
      // Keep the ribbon's winding facing out, matching its explicit normals.
      across.normalize().multiplyScalar(direction === 'ring' ? 1 : -1);
      for (const side of [-1, 1]) {
        positions.push(
          point.x + across.x * halfWidth * side,
          point.y + across.y * halfWidth * side,
          point.z + across.z * halfWidth * side
        );
        uvs.push((side + 1) / 2, along / stitchPitch);
        normals.push(normal.x, normal.y, normal.z);
      }
    });
    ribbons.push(gridGeometry(2, samples.length, positions, uvs, normals));
  };
  for (const seam of seamAngles) {
    const lengths = meridianLengths(seam);
    const top = tAtLength(lengths, (lengths[lengths.length - 1] ?? 0) - 0.13);
    for (const side of [-1, 1]) {
      const samples = [];
      const bottom = tAtHeight(seam, (baseStitchHeight + 0.004) / crownHeight);
      for (let i = 0; i <= 80; i++) {
        const t = bottom + ((top - bottom) * i) / 80;
        samples.push({
          theta: seam + (side * topstitchOffset) / ringSpeed(seam, t),
          t,
          across: 'ring' as const,
        });
      }
      ribbon(samples);
    }
  }
  const base = [];
  for (let i = 0; i <= 720; i++) {
    const theta = (i / 720) * TAU;
    base.push({
      theta,
      t: tAtHeight(theta, baseStitchHeight / crownHeight),
      across: 'meridian' as const,
    });
  }
  ribbon(base);
  return mergeGeometries(ribbons);
}

/** Embroidered eyelets: a radial satin ring around a dark punched hole. */
function eyeletMaps(anisotropy: number): SurfaceMaps {
  const size = 96;
  const radius = 5.5;
  const height = new Float32Array(size * size);
  const shade = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(dx, dy) * radius;
      const p = y * size + x;
      const ring = Math.min(Math.max((r - 1.4) / 3.2, 0), 1);
      const satin = r > 1.4 && r < 4.6 ? Math.sin(Math.PI * ring) ** 0.6 : 0;
      const threads = 0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 44);
      const hole = 1 - Math.min(Math.max((r - 1.1) / 0.5, 0), 1);
      height[p] = satin * (0.8 + 0.2 * threads) - hole * 0.8;
      shade[p] = (0.9 + satin * (0.12 + 0.12 * threads)) * (1 - 0.95 * hole);
      roughness[p] = 0.8 - satin * 0.18 + hole * 0.2;
    }
  }
  const options = {anisotropy};
  return {
    map: detailTexture(greyPixels(shade), size, size, {...options, srgb: true}),
    normalMap: detailTexture(
      normalPixels(height, size, size, 1.6, false),
      size,
      size,
      options
    ),
    roughnessMap: detailTexture(greyPixels(roughness), size, size, options),
  };
}

function eyeletDiscs() {
  const rings = 6;
  const sectors = 32;
  const radius = 5.5 * MM;
  const discs = eyelets.map(({theta, t}) => {
    const lengths = meridianLengths(theta);
    const meridian = lengthAtT(lengths, t);
    const speed = ringSpeed(theta, t);
    const positions: number[] = [];
    const uvs: number[] = [];
    const point = new Vector3();
    // Radius runs along columns and angle along rows, so faces point out.
    for (let i = 0; i <= sectors; i++) {
      for (let j = 0; j <= rings; j++) {
        const angle = (i / sectors) * TAU;
        const r = (j / rings) * radius;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        surfacePoint(
          theta + x / speed,
          tAtLength(lengths, meridian + y),
          0.0005,
          {},
          point
        );
        positions.push(point.x, point.y, point.z);
        uvs.push(0.5 + x / (2 * radius), 0.5 + y / (2 * radius));
      }
    }
    return gridGeometry(rings + 1, sectors + 1, positions, uvs);
  });
  return mergeGeometries(discs);
}

// A fabric-covered cushion: flat top, well-rounded edge, short near-vertical
// side and a slight waist where the seams gather under it.
function button() {
  const profile = [
    [0, 0.062],
    [0.03, 0.0618],
    [0.05, 0.061],
    [0.064, 0.0575],
    [0.075, 0.051],
    [0.082, 0.042],
    [0.085, 0.031],
    [0.085, 0.019],
    [0.081, 0.009],
    [0.075, 0.003],
    [0.07, 0],
  ].map(([r = 0, y = 0]) => new Vector2(r, y));
  // Unroll the cover from its center so the twill keeps its scale.
  const lengths = [0];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i] ?? new Vector2();
    lengths.push((lengths[i - 1] ?? 0) + a.distanceTo(profile[i - 1] ?? a));
  }
  // LatheGeometry expects the profile from bottom to top for outward normals.
  profile.reverse();
  lengths.reverse();
  const geometry = new LatheGeometry(profile, 40);
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  const perRing = profile.length;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const length = lengths[i % perRing] ?? 0;
    uvs.setXY(
      i,
      (Math.cos(angle) * length) / twillTile,
      (Math.sin(angle) * length) / twillTile
    );
  }
  geometry.translate(0, crownHeight - 0.006, 0);
  return geometry;
}

// The crown fabric folds under the base edge into the sweatband; no bead.
function baseFold() {
  // From inside the sweatband round to the outer wall, so faces point out.
  const profile = [
    [-0.021, 0.014],
    [-0.02, 0.008],
    [-0.017, 0.003],
    [-0.013, 0.001],
    [-0.008, 0.0008],
    [-0.004, 0.0],
  ];
  const columns = 241;
  const positions: number[] = [];
  const uvs: number[] = [];
  const point = new Vector3();
  const outward = new Vector3();
  for (const [offset = 0, y = 0] of profile) {
    for (let i = 0; i < columns; i++) {
      const theta = (i / (columns - 1)) * TAU;
      crownPoint(theta, 0, point);
      crownNormal(theta, 0.002, outward);
      outward.y = 0;
      outward.normalize();
      positions.push(
        point.x + outward.x * offset,
        y,
        point.z + outward.z * offset
      );
      uvs.push(
        (theta * (halfWidth + halfDepth)) / 2 / twillTile,
        y / twillTile
      );
    }
  }
  return gridGeometry(columns, profile.length, positions, uvs);
}

export function createCrown(twill: SurfaceMaps, anisotropy: number) {
  const occluder = unionSolid(crownSolid(), visorSolid(), buttonSolid());
  // Only the lower front (near the visor) and the apex can be occluded.
  const near = (p: Vector3) =>
    (p.y < 0.5 && p.z > -0.35) || Math.hypot(p.x, p.z) < 0.35;

  const shell = withOcclusion(
    mergeGeometries(seamAngles.map((_, panel) => gore(panel)))
  );
  bakeOcclusion(shell, occluder, {include: near});
  const fabric = clothMaterial({color: fabricColor, maps: twill});
  const stitchMaterial = clothMaterial({
    color: fabricColor,
    maps: stitchMaps(anisotropy),
    normalScale: 1,
    specularIntensity: 0.25,
  });
  const eyeletMaterial = clothMaterial({
    color: fabricColor,
    maps: eyeletMaps(anisotropy),
    normalScale: 1,
  });

  const stitches = withOcclusion(stitchRibbons());
  bakeOcclusion(stitches, occluder, {include: near});
  const eyeletGeometry = withOcclusion(eyeletDiscs());
  bakeOcclusion(eyeletGeometry, occluder, {include: near});
  const buttonGeometry = withOcclusion(button());
  const fold = withOcclusion(baseFold(), 0.6);
  bakeOcclusion(fold, occluder);

  return [
    new Mesh(shell, fabric),
    new Mesh(stitches, stitchMaterial),
    new Mesh(eyeletGeometry, eyeletMaterial),
    new Mesh(buttonGeometry, fabric),
    new Mesh(fold, fabric),
  ];
}
