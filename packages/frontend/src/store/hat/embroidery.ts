import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Material,
  Mesh,
  type Object3D,
  Vector2,
  Vector3,
} from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {clothMaterial} from './materials';
import type {HatResources} from './resources';
import {
  crownHeight,
  lengthAtT,
  MM,
  meridianLengths,
  ringSpeed,
  surfaceNormal,
  surfacePoint,
  tAtHeight,
  tAtLength,
} from './shape';
import {type StitchField, type StitchStyle, stitchField} from './stitchField';
import {detailTexture, greyPixels, normalPixels} from './textures';

export interface Placement {
  name: string;
  theta: number;
  // Height of the mark's center above the crown base, in model units.
  height: number;
  width: number;
  stitching: StitchStyle;
  centerOnPath?: string;
}

// Millimetres per stitch-map texel, thread-mesh cell and surface sample.
const texel = 0.12;
const threadCell = 0.48;
const shadowCell = 0.6;
const surfaceCell = 2;
// Fabric darkened around each mark, where dense stitching pulls it down.
const shadowWidth = 1.5;
const shadowStrength = 0.55;
// Thread edges sit just above the fabric; later paths stack on earlier ones.
const threadLift = 0.1;
const stackLift = 0.08;
// Share of the stitch relief built as geometry; the normal map adds the rest.
const geometricRelief = 0.75;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return k * k * (3 - 2 * k);
};

/** The front mark only, without the preview's backdrop artwork. */
export function frontLogo(source: string) {
  // Reuse the original vector paths, including their Illustrator transforms.
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  const logo = document.getElementById('Logo');
  if (!logo || document.querySelector('parsererror')) {
    throw new Error('The hat SVG is missing its logo.');
  }
  const svg = document.documentElement.cloneNode(false);
  svg.appendChild(logo.cloneNode(true));
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Maps texel coordinates of the mark onto the crown. Rows follow the
 * meridian through the mark's center and columns the crown's rings, so the
 * mark wraps without stretching; the surface is sampled on a coarse lattice
 * and interpolated.
 */
function crownWrap(
  placement: Placement,
  field: StitchField,
  toModel: (x: number, y: number) => Vector2
) {
  const {theta} = placement;
  const lengths = meridianLengths(theta);
  const centerLength = lengthAtT(
    lengths,
    tAtHeight(theta, placement.height / crownHeight)
  );
  const ringLength = (to: number, t: number) => {
    // Simpson's rule over the ring from the mark's center.
    const steps = 6;
    const h = (to - theta) / steps;
    let sum = ringSpeed(theta, t) + ringSpeed(to, t);
    for (let k = 1; k < steps; k++) {
      sum += ringSpeed(theta + k * h, t) * (k % 2 ? 4 : 2);
    }
    return (sum * h) / 3;
  };
  const step = Math.max(1, Math.round(surfaceCell / texel));
  const columns = Math.ceil(field.width / step) + 1;
  const rows = Math.ceil(field.rows / step) + 1;
  const points = new Float64Array(columns * rows * 3);
  const normals = new Float64Array(columns * rows * 3);
  const point = new Vector3();
  const normal = new Vector3();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const {x, y} = toModel(i * step, j * step);
      const t = tAtLength(lengths, centerLength + y);
      let angle = theta + x / ringSpeed(theta, t);
      for (let k = 0; k < 2; k++) {
        angle += (x - ringLength(angle, t)) / ringSpeed(angle, t);
      }
      // Embroidery bridges the seam valleys.
      surfacePoint(angle, t, 0, {seams: false}, point);
      surfaceNormal(angle, t, {seams: false}, normal);
      const k = (j * columns + i) * 3;
      point.toArray(points, k);
      normal.toArray(normals, k);
    }
  }
  const bottom = centerLength + toModel(0, 0).y;
  const top = centerLength + toModel(0, field.rows).y;
  const fits = bottom > 0 && top < (lengths[lengths.length - 1] ?? 0) * 0.85;
  /** The crown point and normal at texel coordinates (x, y). */
  const sample = (x: number, y: number, target: Vector3, up: Vector3) => {
    const fx = Math.min(Math.max(x / step, 0), columns - 1.0001);
    const fy = Math.min(Math.max(y / step, 0), rows - 1.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const corners = [
      [j * columns + i, (1 - u) * (1 - v)],
      [j * columns + i + 1, u * (1 - v)],
      [(j + 1) * columns + i, (1 - u) * v],
      [(j + 1) * columns + i + 1, u * v],
    ] as const;
    target.set(0, 0, 0);
    up.set(0, 0, 0);
    for (const [index, weight] of corners) {
      target.x += (points[index * 3] ?? 0) * weight;
      target.y += (points[index * 3 + 1] ?? 0) * weight;
      target.z += (points[index * 3 + 2] ?? 0) * weight;
      up.x += (normals[index * 3] ?? 0) * weight;
      up.y += (normals[index * 3 + 1] ?? 0) * weight;
      up.z += (normals[index * 3 + 2] ?? 0) * weight;
    }
    up.normalize();
  };
  return {fits, sample};
}

interface MeshBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function buffersGeometry(
  resources: HatResources,
  {positions, normals, uvs, colors, indices}: MeshBuffers
) {
  const geometry = resources.own(new BufferGeometry());
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array(normals), 3)
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute(
    'color',
    new BufferAttribute(new Float32Array(colors), 3)
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Triangulates the region where `value` is positive on a grid of texel
 * centers `cell` texels apart (marching squares). `vertex` returns the index
 * of a new vertex at texel coordinates, or -1 to leave the cell out.
 */
function contourMesh(
  width: number,
  rows: number,
  cell: number,
  value: (i: number) => number,
  vertex: (x: number, y: number) => number,
  indices: number[]
) {
  const columns = Math.floor((width - 1) / cell) + 1;
  const lines = Math.floor((rows - 1) / cell) + 1;
  // Vertex index + 2 per grid node and edge crossing; 0 is not made yet.
  const made = new Int32Array(columns * lines * 3);
  const node = (i: number, j: number) => j * cell * width + i * cell;
  const corner = (i: number, j: number) => {
    const key = (j * columns + i) * 3;
    let index = (made[key] ?? 0) - 2;
    if (index === -2) {
      index = vertex(i * cell + 0.5, j * cell + 0.5);
      made[key] = index + 2;
    }
    return index;
  };
  const crossing = (i: number, j: number, horizontal: boolean) => {
    const key = (j * columns + i) * 3 + (horizontal ? 1 : 2);
    let index = (made[key] ?? 0) - 2;
    if (index === -2) {
      const a = value(node(i, j));
      const b = value(horizontal ? node(i + 1, j) : node(i, j + 1));
      const f = a / (a - b);
      index = horizontal
        ? vertex((i + f) * cell + 0.5, j * cell + 0.5)
        : vertex(i * cell + 0.5, (j + f) * cell + 0.5);
      made[key] = index + 2;
    }
    return index;
  };
  const polygon: number[] = [];
  for (let j = 0; j < lines - 1; j++) {
    for (let i = 0; i < columns - 1; i++) {
      // Corners counter-clockwise, so faces point out of the crown.
      const corners = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ] as const;
      const values = corners.map(([ci, cj]) => value(node(ci, cj)));
      if (values.every(v => v <= 0)) continue;
      polygon.length = 0;
      for (let k = 0; k < 4; k++) {
        const [ci, cj] = corners[k] ?? [0, 0];
        const [ni, nj] = corners[(k + 1) % 4] ?? [0, 0];
        const here = values[k] ?? 0;
        const next = values[(k + 1) % 4] ?? 0;
        if (here > 0) polygon.push(corner(ci, cj));
        if (here > 0 !== next > 0) {
          const horizontal = cj === nj;
          polygon.push(
            crossing(Math.min(ci, ni), Math.min(cj, nj), horizontal)
          );
        }
      }
      if (polygon.includes(-1)) continue;
      const first = polygon[0] ?? 0;
      for (let k = 1; k + 1 < polygon.length; k++) {
        indices.push(first, polygon[k] ?? 0, polygon[k + 1] ?? 0);
      }
    }
  }
}

/**
 * The fabric under a mark: the triangles of the given meshes near it, in a
 * uniform grid, so points can be dropped onto the surface actually rendered.
 */
function fabricIndex(meshes: Mesh[], bounds: Box3) {
  const size = 0.03;
  const counts = bounds
    .getSize(new Vector3())
    .divideScalar(size)
    .ceil()
    .max(new Vector3(1, 1, 1));
  const cells: number[][] = Array.from(
    {length: counts.x * counts.y * counts.z},
    () => []
  );
  const cellOf = (value: number, min: number, count: number) =>
    Math.min(count - 1, Math.max(0, Math.floor((value - min) / size)));
  const corner = new Vector3();
  meshes.forEach((mesh, m) => {
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    if (!geometry.boundingBox?.intersectsBox(bounds)) return;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const faces = (index ? index.count : position.count) / 3;
    for (let f = 0; f < faces; f++) {
      let lowX = Infinity;
      let lowY = Infinity;
      let lowZ = Infinity;
      let highX = -Infinity;
      let highY = -Infinity;
      let highZ = -Infinity;
      for (let k = 0; k < 3; k++) {
        const v = index ? index.getX(f * 3 + k) : f * 3 + k;
        const px = position.getX(v);
        const py = position.getY(v);
        const pz = position.getZ(v);
        lowX = Math.min(lowX, px);
        lowY = Math.min(lowY, py);
        lowZ = Math.min(lowZ, pz);
        highX = Math.max(highX, px);
        highY = Math.max(highY, py);
        highZ = Math.max(highZ, pz);
      }
      if (
        highX < bounds.min.x ||
        highY < bounds.min.y ||
        highZ < bounds.min.z ||
        lowX > bounds.max.x ||
        lowY > bounds.max.y ||
        lowZ > bounds.max.z
      ) {
        continue;
      }
      const x0 = cellOf(lowX, bounds.min.x, counts.x);
      const x1 = cellOf(highX, bounds.min.x, counts.x);
      const y0 = cellOf(lowY, bounds.min.y, counts.y);
      const y1 = cellOf(highY, bounds.min.y, counts.y);
      const z0 = cellOf(lowZ, bounds.min.z, counts.z);
      const z1 = cellOf(highZ, bounds.min.z, counts.z);
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            cells[(z * counts.y + y) * counts.x + x]?.push(m, f);
          }
        }
      }
    }
  });
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const edge1 = new Vector3();
  const edge2 = new Vector3();
  const p = new Vector3();
  const q = new Vector3();
  const s = new Vector3();
  const vertexOf = (m: number, f: number, k: number) => {
    const index = meshes[m]?.geometry.getIndex();
    return index ? index.getX(f * 3 + k) : f * 3 + k;
  };
  /**
   * Every triangle hit by the segment from `origin` along `direction` for
   * `reach` units, as [mesh, face, distance, weight b, weight c].
   */
  const hits = (origin: Vector3, direction: Vector3, reach: number) => {
    const found: number[][] = [];
    const end = corner.copy(direction).multiplyScalar(reach).add(origin);
    const seen = new Set<number>();
    for (
      let z = cellOf(Math.min(origin.z, end.z), bounds.min.z, counts.z);
      z <= cellOf(Math.max(origin.z, end.z), bounds.min.z, counts.z);
      z++
    ) {
      for (
        let y = cellOf(Math.min(origin.y, end.y), bounds.min.y, counts.y);
        y <= cellOf(Math.max(origin.y, end.y), bounds.min.y, counts.y);
        y++
      ) {
        for (
          let x = cellOf(Math.min(origin.x, end.x), bounds.min.x, counts.x);
          x <= cellOf(Math.max(origin.x, end.x), bounds.min.x, counts.x);
          x++
        ) {
          const list = cells[(z * counts.y + y) * counts.x + x] ?? [];
          for (let k = 0; k + 1 < list.length; k += 2) {
            const m = list[k] ?? 0;
            const f = list[k + 1] ?? 0;
            const key = m * 4194304 + f;
            if (seen.has(key)) continue;
            seen.add(key);
            const position = meshes[m]?.geometry.getAttribute('position');
            if (!position) continue;
            a.fromBufferAttribute(position, vertexOf(m, f, 0));
            b.fromBufferAttribute(position, vertexOf(m, f, 1));
            c.fromBufferAttribute(position, vertexOf(m, f, 2));
            // Moller-Trumbore, from either side.
            edge1.subVectors(b, a);
            edge2.subVectors(c, a);
            p.crossVectors(direction, edge2);
            const det = edge1.dot(p);
            if (Math.abs(det) < 1e-12) continue;
            s.subVectors(origin, a);
            const u = s.dot(p) / det;
            if (u < 0 || u > 1) continue;
            q.crossVectors(s, edge1);
            const v = direction.dot(q) / det;
            if (v < 0 || u + v > 1) continue;
            const distance = edge2.dot(q) / det;
            if (distance < 0 || distance > reach) continue;
            found.push([m, f, distance, u, v]);
          }
        }
      }
    }
    return found;
  };
  return {hits, vertexOf};
}

/**
 * A contact shadow: the fabric around the mark, re-laid on the very
 * triangles it covers (same material, UVs and baked occlusion) and darkened
 * toward the stitching, so it blends into the crown with no seam.
 */
function contactShadow(
  resources: HatResources,
  field: StitchField,
  sample: (x: number, y: number, target: Vector3, up: Vector3) => void,
  fabric: readonly Object3D[]
) {
  const meshes = fabric.filter(
    (object): object is Mesh =>
      object instanceof Mesh && !Array.isArray(object.material)
  );
  const cell = Math.max(1, Math.round(shadowCell / texel));
  const reach = shadowWidth / texel;
  const inner = 0.4 / texel;
  const point = new Vector3();
  const up = new Vector3();
  const bounds = new Box3();
  const nodes = new Map<number, number>();
  const {width, rows, outline} = field;
  const inBand = (i: number) => {
    const value = outline[i] ?? 0;
    return value > -reach - cell && value < inner + cell;
  };
  for (let y = 0; y < rows; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (!inBand(y * width + x)) continue;
      sample(x + 0.5, y + 0.5, point, up);
      bounds.expandByPoint(point);
    }
  }
  if (bounds.isEmpty() || !meshes.length) return undefined;
  const index = fabricIndex(meshes, bounds.expandByScalar(0.02));

  interface Hit {
    mesh: number;
    face: number;
    b: number;
    c: number;
    ring: number;
  }
  // The outermost surface hit at each node, per material.
  const hitsByMaterial = new Map<Material, Map<number, Hit>>();
  const firstHits = new Map<Material, number>();
  const origin = new Vector3();
  const down = new Vector3();
  const band = (i: number) => {
    const value = outline[i] ?? 0;
    return value > -reach && value < inner;
  };
  const nodeKey = (x: number, y: number) => y * width + x;
  for (let y = 0; y < rows; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const i = nodeKey(x, y);
      // Nodes of any cell that touches the band.
      let touches = false;
      for (const [dx, dy] of [
        [0, 0],
        [-cell, 0],
        [0, -cell],
        [-cell, -cell],
        [cell, 0],
        [0, cell],
        [cell, cell],
        [-cell, cell],
        [cell, -cell],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
        if (band(nodeKey(nx, ny))) touches = true;
      }
      if (!touches) continue;
      nodes.set(i, -1);
      sample(x + 0.5, y + 0.5, point, up);
      origin.copy(point).addScaledVector(up, 0.012);
      down.copy(up).negate();
      let nearest: Material | undefined;
      let nearestDistance = Infinity;
      for (const [mesh, face, distance = 0, b = 0, c = 0] of index.hits(
        origin,
        down,
        0.03
      )) {
        const material = meshes[mesh ?? 0]?.material as Material;
        let hits = hitsByMaterial.get(material);
        if (!hits) {
          hits = new Map();
          hitsByMaterial.set(material, hits);
        }
        const previous = hits.get(i);
        if (!previous || distance < previous.ring) {
          hits.set(i, {mesh: mesh ?? 0, face: face ?? 0, b, c, ring: distance});
        }
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = material;
        }
      }
      if (nearest) firstHits.set(nearest, (firstHits.get(nearest) ?? 0) + 1);
    }
  }
  let material: Material | undefined;
  let most = 0;
  for (const [candidate, hitCount] of firstHits) {
    if (hitCount > most) {
      most = hitCount;
      material = candidate;
    }
  }
  const chosen = material && hitsByMaterial.get(material);
  if (!material || !chosen) return undefined;

  const buffers: MeshBuffers = {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    indices: [],
  };
  const corners = [new Vector3(), new Vector3(), new Vector3()];
  const cornerNormals = [new Vector3(), new Vector3(), new Vector3()];
  const uv = new Vector2();
  const vertex = (x: number, y: number) => {
    const i = nodeKey(x, y);
    const hit = chosen.get(i);
    if (!hit) return -1;
    const mesh = meshes[hit.mesh];
    if (!mesh) return -1;
    const geometry = mesh.geometry;
    const weights = [1 - hit.b - hit.c, hit.b, hit.c];
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');
    const colors = geometry.getAttribute('color');
    point.set(0, 0, 0);
    up.set(0, 0, 0);
    uv.set(0, 0);
    let occlusion = 0;
    for (let k = 0; k < 3; k++) {
      const v = index.vertexOf(hit.mesh, hit.face, k);
      const weight = weights[k] ?? 0;
      corners[k]?.fromBufferAttribute(position, v);
      point.addScaledVector(corners[k] ?? point, weight);
      if (normal) {
        cornerNormals[k]?.fromBufferAttribute(normal, v);
        up.addScaledVector(cornerNormals[k] ?? up, weight);
      }
      if (uvs) {
        uv.x += uvs.getX(v) * weight;
        uv.y += uvs.getY(v) * weight;
      }
      occlusion += (colors ? colors.getX(v) : 1) * weight;
    }
    up.normalize();
    point.addScaledVector(up, 0.0003);
    const outside = Math.max(0, -(outline[i] ?? 0));
    const shade =
      1 - shadowStrength * (1 - smoothstep(0, reach, outside)) ** 1.6;
    const next = buffers.positions.length / 3;
    buffers.positions.push(point.x, point.y, point.z);
    buffers.normals.push(up.x, up.y, up.z);
    buffers.uvs.push(uv.x, uv.y);
    const color = occlusion * shade;
    buffers.colors.push(color, color, color);
    return next;
  };
  const made = new Map<number, number>();
  const node = (x: number, y: number) => {
    const key = nodeKey(x, y);
    let vertexIndex = made.get(key);
    if (vertexIndex === undefined) {
      vertexIndex = vertex(x, y);
      made.set(key, vertexIndex);
    }
    return vertexIndex;
  };
  // Whole cells, counter-clockwise so faces point out of the crown.
  for (let y = 0; y + cell < rows; y += cell) {
    for (let x = 0; x + cell < width; x += cell) {
      const corners = [
        [x, y],
        [x + cell, y],
        [x + cell, y + cell],
        [x, y + cell],
      ] as const;
      if (!corners.some(([cx, cy]) => band(nodeKey(cx, cy)))) continue;
      const [a, b, c, d] = corners.map(([cx, cy]) => node(cx, cy));
      if (
        a === undefined ||
        b === undefined ||
        c === undefined ||
        d === undefined ||
        a < 0 ||
        b < 0 ||
        c < 0 ||
        d < 0
      ) {
        continue;
      }
      buffers.indices.push(a, b, c, a, c, d);
    }
  }
  if (!buffers.indices.length) return undefined;
  return new Mesh(buffersGeometry(resources, buffers), material);
}

/**
 * Embroidery sewn onto the relieved crown. Marks keep their SVG silhouettes
 * and fill colors; stitch maps and raised thread geometry give them satin and
 * fill stitching, and a contact shadow settles them into `fabric`, the meshes
 * they are sewn onto.
 */
export function createEmbroidery(
  resources: HatResources,
  source: string,
  placement: Placement,
  anisotropy: number,
  fabric: readonly Object3D[]
) {
  const data = new SVGLoader().parse(source);
  const outlineBox = (paths: typeof data.paths) => {
    const box = new Box3();
    const corner = new Vector3();
    for (const path of paths) {
      for (const subPath of path.subPaths) {
        for (const point of subPath.getPoints()) {
          box.expandByPoint(corner.set(point.x, point.y, 0));
        }
      }
    }
    return box;
  };
  const bounds = outlineBox(data.paths);
  const center = bounds.getCenter(new Vector3());
  if (placement.centerOnPath) {
    const anchor = outlineBox(
      data.paths.filter(path => {
        const node = path.userData?.['node'];
        return node instanceof Element && node.id === placement.centerOnPath;
      })
    );
    if (anchor.isEmpty()) {
      throw new Error('The hat artwork is missing its alignment anchor.');
    }
    // Keep the complete mark together, with the anchor centered on the seam.
    center.x = anchor.getCenter(new Vector3()).x;
  }
  const size = bounds.getSize(new Vector3());
  const scale = placement.width / size.x;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('The hat artwork does not fit on the crown.');
  }
  // SVG units per texel; the box leaves room for the contact shadow.
  const unit = (texel * MM) / scale;
  const margin = (shadowWidth + 1) * (MM / scale);
  const box = bounds.clone().expandByVector(new Vector3(margin, margin, 0));
  const width = Math.ceil((box.max.x - box.min.x) / unit);
  const rows = Math.ceil((box.max.y - box.min.y) / unit);
  box.max.x = box.min.x + width * unit;
  box.max.y = box.min.y + rows * unit;
  const field = stitchField(
    data.paths,
    box,
    width,
    rows,
    texel,
    placement.stitching
  );
  // Texel coordinates run up the artwork; SVG y runs down it.
  const toModel = (x: number, y: number) =>
    new Vector2(
      (box.min.x + x * unit - center.x) * scale,
      -(box.max.y - y * unit - center.y) * scale
    );
  const {fits, sample} = crownWrap(placement, field, toModel);
  if (!fits) {
    throw new Error('The hat artwork does not fit on the crown.');
  }

  // Threads of one color share a mesh. Each extends a little under the
  // paths sewn after it, which sit higher, so no fabric shows between them.
  const colors = new Map<string, number[]>();
  data.paths.forEach((path, index) => {
    const key = path.color.getHexString();
    colors.set(key, [...(colors.get(key) ?? []), index]);
  });
  const meshes: Mesh[] = [];
  const shadow = contactShadow(resources, field, sample, fabric);
  const maps = {
    map: detailTexture(resources, greyPixels(field.shade), width, rows, {
      anisotropy,
    }),
    normalMap: detailTexture(
      resources,
      normalPixels(field.surface, width, rows, 1 / (2 * texel), false),
      width,
      rows,
      {anisotropy}
    ),
    roughnessMap: detailTexture(
      resources,
      greyPixels(field.roughness),
      width,
      rows,
      {
        anisotropy,
      }
    ),
  };
  const point = new Vector3();
  const up = new Vector3();
  const cell = Math.max(1, Math.round(threadCell / texel));
  for (const members of colors.values()) {
    const group = new Uint8Array(width * rows);
    const lift = new Float32Array(width * rows);
    for (let i = 0; i < group.length; i++) {
      const own = field.id[i] ?? -1;
      if (members.includes(own)) {
        group[i] = 1;
        lift[i] =
          threadLift +
          own * stackLift +
          (field.relief[i] ?? 0) * geometricRelief;
      }
    }
    if (colors.size > 1) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const own = field.id[i] ?? -1;
          if (group[i] !== 1) continue;
          const right = field.id[i + 1] ?? -1;
          const above = field.id[i + width] ?? -1;
          const left = field.id[i - 1] ?? -1;
          const below = field.id[i - width] ?? -1;
          if (right <= own && above <= own && left <= own && below <= own) {
            continue;
          }
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
              const n = ny * width + nx;
              if (group[n] || (field.id[n] ?? -1) <= own) continue;
              group[n] = 2;
              lift[n] = threadLift + own * stackLift;
            }
          }
        }
      }
    }
    const buffers: MeshBuffers = {
      positions: [],
      normals: [],
      uvs: [],
      colors: [],
      indices: [],
    };
    const vertex = (x: number, y: number) => {
      sample(x, y, point, up);
      // Bilinear height between texel centers.
      const fx = Math.min(Math.max(x - 0.5, 0), width - 1.001);
      const fy = Math.min(Math.max(y - 0.5, 0), rows - 1.001);
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = fx - i;
      const v = fy - j;
      const at = (a: number, b: number) =>
        group[b * width + a] ? (lift[b * width + a] ?? 0) : threadLift;
      const height =
        (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) +
        (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
      point.addScaledVector(up, height * MM);
      const next = buffers.positions.length / 3;
      buffers.positions.push(point.x, point.y, point.z);
      buffers.normals.push(up.x, up.y, up.z);
      buffers.uvs.push(x / width, y / rows);
      buffers.colors.push(1, 1, 1);
      return next;
    };
    // Outer edges follow the mark's outline; edges against other colors
    // are hidden under them.
    contourMesh(
      width,
      rows,
      cell,
      i =>
        group[i] || (field.id[i] ?? -1) < 0 ? (field.outline[i] ?? 0) : -0.5,
      vertex,
      buffers.indices
    );
    const color = data.paths[members[0] ?? 0]?.color ?? new Color('#f4f4f4');
    const mesh = new Mesh(
      buffersGeometry(resources, buffers),
      clothMaterial(resources, {
        // Thread color comes straight from the SVG fill.
        color,
        maps,
        roughness: 1,
        normalScale: 1,
        sheenColor: color.clone().multiplyScalar(0.5),
        sheenRoughness: 0.45,
        specularIntensity: 0.35,
      })
    );
    mesh.name = placement.name;
    meshes.push(mesh);
  }
  if (shadow) {
    shadow.name = placement.name;
    meshes.push(shadow);
  }
  return meshes;
}
