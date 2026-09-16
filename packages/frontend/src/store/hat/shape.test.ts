import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Vector3} from 'three';
import {
  crownHeight,
  crownPoint,
  eyelets,
  halfDepth,
  halfWidth,
  heightFraction,
  lengthAtT,
  MM,
  meridianLengths,
  panelCenter,
  panelRelief,
  radiusFraction,
  seamAngles,
  tAtHeight,
  tAtLength,
  topstitchOffset,
  visorOutline,
  visorTaperAt,
} from './shape';

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`
  );

test('crown keeps the base footprint and rises to a centered apex', () => {
  for (const theta of [0, 1, 2, 3, 4, 5]) {
    const base = crownPoint(theta, 0);
    near((base.x / halfWidth) ** 2 + (base.z / halfDepth) ** 2, 1, 1e-9);
    near(base.y, 0, 1e-9);
    const apex = crownPoint(theta, 1);
    near(apex.y, crownHeight, 1e-3);
    near(Math.hypot(apex.x, apex.z), 0, 1e-3);
    let previous = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const height = heightFraction(theta, t);
      assert.ok(height >= previous, 'meridians must climb monotonically');
      previous = height;
    }
  }
});

test('the Low Profile front leans back further than the back', () => {
  const front = radiusFraction(0, tAtHeight(0, 0.6));
  const back = radiusFraction(Math.PI, tAtHeight(Math.PI, 0.6));
  near(front, 0.85, 0.02);
  near(back, 0.89, 0.02);
  assert.ok(front < back);
});

test('the flat visor projects about 0.35 of the crown depth', () => {
  const outline = visorOutline(401);
  const tip = Math.max(...outline.map(point => point.y));
  near(tip - halfDepth, 0.35 * 2 * halfDepth, 0.02);
  near(Math.max(...outline.map(point => Math.abs(point.x))), 1.14, 0.005);
  outline.forEach((point, i) => {
    const mirror = outline[outline.length - 1 - i];
    near(point.x, -(mirror?.x ?? Number.NaN), 1e-9);
    near(point.y, mirror?.y ?? Number.NaN, 1e-9);
  });
});

test('the visor wings curve back under the crown and close', () => {
  const outline = visorOutline(801);
  // The edge only ever turns one way: no S-bend where the wings meet the crown.
  for (let i = 1; i < outline.length - 1; i++) {
    const [a, b, c] = [outline[i - 1], outline[i], outline[i + 1]];
    if (!a || !b || !c) continue;
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    assert.ok(turn < 1e-12, `the edge turns outward at ${i}`);
  }
  // Each wing ends at least 3 mm inside the crown wall, fully tapered.
  const end = outline[0];
  assert.ok(end);
  const inside = 1 - Math.hypot(end.x / halfWidth, end.y / halfDepth);
  assert.ok(inside * halfWidth >= 3 * MM);
  near(visorTaperAt(0), 0, 1e-9);
  near(visorTaperAt(0.2), 1, 1e-9);
});
const reliefAt = (theta: number, t: number) =>
  panelRelief(theta, t, crownPoint(theta, t, new Vector3()));

test('seams sink into valleys between puffed panels', () => {
  const t = tAtHeight(0, 0.5);
  for (const seam of seamAngles.slice(1)) assert.ok(reliefAt(seam, t) < 0);
  assert.ok(reliefAt(panelCenter(1), t) > 0.008);
  assert.equal(reliefAt(1.234, t), reliefAt(1.234, t));
  // Panels differ in fullness, as sewn caps do.
  const left = reliefAt(panelCenter(1), tAtHeight(panelCenter(1), 0.5));
  const right = reliefAt(panelCenter(4), tAtHeight(panelCenter(4), 0.5));
  assert.ok(Math.abs(left - right) > 0.1 * Math.max(left, right));
});

test('seam valleys run all the way in to the button', () => {
  for (const seam of seamAngles) {
    const lengths = meridianLengths(seam);
    const t = tAtLength(lengths, (lengths[lengths.length - 1] ?? 0) - 9 * MM);
    const beside = seam + (0.3 * topstitchOffset) / (9 * MM);
    assert.ok(reliefAt(seam, t) < reliefAt(beside, t) - 0.003);
  }
  // Every meridian meets at one apex point.
  const apex = reliefAt(0, 1);
  for (const theta of [1, 2, 3, 4, 5]) near(reliefAt(theta, 1), apex, 1e-9);
});

test('panels are pulled taut over the top', () => {
  for (const panel of [1, 2, 3, 4]) {
    const theta = panelCenter(panel);
    assert.ok(reliefAt(theta, tAtHeight(theta, 0.9)) < 0.006);
  }
});

test('eyelets sit on the panel centerlines 76 mm below the button', () => {
  assert.equal(eyelets.length, 6);
  eyelets.forEach(({theta, t, point}, panel) => {
    near(theta, panelCenter(panel), 1e-12);
    const lengths = meridianLengths(theta);
    near(
      (lengths[lengths.length - 1] ?? 0) - lengthAtT(lengths, t),
      76 * MM,
      0.2 * MM
    );
    const height = point.y / crownHeight;
    assert.ok(height > 0.75 && height < 0.85, `eyelet at ${height} H`);
  });
});
