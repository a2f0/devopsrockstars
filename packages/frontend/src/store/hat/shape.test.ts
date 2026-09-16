import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Vector3} from 'three';
import {
  crownHeight,
  crownPoint,
  halfDepth,
  halfWidth,
  heightFraction,
  panelCenter,
  panelRelief,
  radiusFraction,
  seamAngles,
  tAtHeight,
  visorOutline,
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

test('seams sink into valleys between puffed panels', () => {
  const t = tAtHeight(0, 0.5);
  const at = (theta: number) =>
    panelRelief(theta, t, crownPoint(theta, t, new Vector3()));
  for (const seam of seamAngles.slice(1)) assert.ok(at(seam) < 0);
  assert.ok(at(panelCenter(1)) > 0.008);
  assert.equal(at(1.234), at(1.234));
});
