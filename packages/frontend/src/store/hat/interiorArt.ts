// Vector artwork for the cap's printed seam tape and woven labels. Glyphs are
// stroked SVG path data on a unit cap height (y down), so nothing waits on
// font loading, and a CPU-backed canvas rasterizes them identically on every
// load.

interface Glyph {
  width: number;
  path: string;
}

type Weight = 'bold' | 'thin' | 'block';

// Stroke width as a fraction of the cap height.
const strokeWidths: Record<Weight, number> = {
  bold: 0.2,
  thin: 0.085,
  block: 0.15,
};

// Heavy geometric figures for "59" and the size label.
const bold: Record<string, Glyph> = {
  '5': {
    width: 0.78,
    path: 'M0.7 0.1H0.2L0.17 0.47C0.32 0.37 0.7 0.37 0.69 0.67C0.68 0.97 0.26 0.97 0.06 0.8',
  },
  '9': {
    width: 0.78,
    path: 'M0.39 0.1A0.27 0.27 0 1 0 0.39 0.64A0.27 0.27 0 1 0 0.39 0.1ZM0.66 0.37V0.6C0.66 0.84 0.46 0.9 0.1 0.9',
  },
  '7': {width: 0.72, path: 'M0.04 0.12H0.66L0.3 1'},
  '1': {width: 0.42, path: 'M0.06 0.3L0.28 0.12V1'},
  '2': {
    width: 0.68,
    path: 'M0.1 0.34C0.1 0.03 0.58 0.03 0.57 0.32C0.56 0.54 0.2 0.64 0.13 0.88H0.66',
  },
  '6': {
    width: 0.72,
    path: 'M0.36 0.41A0.24 0.24 0 1 0 0.36 0.89A0.24 0.24 0 1 0 0.36 0.41ZM0.6 0.1C0.3 0.1 0.12 0.35 0.12 0.65',
  },
  '/': {width: 0.44, path: 'M0.4 0.02L0.04 0.98'},
  '.': {width: 0.26, path: 'M0.13 0.84V1'},
};

// The thin, tall capitals of "FIFTY" and lower case for "cm".
const thin: Record<string, Glyph> = {
  F: {width: 0.62, path: 'M0.0425 1V0.0425H0.62M0.0425 0.5H0.54'},
  I: {width: 0.085, path: 'M0.0425 0V1'},
  T: {width: 0.96, path: 'M0 0.0425H0.96M0.48 0.0425V1'},
  Y: {width: 0.92, path: 'M0 0L0.46 0.52L0.92 0M0.46 0.52V1'},
  c: {
    width: 0.56,
    path: 'M0.52 0.5C0.3 0.36 0.05 0.46 0.05 0.7C0.05 0.94 0.3 1.04 0.52 0.9',
  },
  m: {
    width: 0.84,
    path: 'M0.05 1V0.42M0.05 0.62C0.05 0.36 0.42 0.36 0.42 0.62V1M0.42 0.62C0.42 0.36 0.79 0.36 0.79 0.62V1',
  },
  '®': {
    width: 0.44,
    path: 'M0.22 0.02A0.2 0.2 0 1 0 0.22 0.42A0.2 0.2 0 1 0 0.22 0.02ZM0.16 0.32V0.12H0.24C0.31 0.12 0.31 0.22 0.24 0.22H0.16M0.23 0.22L0.29 0.32',
  },
};

// Squared capitals, as in the woven NEW ERA box.
const block: Record<string, Glyph> = {
  N: {width: 0.72, path: 'M0.075 1V0.075L0.645 0.925V0'},
  E: {width: 0.62, path: 'M0.62 0.075H0.075V0.925H0.62M0.075 0.5H0.52'},
  W: {width: 0.96, path: 'M0.075 0V0.925H0.885V0M0.48 0.35V0.925'},
  R: {width: 0.66, path: 'M0.075 1V0.075H0.585V0.5H0.075M0.33 0.5L0.62 1'},
  A: {width: 0.7, path: 'M0.075 1V0.3L0.26 0.075H0.625V1M0.075 0.56H0.625'},
};

const fonts: Record<Weight, Record<string, Glyph>> = {bold, thin, block};

// A simple pennant: a stand-in for the flag mark, not a copy of it.
const flag =
  'M0.22 0.3C0.42 0.22 0.6 0.36 0.84 0.28L0.72 0.5L0.84 0.72C0.6 0.8 0.42 0.66 0.22 0.74ZM0.22 0.2V0.86';

const paths = new Map<string, Path2D>();
function path2d(data: string) {
  let path = paths.get(data);
  if (!path) {
    path = new Path2D(data);
    paths.set(data, path);
  }
  return path;
}

/**
 * A 2D frame for artwork: `x`, `y` place the origin and `angle` turns the
 * text baseline, all in canvas pixels.
 */
interface Frame {
  x: number;
  y: number;
  angle: number;
}

function stroke(
  context: CanvasRenderingContext2D,
  frame: Frame,
  offset: number,
  size: number,
  data: string,
  width: number
) {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  context.setTransform(
    cos * size,
    sin * size,
    -sin * size,
    cos * size,
    frame.x + cos * offset,
    frame.y + sin * offset
  );
  context.lineWidth = width;
  context.stroke(path2d(data));
}

interface Run {
  weight: Weight;
  // Gap after each glyph, as a fraction of the cap height.
  spacing?: readonly number[];
  stroke?: number;
}

/**
 * Strokes a run of glyphs from the frame origin along its baseline direction
 * and returns the run length in pixels.
 */
function text(
  context: CanvasRenderingContext2D,
  frame: Frame,
  size: number,
  characters: string,
  {weight, spacing = [], stroke: width = strokeWidths[weight]}: Run
) {
  let offset = 0;
  [...characters].forEach((character, i) => {
    const glyph = fonts[weight][character];
    if (!glyph) return;
    stroke(context, frame, offset, size, glyph.path, width);
    offset += (glyph.width + (spacing[i] ?? 0.12)) * size;
  });
  return offset;
}

/** The frame moved `distance` pixels along its baseline and `down` across. */
function along(frame: Frame, distance: number, down = 0): Frame {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  return {
    x: frame.x + cos * distance - sin * down,
    y: frame.y + sin * distance + cos * down,
    angle: frame.angle,
  };
}

// "59FIFTY®": heavy figures, then light, widely set capitals, measured from
// New Era's tape (about 6 cap heights long).
const wordmarkSpacing = [0.04, 0.1, 0.3, 0.1, 0.12, 0.02, 0.14];
const wordmarkLength = [...'59FIFTY'].reduce(
  (length, character, i) =>
    length +
    (fonts[i < 2 ? 'bold' : 'thin'][character]?.width ?? 0) +
    (wordmarkSpacing[i] ?? 0),
  thin['®']?.width ?? 0
);

function wordmark(
  context: CanvasRenderingContext2D,
  frame: Frame,
  size: number
) {
  const figures = text(context, frame, size, '59', {
    weight: 'bold',
    spacing: wordmarkSpacing,
  });
  const letters = text(context, along(frame, figures), size, 'FIFTY', {
    weight: 'thin',
    spacing: wordmarkSpacing.slice(2),
  });
  text(context, along(frame, figures + letters), size, '®', {
    weight: 'thin',
    stroke: 0.045,
  });
}

// Length of the flag box and its trailing registration mark, in box heights.
const flagBoxLength = 2.8;

/**
 * The boxed mark: a black square holding a white flag beside a white square
 * lettered NEW ERA in black. `size` is the box height; the frame origin is
 * the box's top-left corner.
 */
function flagBox(
  context: CanvasRenderingContext2D,
  frame: Frame,
  size: number
) {
  const border = 0.06;
  stroke(
    context,
    frame,
    0,
    size,
    `M${border / 2} ${border / 2}H${2.28 - border / 2}V${1 - border / 2}H${border / 2}Z`,
    border
  );
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  context.setTransform(cos, sin, -sin, cos, frame.x, frame.y);
  context.fillRect(1.14 * size, 0, 1.14 * size, size);
  stroke(context, frame, 0.06 * size, size, flag, 0.075);
  context.strokeStyle = '#000';
  for (const [row, word] of [
    [0.2, 'NEW'],
    [0.55, 'ERA'],
  ] as const) {
    text(context, along(frame, 1.36 * size, row * size), 0.27 * size, word, {
      weight: 'block',
      spacing: [0.14, 0.14],
    });
  }
  context.strokeStyle = '#fff';
  text(context, along(frame, 2.36 * size), 0.3 * size, '®', {
    weight: 'thin',
    stroke: 0.1,
  });
}

function canvas(width: number, rows: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = rows;
  // A CPU-backed context rasterizes identically on every load.
  const context = element.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('2D canvas is unavailable');
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, rows);
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.lineCap = 'butt';
  context.lineJoin = 'miter';
  // Square corners stay sharp; acute joins bevel instead of spiking.
  context.miterLimit = 2;
  return {element, context};
}

/** White coverage in 0..1; canvas row 0 becomes texture row 0. */
function coverage(element: HTMLCanvasElement) {
  const context = element.getContext('2d');
  const {width, height} = element;
  const pixels = context?.getImageData(0, 0, width, height).data;
  const values = new Float32Array(width * height);
  for (let i = 0; i < values.length; i++) {
    values[i] = (pixels?.[i * 4] ?? 0) / 255;
  }
  // Release the backing store now rather than at garbage collection.
  element.width = element.height = 0;
  return values;
}

export interface TapeArt {
  print: Float32Array;
  // Printed runs along the tape, [start, end] in millimetres.
  elements: [number, number][];
}

/**
 * One repeat of the seam tape print, read along increasing rows with the
 * glyphs standing across the tape: "59FIFTY®", then the flag box.
 */
export function tapeArt(
  width: number,
  rows: number,
  pxPerMm: number,
  tapeMm: number
): TapeArt {
  const {element, context} = canvas(width, rows);
  const height = 0.54 * tapeMm;
  const box = 0.6 * tapeMm;
  const repeat = rows / pxPerMm;
  const word = wordmarkLength * height;
  const boxLength = flagBoxLength * box;
  const gap = (repeat - word - boxLength) / 2;
  const wordStart = gap / 2;
  const boxStart = wordStart + word + gap;
  // Baseline direction +y; glyph tops face +x.
  wordmark(
    context,
    {
      x: (width + height * pxPerMm) / 2,
      y: wordStart * pxPerMm,
      angle: Math.PI / 2,
    },
    height * pxPerMm
  );
  flagBox(
    context,
    {x: (width + box * pxPerMm) / 2, y: boxStart * pxPerMm, angle: Math.PI / 2},
    box * pxPerMm
  );
  return {
    print: coverage(element),
    elements: [
      [wordStart, wordStart + word],
      [boxStart, boxStart + boxLength],
    ],
  };
}

export interface LabelRegion {
  x: number;
  y: number;
  width: number;
  rows: number;
}

/**
 * Artwork for the woven labels: the New Era box label and the size label
 * reading 7 1/2 over 59.6cm. Regions are in canvas pixels.
 */
export function labelArt(
  width: number,
  rows: number,
  pxPerMm: number,
  brand: LabelRegion,
  size: LabelRegion
) {
  const {element, context} = canvas(width, rows);
  const box = 9 * pxPerMm;
  flagBox(
    context,
    {
      x: brand.x + (brand.width - flagBoxLength * box) / 2 + 0.04 * box,
      y: brand.y + (brand.rows - box) / 2,
      angle: 0,
    },
    box
  );
  const figure = 9 * pxPerMm;
  const small = 3.6 * pxPerMm;
  const top = {
    x: size.x + (size.width - (0.8 * figure + 0.8 * small)) / 2,
    y: size.y + 0.18 * size.rows,
    angle: 0,
  };
  text(context, top, figure, '7', {weight: 'bold', stroke: 0.19});
  // A stacked one-half beside the seven.
  const fraction = along(top, 0.8 * figure);
  text(context, fraction, small, '1', {weight: 'bold', stroke: 0.2});
  stroke(context, fraction, 0, small, 'M-0.05 1.22H0.8', 0.12);
  text(context, along(fraction, 0.1 * small, 1.4 * small), small, '2', {
    weight: 'bold',
    stroke: 0.2,
  });
  const caption = 2.6 * pxPerMm;
  const line = {
    x: size.x + (size.width - 3.9 * caption) / 2,
    y: top.y + 1.3 * figure,
    angle: 0,
  };
  const figures = text(context, line, caption, '59.6', {
    weight: 'bold',
    stroke: 0.1,
    spacing: [0.04, 0.02, 0.02],
  });
  text(context, along(line, figures + 0.06 * caption), caption, 'cm', {
    weight: 'thin',
    spacing: [0.06],
  });
  return coverage(element);
}
