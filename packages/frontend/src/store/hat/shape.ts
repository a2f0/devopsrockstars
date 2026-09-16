import {CatmullRomCurve3, Vector2, Vector3} from 'three';
import {ImprovedNoise} from 'three/addons/math/ImprovedNoise.js';

// Model units: the crown base is 2.30 units deep, about 200 mm at size 7 1/2.
export const MM = 0.0115;

// Low Profile proportions measured from New Era's product photography; see
// the artwork README. +X is the wearer's left, +Z the visor, +Y up.
export const halfWidth = 1.08;
export const halfDepth = 1.15;
export const crownHeight = 1.24;

const TAU = Math.PI * 2;
const referenceRadius = (halfWidth + halfDepth) / 2;

// Wall radius (fraction of the base radius) at fractions of the crown height.
// The front is a buckram face leaning back about 15 degrees that rolls tightly
// into a broad top; the back stays near vertical longer; the sides taper as
// straight walls into a shoulder. All three rise to a shallow tent apex.
const frontPoints = [
  [1, 0],
  [1, 0.1],
  [0.985, 0.2],
  [0.955, 0.3],
  [0.925, 0.4],
  [0.89, 0.5],
  [0.85, 0.6],
  [0.8, 0.7],
  [0.71, 0.8],
  [0.63, 0.85],
  [0.5, 0.9],
  [0.3, 0.95],
  [0.14, 0.984],
  [0, 1],
] as const;
const backPoints = [
  [1, 0],
  [0.995, 0.1],
  [0.985, 0.2],
  [0.975, 0.3],
  [0.96, 0.4],
  [0.93, 0.5],
  [0.89, 0.6],
  [0.82, 0.7],
  [0.72, 0.8],
  [0.64, 0.85],
  [0.53, 0.9],
  [0.34, 0.95],
  [0.16, 0.984],
  [0, 1],
] as const;
const sidePoints = [
  [1, 0],
  [0.98, 0.1],
  [0.96, 0.2],
  [0.94, 0.3],
  [0.92, 0.4],
  [0.895, 0.5],
  [0.87, 0.6],
  [0.83, 0.7],
  [0.75, 0.8],
  [0.69, 0.85],
  [0.6, 0.9],
  [0.45, 0.95],
  [0.22, 0.982],
  [0, 1],
] as const;

const profileSamples = 256;

interface Profile {
  r: Float64Array;
  h: Float64Array;
}

// Resample each profile uniformly by arc length, so one meridian parameter t
// lines up base, wall, shoulder and top across the blended directions.
function profile(points: readonly (readonly [number, number])[]): Profile {
  const curve = new CatmullRomCurve3(
    points.map(
      ([r, h]) => new Vector3(r * referenceRadius, h * crownHeight, 0)
    ),
    false,
    'centripetal'
  );
  curve.arcLengthDivisions = 2000;
  const spaced = curve.getSpacedPoints(profileSamples);
  return {
    r: Float64Array.from(spaced, p => Math.max(0, p.x / referenceRadius)),
    h: Float64Array.from(spaced, p => Math.min(1, p.y / crownHeight)),
  };
}

const front = profile(frontPoints);
const back = profile(backPoints);
const side = profile(sidePoints);

let sampledRadius = 0;
let sampledHeight = 0;

function sampleProfile(theta: number, t: number) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const fore = cos >= 0 ? front : back;
  const x = Math.min(Math.max(t, 0), 1) * profileSamples;
  const i = Math.min(Math.floor(x), profileSamples - 1);
  const f = x - i;
  const r0 = (fore.r[i] ?? 0) + ((fore.r[i + 1] ?? 0) - (fore.r[i] ?? 0)) * f;
  const h0 = (fore.h[i] ?? 0) + ((fore.h[i + 1] ?? 0) - (fore.h[i] ?? 0)) * f;
  const r1 = (side.r[i] ?? 0) + ((side.r[i + 1] ?? 0) - (side.r[i] ?? 0)) * f;
  const h1 = (side.h[i] ?? 0) + ((side.h[i + 1] ?? 0) - (side.h[i] ?? 0)) * f;
  sampledRadius = cos * cos * r0 + sin * sin * r1;
  sampledHeight = cos * cos * h0 + sin * sin * h1;
}

/**
 * The ideal crown surface. `theta` is the azimuth of the base ellipse (0 at
 * the front, increasing toward +X) and `t` runs from the base (0) to the apex.
 */
export function crownPoint(theta: number, t: number, target = new Vector3()) {
  sampleProfile(theta, t);
  return target.set(
    halfWidth * sampledRadius * Math.sin(theta),
    crownHeight * sampledHeight,
    halfDepth * sampledRadius * Math.cos(theta)
  );
}

const du = new Vector3();
const dv = new Vector3();
const scratch = new Vector3();

export function crownNormal(theta: number, t: number, target = new Vector3()) {
  const e = 1e-4;
  const tt = Math.min(Math.max(t, e), 0.996);
  crownPoint(theta + e, tt, du).sub(crownPoint(theta - e, tt, scratch));
  crownPoint(theta, tt + e, dv).sub(crownPoint(theta, tt - e, scratch));
  return target.crossVectors(du, dv).normalize();
}

/** Crown height fraction at a surface parameter. */
export function heightFraction(theta: number, t: number) {
  sampleProfile(theta, t);
  return sampledHeight;
}

/** Wall radius (fraction of the base ellipse) at a surface parameter. */
export function radiusFraction(theta: number, t: number) {
  sampleProfile(theta, t);
  return sampledRadius;
}

/** Surface distance travelled per radian along a ring of constant t. */
export function ringSpeed(theta: number, t: number) {
  sampleProfile(theta, t);
  return (
    sampledRadius *
    Math.hypot(halfWidth * Math.cos(theta), halfDepth * Math.sin(theta))
  );
}

/** Cumulative meridian arc length from the base, at `steps + 1` values of t. */
export function meridianLengths(theta: number, steps = 256) {
  const lengths = new Float64Array(steps + 1);
  const previous = crownPoint(theta, 0);
  const point = new Vector3();
  for (let i = 1; i <= steps; i++) {
    crownPoint(theta, i / steps, point);
    lengths[i] = (lengths[i - 1] ?? 0) + point.distanceTo(previous);
    previous.copy(point);
  }
  return lengths;
}

/** Inverts `meridianLengths`: the t at which the meridian reaches `length`. */
export function tAtLength(lengths: Float64Array, length: number) {
  const steps = lengths.length - 1;
  let low = 0;
  let high = steps;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((lengths[middle] ?? 0) < length) low = middle;
    else high = middle;
  }
  const a = lengths[low] ?? 0;
  const b = lengths[high] ?? a;
  const f = b > a ? Math.min(Math.max((length - a) / (b - a), 0), 1) : 0;
  return (low + f) / steps;
}

/** The meridian arc length at t, interpolated from `meridianLengths`. */
export function lengthAtT(lengths: Float64Array, t: number) {
  const x = t * (lengths.length - 1);
  const i = Math.min(Math.floor(x), lengths.length - 2);
  const a = lengths[i] ?? 0;
  return a + ((lengths[i + 1] ?? a) - a) * (x - i);
}

/** t at which the crown reaches a height fraction along one meridian. */
export function tAtHeight(theta: number, fraction: number) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2;
    if (heightFraction(theta, middle) < fraction) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// Base azimuths of the six seams: centered front and back seams, with the
// front panels slightly wider than the side and back panels.
export const seamAngles = [0, 62, 120, 180, 240, 298].map(
  degrees => (degrees * Math.PI) / 180
);

function panelAt(theta: number) {
  const angle = ((theta % TAU) + TAU) % TAU;
  let panel = seamAngles.length - 1;
  for (let i = 1; i < seamAngles.length; i++) {
    if (angle < (seamAngles[i] ?? TAU)) {
      panel = i - 1;
      break;
    }
  }
  const start = seamAngles[panel] ?? 0;
  const end = seamAngles[panel + 1] ?? TAU;
  return {panel, start, span: end - start, s: (angle - start) / (end - start)};
}

/** Panel center azimuths, where the eyelets and the side and rear marks sit. */
export function panelCenter(panel: number) {
  const start = seamAngles[panel] ?? 0;
  return (start + (seamAngles[panel + 1] ?? TAU)) / 2;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return k * k * (3 - 2 * k);
};

const noise = new ImprovedNoise();

// Eyelets sit on each panel centerline about 50 mm along the surface below
// the button.
export const eyelets = seamAngles.map((_, panel) => {
  const theta = panelCenter(panel);
  const lengths = meridianLengths(theta);
  const t = tAtLength(lengths, (lengths[lengths.length - 1] ?? 0) - 50 * MM);
  return {theta, t, point: crownPoint(theta, t)};
});

export interface ReliefOptions {
  // Embroidery bridges the seam valleys instead of following them.
  seams?: boolean;
}

/**
 * Offset along the crown normal that turns the ideal shell into sewn fabric:
 * narrow seam valleys with topstitch compression, softly puffed side and back
 * panels, a taut buckram front, a small V where the front seam meets the
 * visor, the edge rolling under into the sweatband and low-frequency pucker.
 * Everything placed on the crown must add the same relief.
 */
export function panelRelief(
  theta: number,
  t: number,
  point: Vector3,
  {seams = true}: ReliefOptions = {}
) {
  const {panel, span, s} = panelAt(theta);
  sampleProfile(theta, t);
  const y = sampledHeight * crownHeight;
  const width =
    span *
    sampledRadius *
    Math.hypot(halfWidth * Math.cos(theta), halfDepth * Math.sin(theta));
  const d = Math.min(s, 1 - s) * width;
  const frontPanel = panel === 0 || panel === 5;
  const rise = smoothstep(0.015, 0.2, y) * (1 - smoothstep(0.8, 0.97, t));
  const dome = Math.sin(Math.PI * s);
  const puff =
    (frontPanel ? 0.004 : 0.012) *
    smoothstep(0, 0.1, d) *
    (0.4 + 0.6 * dome) *
    rise *
    Math.min(1, width / 0.5);
  const pucker =
    0.0014 *
    noise.noise(point.x * 2.6 + panel * 7.3, point.y * 2.6, point.z * 2.6) *
    dome *
    rise;
  // Seams and fabric gather where the six panels meet under the button.
  const gather =
    0.0012 *
    noise.noise(point.x * 11, point.y * 11, point.z * 11) *
    smoothstep(0.86, 0.95, t) *
    (1 - smoothstep(0.975, 1, t));
  const roll = -0.004 * (1 - smoothstep(0, 0.016, y)) ** 2;
  let relief = puff + pucker + gather + roll;
  for (const eyelet of eyelets) {
    const distance = eyelet.point.distanceTo(point);
    if (distance < 0.12) relief -= 0.0022 * Math.exp(-((distance / 0.04) ** 2));
  }
  if (seams) {
    // The buckram-backed front seam stays shallower than the others.
    const frontSeam = (s < 0.5 && panel === 0) || (s >= 0.5 && panel === 5);
    const backSeam = (s < 0.5 && panel === 3) || (s >= 0.5 && panel === 2);
    const fade = 1 - smoothstep(0.93, 0.99, t);
    relief -=
      ((frontSeam ? 0.003 : backSeam ? 0.005 : 0.006) *
        Math.exp(-((d / 0.009) ** 2)) +
        0.0007 * Math.exp(-(((d - 0.052) / 0.007) ** 2))) *
      fade;
    if (frontSeam) {
      relief -=
        0.005 * Math.exp(-((d / 0.03) ** 2)) * (1 - smoothstep(0, 0.1, y));
    }
  }
  return relief;
}

const reliefPoint = new Vector3();
const alongRing = new Vector3();
const alongMeridian = new Vector3();
const behind = new Vector3();

/** A point on the relieved crown, lifted along the normal by `lift`. */
export function surfacePoint(
  theta: number,
  t: number,
  lift: number,
  options: ReliefOptions = {},
  target = new Vector3()
) {
  crownPoint(theta, t, reliefPoint);
  const offset = panelRelief(theta, t, reliefPoint, options) + lift;
  crownNormal(theta, t, target);
  return target.multiplyScalar(offset).add(reliefPoint);
}

/** The relieved surface normal, by central differences. */
export function surfaceNormal(
  theta: number,
  t: number,
  options: ReliefOptions = {},
  target = new Vector3()
) {
  const e = 2e-3;
  const tt = Math.min(Math.max(t, e), 0.99);
  surfacePoint(theta + e, tt, 0, options, alongRing).sub(
    surfacePoint(theta - e, tt, 0, options, behind)
  );
  surfacePoint(theta, tt + e, 0, options, alongMeridian).sub(
    surfacePoint(theta, tt - e, 0, options, behind)
  );
  return target.crossVectors(alongRing, alongMeridian).normalize();
}

// Flat visor: 3 mm thick with a rounded turned edge, projecting 0.35 of the
// crown depth. Its plan is a superellipse ahead of the widest line, with
// wings that sweep back into the crown near the front/side seams.
export const visorThickness = 0.035;
export const visorTop = -0.001;
export const visorEdgeRadius = visorThickness / 2;
const visorWidest = 0.93;
const visorHalfWidth = 1.14;
const visorTip = 1.95;
const visorExponent = 2.2;
const visorWingAngle = (61 * Math.PI) / 180;
// The visor root tucks just inside the crown opening, under the fold.
const visorRootScale = 0.975;

function cubic(
  p0: Vector2,
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  u: number
): Vector2 {
  const v = 1 - u;
  return new Vector2(
    v * v * v * p0.x +
      3 * v * v * u * p1.x +
      3 * v * u * u * p2.x +
      u ** 3 * p3.x,
    v * v * v * p0.y +
      3 * v * v * u * p1.y +
      3 * v * u * u * p2.y +
      u ** 3 * p3.y
  );
}

/**
 * The contour the visor's stitch rows are offset from. The inner rows sit up
 * to 47 mm in, deeper than the radius of the edge's superellipse corners and
 * wing bends, so they follow the edge's inscribed ellipse instead, continued
 * behind the widest line until it passes under the crown.
 */
export function visorStitchContour(count: number) {
  const behind = 0.95;
  return Array.from({length: count}, (_, i) => {
    const phi = Math.PI + behind - (i / (count - 1)) * (Math.PI + 2 * behind);
    return new Vector2(
      visorHalfWidth * Math.cos(phi),
      visorWidest + (visorTip - visorWidest) * Math.sin(phi)
    );
  });
}

/**
 * Outer visor edge in plan (x, z), from the wing root at -X round the tip to
 * the wing root at +X, spaced evenly by arc length.
 */
export function visorOutline(count: number) {
  const dense: Vector2[] = [];
  const wing = (sign: number) => {
    const theta = visorWingAngle;
    const root = new Vector2(
      sign * halfWidth * 0.97 * Math.sin(theta),
      halfDepth * 0.97 * Math.cos(theta)
    );
    // Leave the crown close to its tangent, then turn forward at the widest.
    const direction = new Vector2(
      sign * (Math.sin(theta) / halfWidth) * 1.2 -
        sign * halfWidth * Math.cos(theta),
      (Math.cos(theta) / halfDepth) * 1.2 + halfDepth * Math.sin(theta)
    ).normalize();
    const widest = new Vector2(sign * visorHalfWidth, visorWidest);
    return (u: number) =>
      cubic(
        root,
        root.clone().addScaledVector(direction, 0.2),
        new Vector2(widest.x, visorWidest - 0.2),
        widest,
        u
      );
  };
  const right = wing(-1);
  const left = wing(1);
  for (let i = 0; i < 120; i++) dense.push(right(i / 120));
  // Superellipse ahead of the widest line, swept from -X to +X.
  for (let i = 0; i < 240; i++) {
    const phi = Math.PI - (i / 240) * Math.PI;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    dense.push(
      new Vector2(
        visorHalfWidth * Math.sign(c) * Math.abs(c) ** (2 / visorExponent),
        visorWidest +
          (visorTip - visorWidest) * Math.abs(s) ** (2 / visorExponent)
      )
    );
  }
  for (let i = 120; i >= 0; i--) dense.push(left(i / 120));
  const lengths = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i] ?? new Vector2();
    const b = dense[i - 1] ?? a;
    lengths.push((lengths[i - 1] ?? 0) + a.distanceTo(b));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  const outline: Vector2[] = [];
  let j = 1;
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * total;
    while (j < dense.length - 1 && (lengths[j] ?? 0) < target) j++;
    const a = dense[j - 1] ?? new Vector2();
    const b = dense[j] ?? a;
    const la = lengths[j - 1] ?? 0;
    const lb = lengths[j] ?? la;
    outline.push(a.clone().lerp(b, lb > la ? (target - la) / (lb - la) : 0));
  }
  return outline;
}

/** Where the visor root meets the crown opening, for u from -X to +X. */
export function visorRoot(u: number, target = new Vector2()) {
  const theta = -visorWingAngle + u * 2 * visorWingAngle;
  return target.set(
    halfWidth * visorRootScale * Math.sin(theta),
    halfDepth * visorRootScale * Math.cos(theta)
  );
}
