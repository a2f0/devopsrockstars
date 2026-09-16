import type {Box3, ShapePath} from 'three';
import {BuildTask} from './buildTask';
import {distanceTransform} from './textures';

export interface StitchStyle {
  // Height of full-width stitching above the fabric, in millimetres.
  relief: number;
  // Columns up to this wide (mm) are satin; wider areas are fill stitch.
  satinWidth: number;
}

/** Per-texel embroidery over a mark's artwork box, row 0 at the bottom. */
export interface StitchField {
  width: number;
  rows: number;
  // The topmost path sewn at each texel, or -1 for bare fabric.
  id: Int16Array;
  // Texels from each texel center to the mark's outline, positive inside.
  outline: Float32Array;
  // Thread height in millimetres without (`relief`) and with the stitches.
  relief: Float32Array;
  surface: Float32Array;
  // Thread albedo and roughness in 0..1.
  shade: Float32Array;
  roughness: Float32Array;
}

// Satin threads lie 0.4 mm apart; fill rows 0.45 mm apart in 3.5 mm stitches.
const satinPitch = 0.4;
const fillPitch = 0.45;
const fillStitch = 3.5;
// Machines cannot sew narrower columns, so thinner artwork strokes grow.
const minimumStroke = 1.1;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return k * k * (3 - 2 * k);
};

/** A deterministic hash of two integers, in 0..1. */
function hash(a: number, b: number) {
  let h = Math.imul(a ^ 0x5bd1e995, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

/** Texels on the edge of their path's region: stitches end there. */
function edgeTexels(id: Int16Array, width: number, rows: number) {
  const edges = new Uint8Array(width * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const own = id[i] ?? -1;
      if (own < 0) continue;
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
        edges[i] = 1;
      }
    }
  }
  return edges;
}

/**
 * Half the width of the column each texel belongs to: the edge distance at
 * the ridge reached by climbing the distance field. Texels are visited from
 * the ridge down, so every uphill neighbour is already resolved.
 */
function halfWidths(
  distance: Float32Array,
  id: Int16Array,
  width: number,
  rows: number
) {
  const shift = 2 ** 20;
  const keys = new Float64Array(width * rows);
  let count = 0;
  for (let i = 0; i < width * rows; i++) {
    if ((id[i] ?? -1) >= 0) {
      keys[count++] = Math.round((distance[i] ?? 0) * 64) * shift + i;
    }
  }
  const order = keys.subarray(0, count).sort();
  const result = new Float32Array(width * rows);
  for (let k = count - 1; k >= 0; k--) {
    const key = order[k] ?? 0;
    const i = key % shift;
    const level = (key - i) / shift;
    const x = i % width;
    const y = (i - x) / width;
    const own = id[i];
    let best = -1;
    let bestLevel = level;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
        const n = ny * width + nx;
        if (id[n] !== own) continue;
        const neighbour = Math.round((distance[n] ?? 0) * 64);
        if (neighbour > bestLevel) {
          bestLevel = neighbour;
          best = n;
        }
      }
    }
    result[i] = best < 0 ? (distance[i] ?? 0) : (result[best] ?? 0);
  }
  return result;
}

/**
 * A box blur that stays within each path's region, run along rows and then
 * columns so it costs the same at any radius.
 */
function blurWithin(
  values: Float32Array,
  id: Int16Array,
  width: number,
  rows: number,
  radius: number
) {
  const pass = (source: Float32Array, horizontal: boolean) => {
    const result = new Float32Array(source.length);
    const lines = horizontal ? rows : width;
    const length = horizontal ? width : rows;
    const sums = new Float64Array(length + 1);
    const index = (line: number, k: number) =>
      horizontal ? line * width + k : k * width + line;
    for (let line = 0; line < lines; line++) {
      let k = 0;
      while (k < length) {
        const own = id[index(line, k)] ?? -1;
        let end = k;
        while (end < length && id[index(line, end)] === own) end++;
        if (own >= 0) {
          sums[k] = 0;
          for (let j = k; j < end; j++) {
            sums[j + 1] = (sums[j] ?? 0) + (source[index(line, j)] ?? 0);
          }
          for (let j = k; j < end; j++) {
            const from = Math.max(k, j - radius);
            const to = Math.min(end, j + radius + 1);
            result[index(line, j)] =
              ((sums[to] ?? 0) - (sums[from] ?? 0)) / (to - from);
          }
        }
        k = end;
      }
    }
    return result;
  };
  return pass(pass(values, true), false);
}

/** Distance from inside texel centers to their region's edge, in texels. */
async function edgeDistance(
  edges: Uint8Array,
  width: number,
  rows: number,
  task: BuildTask
) {
  const {distance, nearest} = await distanceTransform(edges, width, rows, task);
  for (let i = 0; i < distance.length; i++) {
    distance[i] = (distance[i] ?? 0) + 0.5;
  }
  return {distance, nearest};
}

/**
 * Arc length along each region's edge and the edge direction, so satin
 * threads keep an even pitch as a column curves.
 */
function edgeCoordinates(
  edges: Uint8Array,
  id: Int16Array,
  half: Float32Array,
  width: number,
  rows: number
) {
  const count = width * rows;
  const arc = new Float32Array(count).fill(-1);
  // Each outline is walked one way round from its narrowest point, usually a
  // tip where the thread pattern breaks anyway.
  const shift = 2 ** 20;
  const starts: number[] = [];
  for (let i = 0; i < count; i++) {
    if (edges[i]) starts.push(Math.round((half[i] ?? 0) * 64) * shift + i);
  }
  const order = Float64Array.from(starts).sort();
  const queue = new Int32Array(count);
  const blocked: number[] = [];
  const step = (p: number, q: number) =>
    p % width !== q % width && Math.abs(p - q) !== 1 ? Math.SQRT2 : 1;
  for (const key of order) {
    const start = key % shift;
    if (arc[start] !== -1) continue;
    arc[start] = 0;
    const sx = start % width;
    const sy = (start - sx) / width;
    blocked.length = 0;
    let open = true;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
        const q = ny * width + nx;
        if (!edges[q] || arc[q] !== -1 || id[q] !== id[start]) continue;
        if (open) {
          open = false;
        } else {
          arc[q] = -2;
          blocked.push(q);
        }
      }
    }
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const p = queue[head++] ?? 0;
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
          const q = ny * width + nx;
          if (!edges[q] || arc[q] !== -1 || id[q] !== id[p]) continue;
          arc[q] = (arc[p] ?? 0) + (dx && dy ? Math.SQRT2 : 1);
          queue[tail++] = q;
        }
      }
    }
    // The blocked neighbours close the loop at its far end.
    for (const q of blocked) {
      const x = q % width;
      const y = (q - x) / width;
      let best = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = (y + dy) * width + x + dx;
          if (n < 0 || n >= count || (arc[n] ?? -1) < 0) continue;
          best = Math.max(best, (arc[n] ?? 0) + step(n, q));
        }
      }
      arc[q] = best;
    }
  }
  const tangentX = new Float32Array(count);
  const tangentY = new Float32Array(count);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!edges[p]) continue;
      let sx = 0;
      let sy = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
          const q = ny * width + nx;
          if (!edges[q] || id[q] !== id[p]) continue;
          const step = (arc[q] ?? 0) - (arc[p] ?? 0);
          // Skip where the traversal from both directions meets.
          if (step === 0 || Math.abs(step) > 4) continue;
          sx += dx * Math.sign(step);
          sy += dy * Math.sign(step);
        }
      }
      const length = Math.hypot(sx, sy) || 1;
      tangentX[p] = sx / length;
      tangentY[p] = sy / length;
    }
  }
  return {arc, tangentX, tangentY};
}

/**
 * Rasterizes SVG paths as machine embroidery: satin columns whose threads
 * cross the column and roll over a rounded ridge, fill stitch in staggered
 * rows for wide areas, ragged thread ends along every edge and thin strokes
 * widened to a sewable width. `texel` is millimetres per texel.
 */
export async function stitchField(
  paths: ShapePath[],
  box: Box3,
  width: number,
  rows: number,
  texel: number,
  {relief, satinWidth}: StitchStyle,
  task = new BuildTask()
): Promise<StitchField> {
  const count = width * rows;
  // Sort keys reserve 20 bits for the texel index. Reject unsupported artwork
  // before allocating fields rather than allowing the keys to collide.
  if (
    !Number.isSafeInteger(count) ||
    width <= 0 ||
    rows <= 0 ||
    count > 2 ** 20
  ) {
    throw new Error('The hat embroidery exceeds the supported texture size.');
  }
  const drawn = new Int16Array(count).fill(-1);
  for (const [index, path] of paths.entries()) {
    await task.checkpoint();
    fillPath(path, index, drawn, width, rows, box);
  }
  const edges = edgeTexels(drawn, width, rows);
  const {distance, nearest} = await edgeDistance(edges, width, rows, task);
  const half = halfWidths(distance, drawn, width, rows);
  await task.checkpoint();
  const {arc, tangentX, tangentY} = edgeCoordinates(
    edges,
    drawn,
    half,
    width,
    rows
  );
  await task.checkpoint();
  // Column shape follows a smoothed width, so the relief has no steps where
  // columns meet.
  const columnHalf = blurWithin(
    half,
    drawn,
    width,
    rows,
    Math.round(1 / texel)
  );
  const sewn = new Uint8Array(count);
  for (let i = 0; i < count; i++) sewn[i] = (drawn[i] ?? -1) >= 0 ? 1 : 0;
  const bare = await distanceTransform(sewn, width, rows, task);

  const id = drawn.slice();
  const outline = new Float32Array(count);
  const surface = new Float32Array(count);
  const reliefHeight = new Float32Array(count);
  const shade = new Float32Array(count);
  const roughness = new Float32Array(count).fill(1);
  const minimumHalf = minimumStroke / 2 / texel;
  // Tapering points stay pointed: growth is limited by the column's width.
  const growth = (half: number) =>
    Math.max(0, Math.min(minimumHalf - half, 1.5 * half + 0.1 / texel));
  const narrowHalf = 2 / texel;
  const satinHalf = satinWidth / 2 / texel;
  const blend = 1 / texel;
  for (let y = 0; y < rows; y++) {
    if (y % 8 === 0) await task.checkpoint();
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let own = drawn[i] ?? -1;
      // Columns narrower than a machine can sew grow into the bare fabric.
      let d: number;
      let w: number;
      let e: number;
      if (own >= 0) {
        const grow = growth(half[i] ?? 0);
        d = (distance[i] ?? 0) + grow;
        w = (columnHalf[i] ?? 0) + grow;
        e = nearest[i] ?? 0;
      } else {
        const n = bare.nearest[i] ?? 0;
        const grow = growth(half[n] ?? 0);
        d = grow + 0.5 - (bare.distance[i] ?? 0);
        outline[i] = d;
        if (d <= 0) continue;
        own = drawn[n] ?? -1;
        id[i] = own;
        w = (columnHalf[n] ?? 0) + grow;
        e = edges[n] ? n : (nearest[n] ?? 0);
      }
      outline[i] = d;
      w = Math.max(w, 1);
      const fill = smoothstep(satinHalf, satinHalf + blend, w);
      // Edges against bare fabric roll down to it; edges against another
      // path stay raised where its stitches overlap them.
      const ex = e % width;
      const ey = (e - ex) / width;
      const open =
        (ex > 0 && (drawn[e - 1] ?? -1) < 0) ||
        (ex < width - 1 && (drawn[e + 1] ?? -1) < 0) ||
        (drawn[e - width] ?? -1) < 0 ||
        (drawn[e + width] ?? -1) < 0;

      let satinRidge = 0;
      let satinJitter = 0;
      if (fill < 1) {
        // Satin: threads cross the column, spaced along its edge. Narrow
        // columns take the spacing from one edge, so threads run unbroken
        // from edge to edge; wider ones split down the middle.
        let seed = e;
        if (w < narrowHalf) {
          const vx = x - ex;
          const vy = y - ey;
          const length = Math.hypot(vx, vy) || 1;
          const reach = 2 * w - d - 1;
          const qx = Math.round(x + (vx / length) * reach);
          const qy = Math.round(y + (vy / length) * reach);
          if (qx >= 0 && qy >= 0 && qx < width && qy < rows) {
            let q = qy * width + qx;
            if ((drawn[q] ?? -1) < 0) q = bare.nearest[q] ?? q;
            if (drawn[q] === own) {
              const across = edges[q] ? q : (nearest[q] ?? q);
              seed = Math.min(seed, across);
            }
          }
        }
        const sx = seed % width;
        const sy = (seed - sx) / width;
        const along =
          (arc[seed] ?? 0) +
          (x - sx) * (tangentX[seed] ?? 0) +
          (y - sy) * (tangentY[seed] ?? 0);
        const threadPosition = (along * texel) / satinPitch;
        const thread = Math.floor(threadPosition);
        satinRidge = Math.sin(Math.PI * (threadPosition - thread));
        satinJitter = hash(thread, own * 7919 + seed);
      }
      let rowRidge = 0;
      let fillJitter = 0;
      let rowEnd = 0;
      if (fill > 0) {
        // Fill: straight rows at a per-path angle, staggered needle holes.
        const angle = ((own * 67 + 35) * Math.PI) / 180;
        const across =
          ((-Math.sin(angle) * x + Math.cos(angle) * y) * texel) / fillPitch;
        const row = Math.floor(across);
        const stitchPosition =
          ((Math.cos(angle) * x + Math.sin(angle) * y) * texel) / fillStitch +
          row * 0.4;
        const stitch = Math.floor(stitchPosition);
        const hole = Math.min(
          stitchPosition - stitch,
          1 - (stitchPosition - stitch)
        );
        const needle = Math.exp(-(((hole * fillStitch) / 0.22) ** 2));
        rowRidge = Math.sin(Math.PI * (across - row)) * (1 - 0.8 * needle);
        fillJitter = hash(row * 131 + stitch, own);
        rowEnd = hash(row, own + 17);
      }

      // Thread ends make the edge ragged by about 0.3 mm.
      const ragged = open
        ? Math.min(
            // Narrow columns still need enough thread after the edge frays.
            0.15 * w,
            ((1 - fill) * (0.12 * (1 - satinRidge) + 0.16 * satinJitter) +
              fill * (0.1 * (1 - rowRidge) + 0.2 * rowEnd)) /
              texel
          )
        : 0;
      const inset = d - ragged;
      outline[i] = inset;
      const floor = open ? 0 : 0.45;
      // Satin rolls over a rounded ridge; fill sits flatter on a shoulder.
      const columnHeight = Math.min(1, (w * texel) / 1.6) ** 0.5;
      const tube =
        1 - (1 - Math.min(Math.max(inset / w, 0), 1)) ** 2.2 * (1 - floor);
      const shoulder =
        0.72 * (floor + (1 - floor) * smoothstep(0, 0.9 / texel, inset));
      const macro = (1 - fill) * tube * columnHeight + fill * shoulder;
      const ridge = (1 - fill) * satinRidge + fill * rowRidge;
      const jitter = (1 - fill) * satinJitter + fill * fillJitter;
      const tucked = smoothstep(-0.5, 1.5, inset);

      const height = relief * macro * tucked;
      reliefHeight[i] = height;
      surface[i] = height - (0.06 * (1 - ridge) + 0.04 * jitter) * tucked;
      shade[i] =
        0.8 *
        (0.38 + (1 - 0.38) * macro ** 1.3) *
        (1 - 0.15 + 0.15 * ridge) *
        (0.94 + 0.08 * jitter) *
        (0.06 + 0.94 * tucked);
      roughness[i] = 0.5 + 0.2 * (1 - ridge) + 0.3 * (1 - tucked);
    }
  }
  return {
    width,
    rows,
    id,
    outline,
    relief: reliefHeight,
    surface,
    shade,
    roughness,
  };
}
