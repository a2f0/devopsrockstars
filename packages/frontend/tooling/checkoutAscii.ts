// Renders static/image/store/checkout.svg as the ASCII art in the checkout
// heading. Headless Chrome rasterizes the SVG and each character cell takes
// the glyph whose ink sits where the artwork's does, measured with six
// sampling circles, as on a2f0.net. Rerun it after changing the SVG:
//
//   bun run checkout:ascii [--columns 144] [--print]

import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {remote} from 'webdriverio';
import {monospace} from '../src/store/StoreStyles';

const root = path.join(import.meta.dir, '..');
const source = path.join(root, 'static/image/store/checkout.svg');
const target = path.join(root, 'src/store/checkoutAscii.ts');

interface AsciiArt {
  /** Advance width of a glyph cell over its height. */
  ratio: number;
  rows: string[];
  /** Each cell's layer: f for a letter face, s for the extrusion. */
  layers: string[];
}

// Runs in the browser, so it has to be self-contained.
const render = async (
  svgText: string,
  columns: number,
  fontFamily: string
): Promise<AsciiArt> => {
  const CHARSET = ' .,:;\'`"^_-~=+*<>/\\|()[]{}!?1ilIjtfrLJ7Y0O8#%&$@';
  const GLYPH_SIZE = 48;
  const CIRCLE_RADIUS = 0.24;
  const CELL_WIDTH = 12;
  const SIDE_CHAR = '\\';
  const INK = 0.1;
  const FLOOR = 0.05;
  const CONTRAST = 1.6;
  const FACES = 'use[href="#word"]:not([transform])';
  const LETTERS = 'use[href="#word"]';
  // Six staggered circles describe where a cell's ink sits, and matching
  // circles just outside it sharpen letter edges against their neighbours.
  const CIRCLES: [number, number][] = [
    [0.3, 0.2],
    [0.7, 0.16],
    [0.28, 0.5],
    [0.72, 0.46],
    [0.3, 0.82],
    [0.7, 0.78],
  ];
  const EXTERNAL: [number, number][] = [
    [0.1, -0.15],
    [0.9, -0.2],
    [-0.2, 0.5],
    [1.2, 0.46],
    [0.1, 1.15],
    [0.9, 1.1],
  ];

  const circleOffsets = (
    centers: [number, number][],
    width: number,
    height: number
  ) =>
    centers.map(([cx, cy]) => {
      const offsets: [number, number][] = [];
      const radius = CIRCLE_RADIUS * width;
      for (let y = Math.floor(-height / 2); y < height * 1.5; y++) {
        for (let x = Math.floor(-width / 2); x < width * 1.5; x++) {
          const dx = x + 0.5 - cx * width;
          const dy = y + 0.5 - cy * height;
          if (dx * dx + dy * dy <= radius * radius) offsets.push([x, y]);
        }
      }
      return offsets;
    });

  const context = (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    return ctx;
  };

  // The ink in each sampling circle for every character, scaled so the
  // densest circle of any glyph reads 1.
  const font = `${GLYPH_SIZE}px ${fontFamily}`;
  let ctx = context(1, 1);
  ctx.font = font;
  const metrics = ctx.measureText('M');
  const ratio = metrics.width / GLYPH_SIZE;
  const glyphWidth = Math.round(GLYPH_SIZE * ratio);
  const baseline =
    (GLYPH_SIZE -
      metrics.fontBoundingBoxAscent -
      metrics.fontBoundingBoxDescent) /
      2 +
    metrics.fontBoundingBoxAscent;
  ctx = context(glyphWidth, GLYPH_SIZE);
  const glyphCircles = circleOffsets(CIRCLES, glyphWidth, GLYPH_SIZE);
  const shapes = [...CHARSET].map(char => {
    ctx.clearRect(0, 0, glyphWidth, GLYPH_SIZE);
    ctx.font = font;
    ctx.fillStyle = '#fff';
    ctx.fillText(char, 0, baseline);
    const {data} = ctx.getImageData(0, 0, glyphWidth, GLYPH_SIZE);
    return glyphCircles.map(circle => {
      let sum = 0;
      for (const [x, y] of circle) {
        if (x >= 0 && y >= 0 && x < glyphWidth && y < GLYPH_SIZE) {
          sum += data[(y * glyphWidth + x) * 4 + 3] ?? 0;
        }
      }
      return sum / (circle.length * 255);
    });
  });
  const densest = Math.max(...shapes.flat());
  const vectors = shapes.map(shape => shape.map(value => value / densest));
  const nearest = (vector: number[]) => {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    vectors.forEach((glyph, g) => {
      let distance = 0;
      glyph.forEach((value, i) => {
        distance += ((vector[i] ?? 0) - value) ** 2;
      });
      if (distance < bestDistance) {
        bestDistance = distance;
        best = g;
      }
    });
    return CHARSET[best] ?? ' ';
  };

  // Rasterizes the artwork, or only the matching lettering painted solid
  // white, as luminance from 0 to 1 over black.
  const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const isolate = (selector: string) => {
    const copy = svg.cloneNode(true) as Document;
    const top = copy.documentElement;
    const keep = new Set<Element>();
    for (const node of top.querySelectorAll(selector)) {
      node.setAttribute('fill', '#fff');
      node.setAttribute('stroke', 'none');
      for (let n: Element | null = node; n && n !== top; n = n.parentElement) {
        keep.add(n);
      }
    }
    const prune = (parent: Element) => {
      for (const child of [...parent.children]) {
        if (child.localName === 'defs') continue;
        if (!keep.has(child)) child.remove();
        else if (!child.matches(selector)) prune(child);
      }
    };
    prune(top);
    return copy;
  };
  const luminance = async (doc: Document, width: number, height: number) => {
    doc.documentElement.setAttribute('width', String(width));
    doc.documentElement.setAttribute('height', String(height));
    const blob = new Blob([new XMLSerializer().serializeToString(doc)], {
      type: 'image/svg+xml',
    });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const art = context(width, height);
      art.fillStyle = '#000';
      art.fillRect(0, 0, width, height);
      art.drawImage(image, 0, 0, width, height);
      const {data} = art.getImageData(0, 0, width, height);
      const values = new Float32Array(width * height);
      for (let i = 0; i < values.length; i++) {
        values[i] =
          (0.2126 * (data[i * 4] ?? 0) +
            0.7152 * (data[i * 4 + 1] ?? 0) +
            0.0722 * (data[i * 4 + 2] ?? 0)) /
          255;
      }
      return values;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const [, , viewWidth = 1, viewHeight = 1] = (
    svg.documentElement.getAttribute('viewBox') ?? ''
  )
    .split(/[\s,]+/)
    .map(Number);
  const cellHeight = Math.round(CELL_WIDTH / ratio);
  const rowCount = Math.round(columns * (viewHeight / viewWidth) * ratio);
  const width = columns * CELL_WIDTH;
  const height = rowCount * cellHeight;
  const [art, faces, letters] = await Promise.all([
    luminance(svg.cloneNode(true) as Document, width, height),
    luminance(isolate(FACES), width, height),
    luminance(isolate(LETTERS), width, height),
  ]);

  // Faces read as bright chrome, the extrusion as dim metal, and the
  // surrounding brushwork as a faint backdrop; true ink stays black.
  const mix = (from: number, to: number, amount: number) =>
    from + (to - from) * amount;
  const tones = new Float32Array(width * height);
  for (let i = 0; i < tones.length; i++) {
    const a = art[i] ?? 0;
    const face = faces[i] ?? 0;
    const side = Math.max((letters[i] ?? 0) - face, 0);
    const lit = a < INK ? 0 : 1;
    tones[i] =
      face * lit * mix(0.5, 1, a) +
      side * lit * mix(0.04, 0.4, a) +
      (1 - face - side) * 0.4 * a;
  }
  const sharpen = (value: number, peak: number) =>
    peak > 0 ? (value / peak) ** CONTRAST * peak : 0;
  const coverage = (mask: Float32Array, left: number, top: number) => {
    let sum = 0;
    for (let y = top; y < top + cellHeight; y++) {
      for (let x = left; x < left + CELL_WIDTH; x++) {
        sum += mask[y * width + x] ?? 0;
      }
    }
    return sum / (CELL_WIDTH * cellHeight);
  };
  const sample = (circles: [number, number][][], left: number, top: number) =>
    circles.map(circle => {
      let sum = 0;
      for (const [dx, dy] of circle) {
        const x = Math.min(Math.max(left + dx, 0), width - 1);
        const y = Math.min(Math.max(top + dy, 0), height - 1);
        sum += tones[y * width + x] ?? 0;
      }
      return sum / circle.length;
    });

  const internal = circleOffsets(CIRCLES, CELL_WIDTH, cellHeight);
  const external = circleOffsets(EXTERNAL, CELL_WIDTH, cellHeight);
  const rows: string[] = [];
  const layers: string[] = [];
  for (let row = 0; row < rowCount; row++) {
    let text = '';
    let layer = '';
    for (let column = 0; column < columns; column++) {
      const left = column * CELL_WIDTH;
      const top = row * cellHeight;
      const face = coverage(faces, left, top);
      const side = Math.max(coverage(letters, left, top) - face, 0);
      const cell = face >= side && face > 0.25 ? 'f' : side > 0.25 ? 's' : ' ';
      const vector = sample(internal, left, top);
      if (Math.max(...vector) < FLOOR) {
        text += ' ';
      } else if (side > 0.9 && face < 0.02) {
        text += SIDE_CHAR;
      } else if (cell !== ' ') {
        // Letter edges get crisper glyphs; the backdrop keeps soft shading.
        const outside = sample(external, left, top);
        const edged = vector.map((value, i) =>
          sharpen(value, Math.max(value, outside[i] ?? 0))
        );
        const peak = Math.max(...edged);
        text += nearest(edged.map(value => sharpen(value, peak)));
      } else {
        text += nearest(vector);
      }
      layer += cell;
    }
    rows.push(text);
    layers.push(layer);
  }
  return {ratio, rows, layers};
};

const {values} = parseArgs({
  options: {
    columns: {type: 'string', default: '144'},
    print: {type: 'boolean', default: false},
  },
});
const columns = Number(values.columns);

const browser = await remote({
  logLevel: 'silent',
  capabilities: {
    browserName: 'chrome',
    'goog:chromeOptions': {args: ['--headless', '--no-sandbox']},
  },
});
let art: AsciiArt;
try {
  art = await browser.execute(
    render,
    await readFile(source, 'utf8'),
    columns,
    monospace
  );
} finally {
  await browser.deleteSession();
}

if (values.print) {
  console.log(art.rows.join('\n'));
} else {
  await writeFile(
    target,
    `// Generated by \`bun run checkout:ascii\` from
// static/image/store/checkout.svg; change the SVG and rerun it instead.

/** Advance width of a glyph cell over its height. */
export const ratio = ${art.ratio};

export const rows = ${JSON.stringify(art.rows)};

/** Each cell's layer: f for a letter face, s for the extrusion. */
export const layers = ${JSON.stringify(art.layers)};
`
  );
  const format = Bun.spawnSync(['bun', 'run', 'format', target], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (!format.success) process.exit(format.exitCode);
  console.log(
    `Wrote ${path.relative(root, target)}: ${columns} columns, ${art.rows.length} rows`
  );
}
