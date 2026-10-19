import {expect, test} from 'bun:test';
import {layers, ratio, rows} from './checkoutAscii';

test('checkout ASCII art is a full grid with a layer for every cell', () => {
  const columns = rows[0]?.length ?? 0;
  expect(columns).toBeGreaterThan(0);
  expect(layers).toHaveLength(rows.length);
  rows.forEach((row, r) => {
    expect(row).toHaveLength(columns);
    expect(layers[r]).toHaveLength(columns);
    expect(row).toMatch(/^[\x20-\x7e]+$/);
    expect(layers[r]).toMatch(/^[fs ]+$/);
  });
  expect(ratio).toBeGreaterThan(0);
  expect(ratio).toBeLessThan(1);
});

test('checkout ASCII art draws the letter faces and their extrusion', () => {
  const cells = layers.join('');
  expect(cells).toContain('f');
  expect(cells).toContain('s');
});
