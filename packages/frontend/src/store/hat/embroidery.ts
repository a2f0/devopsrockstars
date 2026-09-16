import {
  Box3,
  type BufferGeometry,
  Color,
  Mesh,
  ShapeGeometry,
  type ShapePath,
  Vector3,
} from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {clothMaterial, withOcclusion} from './materials';
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
import {
  detailTexture,
  distanceTransform,
  greyPixels,
  normalPixels,
  type SurfaceMaps,
} from './textures';

export interface Stitching {
  // Width of the rounded satin shoulder, in millimetres.
  shoulder: number;
  // Height of the stitched relief, in millimetres.
  relief: number;
}

export interface Placement {
  name: string;
  theta: number;
  // Height of the mark's center above the crown base, in model units.
  height: number;
  width: number;
  stitching: Stitching;
  centerOnPath?: string;
}

/**
 * Marks the texels whose centers a path covers, honoring its fill rule, with
 * a scanline fill. Raster row 0 is the bottom of the artwork (v = 0).
 */
function fillPath(
  path: ShapePath,
  index: number,
  id: Int16Array,
  width: number,
  rows: number,
  box: Box3
) {
  const scaleX = width / (box.max.x - box.min.x);
  const scaleY = rows / (box.max.y - box.min.y);
  // Edges bucketed by the first scanline they cross: [x0, y0, x1, y1].
  const buckets: number[][][] = Array.from({length: rows}, () => []);
  for (const subPath of path.subPaths) {
    const points = subPath.getPoints();
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length] ?? point;
      const x0 = (point.x - box.min.x) * scaleX;
      const y0 = (point.y - box.min.y) * scaleY;
      const x1 = (next.x - box.min.x) * scaleX;
      const y1 = (next.y - box.min.y) * scaleY;
      if (y0 === y1) return;
      const first = Math.max(0, Math.ceil(Math.min(y0, y1) - 0.5));
      if (first < rows) buckets[first]?.push([x0, y0, x1, y1]);
    });
  }
  const style = path.userData?.['style'] as {fillRule?: string} | undefined;
  const evenOdd = style?.fillRule === 'evenodd';
  let active: number[][] = [];
  for (let row = 0; row < rows; row++) {
    const y = row + 0.5;
    active = active
      .concat(buckets[row] ?? [])
      .filter(([, y0 = 0, , y1 = 0]) => Math.max(y0, y1) > y);
    const crossings = active
      .filter(([, y0 = 0, , y1 = 0]) => Math.min(y0, y1) <= y)
      .map(([x0 = 0, y0 = 0, x1 = 0, y1 = 0]) => ({
        x: x0 + ((y - y0) * (x1 - x0)) / (y1 - y0),
        winding: y1 > y0 ? 1 : -1,
      }))
      .sort((a, b) => a.x - b.x);
    let winding = 0;
    const target = (rows - 1 - row) * width;
    crossings.forEach((crossing, i) => {
      winding += evenOdd ? 1 : crossing.winding;
      const inside = evenOdd ? winding % 2 === 1 : winding !== 0;
      const next = crossings[i + 1];
      if (!inside || !next) return;
      const from = Math.max(0, Math.ceil(crossing.x - 0.5));
      const to = Math.min(width - 1, Math.ceil(next.x - 0.5) - 1);
      for (let x = from; x <= to; x++) id[target + x] = index;
    });
  }
}

/**
 * Raster "stitch maps" for SVG embroidery: a satin pillow and thread ribs as
 * a normal map, plus a cavity map that shades the rolled-off edges.
 */
function stitchMaps(
  paths: ShapePath[],
  box: Box3,
  texel: number,
  mm: number,
  {shoulder, relief}: Stitching,
  anisotropy: number
): Omit<SurfaceMaps, 'roughnessMap'> {
  const width = Math.ceil((box.max.x - box.min.x) / texel);
  const rows = Math.ceil((box.max.y - box.min.y) / texel);
  // The topmost path covering each texel, in the order the paths are sewn.
  const id = new Int16Array(width * rows).fill(-1);
  paths.forEach((path, index) => {
    fillPath(path, index, id, width, rows, box);
  });
  // Stitches end wherever the thread color region changes.
  const seeds = new Uint8Array(width * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const own = id[i];
      if (own === undefined || own < 0) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === rows - 1 ||
        id[i - 1] !== own ||
        id[i + 1] !== own ||
        id[i - width] !== own ||
        id[i + width] !== own
      ) {
        seeds[i] = 1;
      }
    }
  }
  const {distance} = distanceTransform(seeds, width, rows);
  const radius = (shoulder * mm) / texel;
  const pitch = (0.4 * mm) / texel;
  const height = new Float32Array(width * rows);
  const cavity = new Float32Array(width * rows).fill(1);
  // Satin stitches cross the column: follow the distance gradient, blurred in
  // doubled-angle space so opposite gradients reinforce instead of cancel.
  const cos2 = new Float32Array(width * rows);
  const sin2 = new Float32Array(width * rows);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if ((id[i] ?? -1) < 0) continue;
      const angle = Math.atan2(
        (distance[i + width] ?? 0) - (distance[i - width] ?? 0),
        (distance[i + 1] ?? 0) - (distance[i - 1] ?? 0)
      );
      cos2[i] = Math.cos(2 * angle);
      sin2[i] = Math.sin(2 * angle);
    }
  }
  const blur = (source: Float32Array) => {
    const pass = new Float32Array(width * rows);
    const out = new Float32Array(width * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) {
          sum +=
            source[y * width + Math.min(width - 1, Math.max(0, x + k))] ?? 0;
        }
        pass[y * width + x] = sum;
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) {
          sum += pass[Math.min(rows - 1, Math.max(0, y + k)) * width + x] ?? 0;
        }
        out[y * width + x] = sum;
      }
    }
    return out;
  };
  const blurredCos = blur(cos2);
  const blurredSin = blur(sin2);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if ((id[i] ?? -1) < 0) continue;
      const d = distance[i] ?? 0;
      const satin = Math.atan2(blurredSin[i] ?? 0, blurredCos[i] ?? 0) / 2;
      // Wide areas become a flatter fill stitch at 45 degrees.
      const t = Math.min(1, Math.max(0, (d - 2 * radius) / (2 * radius)));
      const fill = t * t * (3 - 2 * t);
      const c = (1 - fill) * Math.cos(2 * satin) + fill * Math.cos(Math.PI / 2);
      const s = (1 - fill) * Math.sin(2 * satin) + fill * Math.sin(Math.PI / 2);
      const angle = Math.atan2(s, c) / 2;
      const across = -Math.sin(angle) * x + Math.cos(angle) * y;
      const ridge = 0.5 + 0.5 * Math.cos((2 * Math.PI * across) / pitch);
      const pillow = Math.sin((Math.min(1, d / radius) * Math.PI) / 2) ** 0.8;
      // Long-period fill patterns alias into moire, so fills stay smooth.
      height[i] = pillow * (0.86 + 0.14 * ridge * (1 - 0.7 * fill));
      // Thread crests stay below full albedo so lit satin keeps its shading.
      cavity[i] = 0.42 + 0.42 * pillow - 0.08 * (1 - ridge) * (1 - 0.5 * fill);
    }
  }
  // Height 1 is `relief` millimetres; gradients span two texels.
  const slope = (relief * mm) / (2 * texel);
  const options = {anisotropy};
  return {
    normalMap: detailTexture(
      normalPixels(height, width, rows, slope, false),
      width,
      rows,
      options
    ),
    map: detailTexture(greyPixels(cavity), width, rows, options),
  };
}

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

// Double-sided shading flips normals on back faces, so triangle winding must
// agree with the explicit surface normals.
function faceAlongNormals(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  const [a, b, c, n] = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ];
  let agreement = 0;
  for (let i = 0; i + 2 < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1).sub(a);
    c.fromBufferAttribute(positions, i + 2).sub(a);
    agreement += b.cross(c).dot(n.fromBufferAttribute(normals, i));
  }
  if (agreement >= 0) return;
  for (let i = 0; i + 2 < positions.count; i += 3) {
    for (const attribute of [positions, normals, uvs]) {
      for (let k = 0; k < attribute.itemSize; k++) {
        const first = attribute.getComponent(i + 1, k);
        attribute.setComponent(i + 1, k, attribute.getComponent(i + 2, k));
        attribute.setComponent(i + 2, k, first);
      }
    }
  }
}

/**
 * Embroidery sewn onto the relieved crown. Marks keep their SVG silhouettes
 * and fill colors; stitch maps give them thread relief and sheen.
 */
export function createEmbroidery(
  source: string,
  placement: Placement,
  anisotropy: number
) {
  const data = new SVGLoader().parse(source);
  const geometries: BufferGeometry[] = data.paths.map(
    path => new ShapeGeometry(SVGLoader.createShapes(path))
  );
  const dispose = () => {
    for (const geometry of geometries) geometry.dispose();
  };
  const bounds = new Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
  }
  const center = bounds.getCenter(new Vector3());
  if (placement.centerOnPath) {
    const anchor =
      geometries[
        data.paths.findIndex(path => {
          const node = path.userData?.['node'];
          return node instanceof Element && node.id === placement.centerOnPath;
        })
      ]?.boundingBox;
    if (!anchor || anchor.isEmpty()) {
      dispose();
      throw new Error('The hat artwork is missing its alignment anchor.');
    }
    // Keep the complete mark together, with the anchor centered on the seam.
    center.x = anchor.getCenter(new Vector3()).x;
  }
  const size = bounds.getSize(new Vector3());
  const scale = placement.width / size.x;
  const halfHeight = (size.y * scale) / 2;
  if (
    !Number.isFinite(scale) ||
    placement.height - halfHeight < 0 ||
    placement.height + halfHeight >= crownHeight * 0.9
  ) {
    dispose();
    throw new Error('The hat artwork does not fit on the crown.');
  }

  const margin = size.x * 0.01;
  const box = bounds.clone().expandByVector(new Vector3(margin, margin, 0));
  const mm = MM / scale;
  const texel = Math.max(mm * 0.12, (box.max.x - box.min.x) / 1400);
  const maps = stitchMaps(
    data.paths,
    box,
    texel,
    mm,
    placement.stitching,
    anisotropy
  );

  // Rows follow the meridian through the mark's center; columns follow the
  // crown's rings, so the mark wraps without stretching.
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
  const point = new Vector3();
  const normal = new Vector3();
  const tessellate = new TessellateModifier(size.x / 16, 6);
  return geometries.map((original, index) => {
    const geometry = tessellate.modify(original);
    original.dispose();
    const positions = geometry.getAttribute('position');
    const uvs = geometry.getAttribute('uv');
    const normals = geometry.getAttribute('normal');
    // Later paths stack on earlier ones, as the machine sews them.
    const lift = 0.0035 + index * 0.0007;
    // Tessellated triangles repeat most vertices, so wrap each one once.
    const wrapped = new Map<string, number[]>();
    for (let i = 0; i < positions.count; i++) {
      const sx = positions.getX(i);
      const sy = positions.getY(i);
      uvs.setXY(
        i,
        (sx - box.min.x) / (box.max.x - box.min.x),
        1 - (sy - box.min.y) / (box.max.y - box.min.y)
      );
      const key = `${sx},${sy}`;
      let vertex = wrapped.get(key);
      if (!vertex) {
        const x = (sx - center.x) * scale;
        const y = -(sy - center.y) * scale;
        const t = tAtLength(lengths, centerLength + y);
        let angle = theta + x / ringSpeed(theta, t);
        for (let k = 0; k < 2; k++) {
          angle += (x - ringLength(angle, t)) / ringSpeed(angle, t);
        }
        surfacePoint(angle, t, lift, {seams: false}, point);
        surfaceNormal(angle, t, {seams: false}, normal);
        vertex = [point.x, point.y, point.z, normal.x, normal.y, normal.z];
        wrapped.set(key, vertex);
      }
      const [px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 1] = vertex;
      positions.setXYZ(i, px, py, pz);
      normals.setXYZ(i, nx, ny, nz);
    }
    faceAlongNormals(geometry);
    geometry.computeBoundingSphere();
    withOcclusion(geometry);
    const color = data.paths[index]?.color ?? new Color('#f4f4f4');
    const mesh = new Mesh(
      geometry,
      clothMaterial({
        // Thread color comes straight from the SVG fill.
        color,
        maps: {...maps, roughnessMap: maps.map},
        roughness: 0.75,
        normalScale: 1,
        sheenColor: color.clone().multiplyScalar(0.5),
        sheenRoughness: 0.45,
        specularIntensity: 0.3,
      })
    );
    mesh.name = placement.name;
    return mesh;
  });
}
