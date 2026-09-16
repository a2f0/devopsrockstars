import {
  BufferAttribute,
  type BufferGeometry,
  LatheGeometry,
  Mesh,
  Vector2,
  Vector3,
} from 'three';
import type {BuildTask} from './buildTask';
import {gridGeometry} from './geometry';
import {clothMaterial, fabricColor, withOcclusion} from './materials';
import {bakeOcclusion, crownSolid, unionSolid, visorSolid} from './occlusion';
import type {HatResources} from './resources';
import {
  buttonRadius,
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
  topstitchOffset,
} from './shape';
import {
  eyeletHole,
  eyeletMaps,
  eyeletRadius,
  type RibbonLayout,
  stitchRibbon,
} from './stitches';
import {panelGrain, type SurfaceMaps, twillTile} from './textures';

const TAU = Math.PI * 2;
const baseStitchHeight = 4.5 * MM;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return k * k * (3 - 2 * k);
};

// Distances from a seam where the valley, welt and topstitching need
// vertices.
const seamDistances = [
  0, 0.004, 0.009, 0.016, 0.026, 0.038, 0.048, 0.0535, 0.0575, 0.0615, 0.068,
  0.085, 0.11,
];

function goreColumns(width: number) {
  const reference = Math.max(width, 0.4);
  const scale = width / reference;
  const middle = 7;
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

// Rows near the apex, in millimetres below it, resolve the button's contact
// shadow and the seams converging under it.
const apexRows = [21, 15.5, 13.5, 11.8, 10.5, 9.5, 8.7, 8, 7.3, 6.4, 5, 3, 0];

function gore(resources: HatResources, panel: number) {
  const start = seamAngles[panel] ?? 0;
  const span = (seamAngles[panel + 1] ?? TAU) - start;
  const center = start + span / 2;
  const lengths = meridianLengths(center);
  const total = lengths[lengths.length - 1] ?? 0;
  const rows = [
    ...goreRows.filter(t => lengthAtT(lengths, t) < total - 22 * MM),
    ...apexRows.map(mm => tAtLength(lengths, total - mm * MM)),
  ];
  const frontSeams = panel === 0 || panel === 5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const shade: number[] = [];
  const point = new Vector3();
  let columnCount = 0;
  for (const t of rows) {
    const width = span * ringSpeed(center, t);
    const columns = goreColumns(Math.max(width, 1e-4));
    columnCount = columns.length;
    const v = lengthAtT(lengths, t);
    for (const s of columns) {
      surfacePoint(start + s * span, t, 0, {}, point);
      positions.push(point.x, point.y, point.z);
      // Flat-pattern UVs per panel: each panel is cut on its own grain, so the
      // twill changes direction at every seam.
      uvs.push(...panelGrain((s - 0.5) * width, v, total));
      // A narrow dark crease along each seam, deepest at the buckram front,
      // and the contact shadow round the button.
      const d = Math.min(s, 1 - s) * width;
      const front = frontSeams && (panel === 0 ? s < 0.5 : s >= 0.5);
      const crease = 1 - (front ? 0.55 : 0.4) * Math.exp(-((d / 0.004) ** 2));
      const apex = Math.hypot(point.x, point.z) - buttonRadius;
      const contact =
        apex < 0 ? 0.45 : 1 - 0.55 * Math.exp(-((apex / 0.013) ** 2));
      const value = crease * contact;
      shade.push(value, value, value);
    }
  }
  const geometry = gridGeometry(
    resources,
    columnCount,
    rows.length,
    positions,
    uvs
  );
  geometry.setAttribute(
    'color',
    new BufferAttribute(new Float32Array(shade), 3)
  );
  return geometry;
}

interface RibbonSample {
  theta: number;
  t: number;
}

/**
 * A strip of stitch texture laid on the relieved crown, three vertices
 * across. `across` steps a sample sideways in (theta, t).
 */
function ribbon(
  resources: HatResources,
  layout: RibbonLayout,
  [u0, u1]: [number, number],
  samples: RibbonSample[],
  across: (sample: RibbonSample, offset: number) => RibbonSample,
  lift: number,
  // Where along its texture the row starts, so neighboring rows differ.
  start: number
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const center = new Vector3();
  const previous = new Vector3();
  const point = new Vector3();
  const normal = new Vector3();
  let along = start * layout.repeat;
  samples.forEach((sample, i) => {
    surfacePoint(sample.theta, sample.t, lift, {}, center);
    if (i > 0) along += center.distanceTo(previous);
    previous.copy(center);
    for (const side of [-1, 0, 1]) {
      const {theta, t} = across(sample, (side * layout.width) / 2);
      surfacePoint(theta, t, lift, {}, point);
      surfaceNormal(theta, t, {}, normal);
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(u0 + ((side + 1) / 2) * (u1 - u0), along / layout.repeat);
    }
  });
  return gridGeometry(resources, 3, samples.length, positions, uvs, normals);
}

/** Tonal topstitching beside each seam and around the base of the crown. */
function stitchRibbons(resources: HatResources, layout: RibbonLayout) {
  const ribbons: BufferGeometry[] = [];
  const alongRing = (sample: RibbonSample, offset: number) => ({
    theta: sample.theta + offset / ringSpeed(sample.theta, sample.t),
    t: sample.t,
  });
  for (const [index, seam] of seamAngles.entries()) {
    const bottom = tAtHeight(seam, (baseStitchHeight + MM) / crownHeight);
    for (const side of [-1, 1]) {
      const neighbor =
        side > 0
          ? (seamAngles[index + 1] ?? TAU)
          : (seamAngles[index - 1] ?? (seamAngles[5] ?? 0) - TAU);
      // Rows keep 5 mm from the seam until they close in on the rows of the
      // neighboring seam, a few millimetres out from the button.
      const limit = 0.46 * Math.abs(neighbor - seam);
      let low = 0.5;
      let top = 1;
      for (let i = 0; i < 30; i++) {
        const middle = (low + top) / 2;
        if (topstitchOffset / ringSpeed(seam, middle) < limit) low = middle;
        else top = middle;
      }
      const samples: RibbonSample[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = bottom + ((low - bottom) * i) / 64;
        samples.push({
          theta: seam + (side * topstitchOffset) / ringSpeed(seam, t),
          t,
        });
      }
      // Where rows from neighboring seams meet, one sits a hair higher.
      ribbons.push(
        ribbon(
          resources,
          layout,
          layout.meridian,
          samples,
          alongRing,
          side < 0 ? 0.0006 : 0.00075,
          (index * 2 + side) * 0.387
        )
      );
    }
  }
  const base: RibbonSample[] = [];
  for (let i = 0; i <= 400; i++) {
    const theta = (i / 400) * TAU;
    base.push({theta, t: tAtHeight(theta, baseStitchHeight / crownHeight)});
  }
  const probe = new Vector3();
  const below = new Vector3();
  ribbons.push(
    ribbon(
      resources,
      layout,
      layout.ring,
      base,
      (sample, offset) => {
        // Across the base row u runs down the wall.
        const e = 1e-3;
        crownPoint(sample.theta, sample.t + e, probe).sub(
          crownPoint(sample.theta, sample.t - e, below)
        );
        return {
          theta: sample.theta,
          t: sample.t - (offset * 2 * e) / probe.length(),
        };
      },
      0.0006,
      0
    )
  );
  return resources.merge(ribbons);
}

// Radii of the eyelet disc's vertex rings in millimetres: dense over the hole
// edge and the satin ring.
const eyeletRings = [0, 1.05, 1.5, 1.85, 2.4, 3.1, 3.8, 4.35, 4.75, 5.05];

/** Height of the embroidered ring above the cloth, in millimetres. */
function eyeletLift(r: number) {
  const ring = 0.6 * Math.max(0, 1 - ((r - 3.1) / 1.75) ** 2) ** 0.7;
  // The punched hole's floor sits below the ring; the cloth around it barely
  // clears the panel.
  return r < eyeletHole
    ? 0.12 + (ring - 0.12) * smoothstep(1.05, eyeletHole, r)
    : Math.max(0.04, ring);
}

function eyeletDiscs(resources: HatResources, radius: number) {
  const sectors = 28;
  const rings = [...eyeletRings, radius / MM];
  const discs = eyelets.map(({theta, t}) => {
    const lengths = meridianLengths(theta);
    const meridian = lengthAtT(lengths, t);
    const speed = ringSpeed(theta, t);
    const positions: number[] = [];
    const uvs: number[] = [];
    const shade: number[] = [];
    const point = new Vector3();
    // Radius runs along columns and angle along rows, so faces point out.
    for (let i = 0; i <= sectors; i++) {
      for (const ring of rings) {
        const angle = (i / sectors) * TAU;
        const r = ring * MM;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        surfacePoint(
          theta + x / speed,
          tAtLength(lengths, meridian + y),
          eyeletLift(ring) * MM,
          {},
          point
        );
        positions.push(point.x, point.y, point.z);
        uvs.push(0.5 + x / (2 * radius), 0.5 + y / (2 * radius));
        // Almost no light reaches into the punched hole.
        const value = 0.3 + 0.7 * smoothstep(1.1, eyeletHole + 0.2, ring);
        shade.push(value, value, value);
      }
    }
    const geometry = gridGeometry(
      resources,
      rings.length,
      sectors + 1,
      positions,
      uvs
    );
    geometry.setAttribute(
      'color',
      new BufferAttribute(new Float32Array(shade), 3)
    );
    return geometry;
  });
  return resources.merge(discs);
}

// A fabric-covered cushion: a nearly flat top, a well-rounded edge, a short
// near-vertical side and a slight waist where the seams gather under it.
function button(resources: HatResources) {
  const profile = [
    [0, 0.058],
    [0.03, 0.0579],
    [0.05, 0.0573],
    [0.062, 0.0563],
    [0.07, 0.0546],
    [0.0765, 0.0516],
    [0.081, 0.0472],
    [0.0838, 0.0412],
    [0.085, 0.034],
    [0.0852, 0.025],
    [0.084, 0.016],
    [0.0805, 0.008],
    [0.075, 0.003],
    [0.069, 0],
    [0.062, -0.006],
  ].map(([r = 0, y = 0]) => new Vector2(r, y));
  // The top keeps the straight grain of the flat cover; round the rim the
  // grain turns to run evenly round the side instead of in rings.
  const lengths = [0];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i] ?? new Vector2();
    lengths.push((lengths[i - 1] ?? 0) + a.distanceTo(profile[i - 1] ?? a));
  }
  // LatheGeometry expects the profile from bottom to top for outward normals.
  profile.reverse();
  lengths.reverse();
  const segments = 48;
  const geometry = resources.own(new LatheGeometry(profile, segments));
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  const shade = new Float32Array(positions.count * 3);
  const perRing = profile.length;
  for (let i = 0; i < positions.count; i++) {
    const phi = (Math.floor(i / perRing) / segments) * TAU;
    const length = lengths[i % perRing] ?? 0;
    const side = smoothstep(0.06, 0.09, length);
    const y = positions.getY(i);
    uvs.setXY(
      i,
      (Math.sin(phi) * length * (1 - side) + phi * 0.085 * side) / twillTile,
      (Math.cos(phi) * length * (1 - side) + (0.058 - y) * side) / twillTile
    );
    // The gathered underside sits in its own shadow.
    shade.fill(0.35 + 0.65 * smoothstep(0, 0.02, y), i * 3, i * 3 + 3);
  }
  geometry.setAttribute('color', new BufferAttribute(shade, 3));
  // The grain's seam round the side faces the back.
  geometry.rotateY(Math.PI);
  // Seat the cushion on the lowest point of the crown under its rim.
  const point = new Vector3();
  let seat = Infinity;
  for (let i = 0; i < 24; i++) {
    const theta = (i / 24) * TAU;
    const lengths = meridianLengths(theta, 64);
    const t = tAtLength(lengths, (lengths[lengths.length - 1] ?? 0) - 0.069);
    seat = Math.min(seat, surfacePoint(theta, t, 0, {}, point).y);
  }
  geometry.translate(0, seat - 0.001, 0);
  return geometry;
}

// The crown fabric folds under the base edge into the sweatband; no bead.
function baseFold(resources: HatResources) {
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
  return gridGeometry(resources, columns, profile.length, positions, uvs);
}

export async function createCrown(
  resources: HatResources,
  twill: SurfaceMaps,
  anisotropy: number,
  task: BuildTask
) {
  const occluder = unionSolid(crownSolid(), visorSolid());
  // Only the lower front, near the visor, can be occluded by another part.
  const near = (p: Vector3) => p.y < 0.5 && p.z > -0.35;

  const fabric = clothMaterial(resources, {color: fabricColor, maps: twill});
  // Stitched parts reuse the cloth's settings and twill, so they only differ
  // where there is thread.
  const normalScale = fabric.normalScale.x;
  const layout = stitchRibbon(resources, twill, normalScale, anisotropy);
  const stitchMaterial = resources.own(fabric.clone());
  Object.assign(stitchMaterial, layout.maps);
  const eyeletMaterial = resources.own(fabric.clone());
  Object.assign(
    eyeletMaterial,
    eyeletMaps(resources, twill, normalScale, anisotropy)
  );

  const panels = [];
  for (const [panel] of seamAngles.entries()) {
    await task.checkpoint();
    panels.push(gore(resources, panel));
  }
  const shell = resources.merge(panels);
  await bakeOcclusion(shell, occluder, {include: near}, task);
  const stitches = withOcclusion(stitchRibbons(resources, layout));
  await bakeOcclusion(stitches, occluder, {include: near}, task);
  const eyeletGeometry = eyeletDiscs(resources, eyeletRadius(twill));
  const buttonGeometry = button(resources);
  const fold = withOcclusion(baseFold(resources), 0.6);
  await bakeOcclusion(fold, occluder, {}, task);

  return [
    new Mesh(shell, fabric),
    new Mesh(stitches, stitchMaterial),
    new Mesh(eyeletGeometry, eyeletMaterial),
    new Mesh(buttonGeometry, fabric),
    new Mesh(fold, fabric),
  ];
}
