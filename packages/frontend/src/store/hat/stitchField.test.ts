import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Box3, ShapePath, Vector3} from 'three';
import {stitchField} from './stitchField';

const box = new Box3(new Vector3(0, 0, 0), new Vector3(20, 20, 0));
const rectangle = (
  path: ShapePath,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  path.moveTo(x, y);
  path.lineTo(x + width, y);
  path.lineTo(x + width, y + height);
  path.lineTo(x, y + height);
  path.lineTo(x, y);
  return path;
};

test('embroidery keeps SVG holes and path order while generating deterministic stitch relief', async () => {
  const base = rectangle(new ShapePath(), 2, 2, 16, 16);
  rectangle(base, 7, 7, 6, 6);
  base.userData = {style: {fillRule: 'evenodd'}};
  const overlay = rectangle(new ShapePath(), 3, 3, 2, 3);
  const build = () =>
    stitchField([base, overlay], box, 200, 200, 0.1, {
      relief: 0.6,
      satinWidth: 3,
    });
  const field = await build();
  const at = (x: number, y: number) =>
    (199 - Math.floor(y * 10)) * 200 + Math.floor(x * 10);
  assert.equal(field.id[at(10, 10)], -1, 'the hole stays open');
  assert.equal(field.id[at(4, 4)], 1, 'the last SVG fill sits on top');
  assert.equal(field.id[at(15, 15)], 0);
  assert.ok((field.outline[at(10, 10)] ?? 0) < 0);
  assert.deepEqual(field, await build());
  const heights = field.surface.filter((_, i) => field.id[i] === 0);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.1);
});

test('thin strokes grow into sewable columns without filling nearby gaps', async () => {
  const path = rectangle(new ShapePath(), 8, 3, 0.4, 14);
  const field = await stitchField([path], box, 200, 200, 0.1, {
    relief: 0.35,
    satinWidth: 4,
  });
  const row = field.outline.slice(100 * 200, 101 * 200);
  const columns = [...row].filter(value => value > 0).length;
  assert.ok(columns >= 8 && columns <= 12, `stroke is ${columns / 10} mm wide`);
  assert.ok((row[60] ?? 0) < 0 && (row[100] ?? 0) < 0);
});

test('oversized embroidery fails before allocating fields with colliding sort keys', async () => {
  await assert.rejects(
    stitchField([], box, 1024, 1025, 0.1, {relief: 0.6, satinWidth: 3}),
    /supported texture size/
  );
});
