import assert from "node:assert/strict";
import test from "node:test";
import { AVENUES, EDGES, STREETS, edgeKey, landmarks, worldToMap } from "../src/city.ts";
import type { Point } from "../src/city.ts";
import {
  EDGE_INK_RADIUS,
  STASH_RING_RADIUS,
  analyzeInk,
  drawnEdgeKeys,
  missionFromInk,
} from "../src/planmap.ts";

const WIDTH = 1200;
const HEIGHT = 960;

function blank() {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 44;
    pixels[i + 1] = 58;
    pixels[i + 2] = 66;
    pixels[i + 3] = 255;
  }
  return pixels;
}

function paintDisk(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  radius: number,
  rgb: readonly [number, number, number],
) {
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(WIDTH - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(y + radius));
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      if (Math.hypot(px - x, py - y) > radius) continue;
      const index = (py * WIDTH + px) * 4;
      pixels[index] = rgb[0];
      pixels[index + 1] = rgb[1];
      pixels[index + 2] = rgb[2];
      pixels[index + 3] = 255;
    }
  }
}

function paintLine(
  pixels: Uint8ClampedArray,
  worldPoints: Point[],
  rgb: readonly [number, number, number],
  thicknessPx = 8,
) {
  for (let i = 1; i < worldPoints.length; i += 1) {
    const a = worldToMap(worldPoints[i - 1]);
    const b = worldToMap(worldPoints[i]);
    const distance = Math.hypot(b.px - a.px, b.py - a.py);
    const steps = Math.max(1, Math.ceil(distance));
    for (let n = 0; n <= steps; n += 1) {
      const t = n / steps;
      paintDisk(
        pixels,
        a.px + (b.px - a.px) * t,
        a.py + (b.py - a.py) * t,
        thicknessPx / 2,
        rgb,
      );
    }
  }
}

function paintCircle(
  pixels: Uint8ClampedArray,
  centerWorld: Point,
  radiusPx: number,
  rgb: readonly [number, number, number],
  thicknessPx = 6,
) {
  const center = worldToMap(centerWorld);
  const steps = Math.ceil(Math.PI * radiusPx * 2);
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    paintDisk(
      pixels,
      center.px + Math.cos(angle) * radiusPx,
      center.py + Math.sin(angle) * radiusPx,
      thicknessPx / 2,
      rgb,
    );
  }
}

const pink = [255, 79, 176] as const;
const yellow = [255, 207, 74] as const;

/** Px per world unit on the plan image (880 px for 590 units). */
const PPU = worldToMap({ x: 1, z: 0 }).px - worldToMap({ x: 0, z: 0 }).px;
const plan = (lines: Array<[Point[], readonly [number, number, number]?, number?]>) => {
  const base = blank();
  const edited = base.slice();
  for (const [pts, rgb = pink, px] of lines) paintLine(edited, pts, rgb, px);
  return { base, edited };
};

/**
 * A believable hand stroke: the pen wanders ±`wobble` world units either side
 * of the road centre (two sines, like a shaky mouse), `offset` off-centre.
 */
function handStroke(from: Point, to: Point, wobble = 10, offset = 0): Point[] {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const ux = (to.x - from.x) / length, uz = (to.z - from.z) / length;
  const pts: Point[] = [];
  for (let s = 0; s <= length; s += 3) {
    const w = offset + wobble * (0.7 * Math.sin(s / 23) + 0.3 * Math.sin(s / 7 + 1));
    pts.push({ x: from.x + ux * s - uz * w, z: from.z + uz * s + ux * w });
  }
  return pts;
}

test("the map scale: 590 world units over 880 px", () => {
  assert.ok(Math.abs(PPU - 880 / 590) < 1e-9);
  assert.deepEqual([...AVENUES], [0, 150, 300, 450]);
  assert.deepEqual([...STREETS], [-400, -250, -100, 50]);
});

test("snaps an L-shaped getaway to the far Causeway drop", () => {
  const { base, edited } = plan([[[{ x: 0, z: 50 }, { x: 450, z: 50 }, { x: 450, z: -400 }]]]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.equal(mission.destination.id, "causeway");
  assert.equal(mission.fromDrawing, true);
  assert.ok(mission.drawnShare > 0.9, `drawn ${mission.drawnShare}`);
  assert.deepEqual(mission.route.at(-1), { x: 450, z: -400 });
  // East first: the car starts just past the garage node, facing east.
  assert.deepEqual(mission.start, { x: 10, z: 50, heading: Math.PI / 2 });
  assert.deepEqual(
    mission.checkpoints.map((c) => `${c.x}:${c.z}`),
    ["150:50", "300:50", "450:50", "450:-100", "450:-250", "450:-400"],
  );
  assert.deepEqual(mission.camerasOnRoute, [], "the coast road dodges every camera");
});

test("a route across Beach Road ends at Palm Motel", () => {
  const { base, edited } = plan([[[{ x: 0, z: 50 }, { x: 450, z: 50 }]]]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.equal(mission.destination.id, "motel");
  assert.deepEqual(mission.route.at(-1), { x: 450, z: 50 });
  assert.equal(mission.start.heading, Math.PI / 2);
});

test("the west-side route ends at Marina and crosses the pier camera", () => {
  const { base, edited } = plan([[[{ x: 0, z: 50 }, { x: 0, z: -400 }]]]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.equal(mission.destination.id, "marina");
  assert.ok(mission.camerasOnRoute.some((camera) => camera.id === "cam-pier"));
  // North first: the car starts on the garage pad facing north.
  assert.deepEqual(mission.start, { x: 0, z: 40, heading: 0 });
});

test("a shaky hand-drawn line with the default brush still marks every road it follows", () => {
  // ±12 units of wobble (≈18 px) along the west avenue, then along Harbor Row.
  const stroke = [
    ...handStroke({ x: 0, z: 50 }, { x: 0, z: -400 }, 12),
    ...handStroke({ x: 0, z: -400 }, { x: 300, z: -400 }, 12),
  ];
  const { base, edited } = plan([[stroke, pink, 6]]);
  const ink = analyzeInk(base, edited, WIDTH, HEIGHT);
  const drawn = drawnEdgeKeys(ink.route);
  for (const [a, b] of [
    ["0:50", "0:-100"],
    ["0:-100", "0:-250"],
    ["0:-250", "0:-400"],
    ["0:-400", "150:-400"],
    ["150:-400", "300:-400"],
  ])
    assert.ok(drawn.has(edgeKey(a, b)), `${a} → ${b} counts as drawn`);
  assert.equal(drawn.size, 5, `only the followed roads: ${[...drawn].join(", ")}`);
});

test("a stroke drawn beside the road (18 units off-centre) still counts", () => {
  const stroke = handStroke({ x: 5, z: 50 }, { x: 150, z: 50 }, 4, -18);
  const { base, edited } = plan([[stroke, pink, 6]]);
  const drawn = drawnEdgeKeys(analyzeInk(base, edited, WIDTH, HEIGHT).route);
  assert.deepEqual([...drawn], [edgeKey("0:50", "150:50")]);
});

test("a line cutting straight across a road does not count as driving it", () => {
  // 45° and 70° slashes through Market St mid-block.
  for (const line of [
    [{ x: 40, z: -60 }, { x: 110, z: -140 }],
    [{ x: 60, z: -30 }, { x: 90, z: -170 }],
  ]) {
    const { base, edited } = plan([[line, pink, 8]]);
    const drawn = drawnEdgeKeys(analyzeInk(base, edited, WIDTH, HEIGHT).route);
    assert.equal(drawn.size, 0, [...drawn].join(", "));
  }
});

test("yellow ink marks only the circled stash crate", () => {
  const crate = landmarks("stash").find((s) => s.id === "stash-3")!; // (375, 50)
  const { base, edited } = plan([[[{ x: 0, z: 50 }, { x: 450, z: 50 }]]]);
  paintCircle(edited, crate, 40, yellow);
  const ink = analyzeInk(base, edited, WIDTH, HEIGHT);
  const mission = missionFromInk(ink);

  assert.ok(ink.stashPixels > 0);
  assert.deepEqual(mission.stashes.map((stash) => stash.id), ["stash-3"]);
  assert.ok(mission.notes.some((note) => note.includes("crate")));
});

test("a big loose ring marks the crate inside it but never its diagonal neighbour", () => {
  // stash-2 (150, -325) and stash-5 (225, -400) are the closest pair (106 apart).
  const ringPx = (STASH_RING_RADIUS - 6) * PPU;
  const { base, edited } = plan([[[{ x: 0, z: 50 }, { x: 0, z: -400 }]]]);
  paintCircle(edited, { x: 150, z: -325 }, ringPx, yellow, 6);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));
  assert.deepEqual(mission.stashes.map((stash) => stash.id), ["stash-2"]);
});

test("a blank map falls back to Nico's Marina route", () => {
  const base = blank();
  const ink = analyzeInk(base, base.slice(), WIDTH, HEIGHT);
  const mission = missionFromInk(ink);

  assert.equal(ink.routePixels, 0);
  assert.equal(mission.destination.id, "marina");
  assert.equal(mission.fromDrawing, false);
  assert.deepEqual(mission.start, { x: 0, z: 40, heading: 0 });
});

test("fills a missing middle road segment but reports the gap", () => {
  const { base, edited } = plan([
    [[{ x: 0, z: 50 }, { x: 150, z: 50 }]],
    [[{ x: 300, z: 50 }, { x: 450, z: 50 }, { x: 450, z: -400 }]],
  ]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.equal(mission.destination.id, "causeway");
  assert.ok(mission.route.some((point) => point.x === 150 && point.z === 50));
  assert.ok(mission.route.some((point) => point.x === 300 && point.z === 50));
  assert.ok(mission.drawnShare < 0.97 && mission.drawnShare > 0.7, `drawn ${mission.drawnShare}`);
  assert.ok(mission.notes.some((note) => note.includes("gaps")));
});

test("ignores one-pixel shifts in thin base-map details", () => {
  const base = blank();
  // Thin vertical strokes and a dotted "text" row: a horizontal 1 px shift
  // really changes these pixels, like resampled base-map labels would.
  const light = (x: number, y: number) => {
    const index = (y * WIDTH + x) * 4;
    base[index] = 225;
    base[index + 1] = 230;
    base[index + 2] = 235;
  };
  for (const x of [210, 405, 600, 806]) for (let y = 60; y < 900; y += 1) light(x, y);
  for (let x = 120; x < 900; x += 3) for (let y = 500; y < 510; y += 1) light(x, y);
  const edited = blank();
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 1; x < WIDTH; x += 1) {
      const to = (y * WIDTH + x) * 4;
      const from = (y * WIDTH + x - 1) * 4;
      edited[to] = base[from];
      edited[to + 1] = base[from + 1];
      edited[to + 2] = base[from + 2];
      edited[to + 3] = base[from + 3];
    }
  }

  const ink = analyzeInk(base, edited, WIDTH, HEIGHT);
  assert.equal(ink.routePixels, 0);
  assert.equal(ink.stashPixels, 0);
});

test("a loop past Palm Motel and the Causeway that ends at the Marina ends at the Marina", () => {
  const { base, edited } = plan([
    [[{ x: 0, z: 50 }, { x: 450, z: 50 }, { x: 450, z: -400 }, { x: 0, z: -400 }], [82, 232, 255]],
  ]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.equal(mission.destination.id, "marina");
  assert.deepEqual(mission.route.at(-1), { x: 0, z: -400 });
  assert.ok(mission.route.some((point) => point.x === 450 && point.z === -400));
  assert.ok(mission.drawnShare > 0.9);
});

test("white note text is ignored when a coloured route exists", () => {
  const { base, edited } = plan([
    [[{ x: 0, z: 50 }, { x: 450, z: 50 }]],
    // A chunky white scribble right next to the Marina drop.
    [[{ x: -10, z: -415 }, { x: 25, z: -385 }, { x: -10, z: -375 }], [255, 255, 255], 10],
  ]);
  const ink = analyzeInk(base, edited, WIDTH, HEIGHT);
  const mission = missionFromInk(ink);

  assert.ok((ink.notePixels ?? 0) > 0);
  assert.equal(mission.destination.id, "motel");
});

test("a white-only route still counts as a route", () => {
  const { base, edited } = plan([[[{ x: 0, z: 50 }, { x: 0, z: -400 }], [250, 250, 250]]]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.equal(mission.destination.id, "marina");
  assert.equal(mission.fromDrawing, true);
});

test("a straight line through buildings is snapped to streets", () => {
  const { base, edited } = plan([[[{ x: 0, z: 50 }, { x: 450, z: -400 }]]]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.equal(mission.destination.id, "causeway");
  assert.equal(mission.fromDrawing, true);
  assert.ok(mission.drawnShare < 0.2, `drawn ${mission.drawnShare}`);
  assert.ok(mission.notes.some((note) => note.includes("snapped")));
  // Every leg is axis-aligned and runs node to node along a real edge.
  const keys = new Set(EDGES.map((e) => edgeKey(e.a, e.b)));
  for (let i = 1; i < mission.route.length; i += 1) {
    const a = mission.route[i - 1];
    const b = mission.route[i];
    assert.ok(a.x === b.x || a.z === b.z);
    if (i > 1) assert.ok(keys.has(edgeKey(`${a.x}:${a.z}`, `${b.x}:${b.z}`)));
  }
});

test("notes stay between two and four lines", () => {
  const { base, edited } = plan([
    [[{ x: 0, z: 50 }, { x: 150, z: 50 }]],
    [[{ x: 300, z: 50 }, { x: 450, z: 50 }, { x: 450, z: -400 }]],
  ]);
  paintCircle(edited, { x: 450, z: -175 }, 40, yellow);
  paintCircle(edited, { x: 225, z: -250 }, 14, [10, 10, 10]);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.ok(mission.notes.length >= 2 && mission.notes.length <= 4, mission.notes.join(" | "));
  assert.deepEqual(mission.stashes.map((stash) => stash.id), ["stash-4"]);
});

test("drawnEdgeKeys identifies one covered edge without bleeding into its neighbours", () => {
  const route: Point[] = [];
  for (let x = 0; x <= 150; x += 2) route.push({ x, z: 50 });
  const keys = drawnEdgeKeys(route);

  assert.deepEqual([...keys], [edgeKey("0:50", "150:50")]);
  assert.ok(!keys.has(edgeKey("0:-100", "0:50")));
  assert.ok(!keys.has(edgeKey("150:50", "300:50")));
  // A dot of ink right on a crossing never marks the four roads meeting there.
  const dot: Point[] = [];
  for (let dx = -EDGE_INK_RADIUS; dx <= EDGE_INK_RADIUS; dx += 2)
    for (let dz = -EDGE_INK_RADIUS; dz <= EDGE_INK_RADIUS; dz += 2) dot.push({ x: 150 + dx, z: -100 + dz });
  assert.equal(drawnEdgeKeys(dot).size, 0);
});

test("yellow circles with no route line still mark crates without blaming the drawing", () => {
  const base = blank();
  const edited = base.slice();
  paintCircle(edited, { x: 75, z: -100 }, 40, yellow);
  const mission = missionFromInk(analyzeInk(base, edited, WIDTH, HEIGHT));

  assert.deepEqual(mission.stashes.map((stash) => stash.id), ["stash-1"]);
  assert.equal(mission.drawnShare, 0);
  assert.ok(!mission.notes.some((note) => note.includes("buildings")), mission.notes.join(" | "));
  assert.ok(mission.notes.some((note) => note.includes("No route line")));
  assert.ok(mission.notes.length >= 2 && mission.notes.length <= 4);
});

test("a short scribble next to the garage is not treated as a plan", () => {
  const scribble = Array.from({ length: 40 }, (_, i) => ({ x: 30 + (i % 8) * 3, z: 70 + Math.floor(i / 8) * 3 }));
  const m = missionFromInk({ route: scribble, stash: [], routePixels: 400, stashPixels: 0 });
  assert.equal(m.fromDrawing, false);
  assert.equal(m.destination.id, "marina");
});
