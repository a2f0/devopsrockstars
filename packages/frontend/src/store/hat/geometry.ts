import {BufferAttribute, BufferGeometry} from 'three';

/**
 * An indexed grid of `columns` by `rows` vertices. Rows run in order, so
 * with columns along +u and rows along +v the faces point along u x v.
 */
export function gridGeometry(
  columns: number,
  rows: number,
  positions: number[],
  uvs: number[],
  normals?: number[]
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  const index: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < columns - 1; i++) {
      const a = j * columns + i;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  geometry.setIndex(index);
  if (normals) {
    geometry.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(normals), 3)
    );
  } else {
    geometry.computeVertexNormals();
  }
  return geometry;
}
