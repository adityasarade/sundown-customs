import {
  AVENUES,
  BLOCK,
  EDGES,
  GARAGE_NODE,
  MAP,
  NODES,
  ROAD_HALF_WIDTH,
  STREETS,
  defaultMission,
  edgeKey,
  landmarks,
  mapToWorld,
  missionFromPath,
  node,
  shortestPath,
  worldToMap,
} from "./city.ts";
import type { Edge, Landmark, Mission, Point } from "./city.ts";

export type InkAnalysis = {
  route: Point[];
  stash: Point[];
  routePixels: number;
  stashPixels: number;
  /**
   * Achromatic ink (white/grey/black text notes, labels) that was left out of
   * `route` because coloured route ink existed. Informational only.
   */
  notePixels?: number;
};

export const PLAN_STREETS: {
  avenues: Record<number, string>;
  streets: Record<number, string>;
} = {
  avenues: {
    [AVENUES[0]]: "OCEAN DR",
    [AVENUES[1]]: "PLAZA AVE",
    [AVENUES[2]]: "PALM AVE",
    [AVENUES[3]]: "SUNSET BLVD",
  },
  streets: {
    [STREETS[0]]: "HARBOR ROW",
    [STREETS[1]]: "MARKET ST",
    [STREETS[2]]: "PIER RD",
    [STREETS[3]]: "BEACH RD",
  },
};

/** Real-world scale of the city: one world unit is about 0.8 m. */
export const METERS_PER_UNIT = 0.8;
/** Map pixels per world unit on the 1200×960 plan image. */
const PX_PER_UNIT = MAP.size / (MAP.maxX - MAP.minX);
/** The shoreline: everything west of this is marina water. */
const SHORE_X = -25;

/**
 * Ink detection radii, in world units. The map shows 590 units across 880 px
 * (≈1.49 px per unit, 1 unit ≈ 0.8 m) and a block is 150 units, so these are
 * tuned for a hand-drawn stroke that wobbles anywhere inside — or a little
 * outside — the 26-unit-wide road, while a line cutting straight across a
 * road never counts as driving along it.
 */
/**
 * Route ink within this distance of an edge sample covers it (≈33 px on the
 * map): the 13-unit road half-width plus 9 units of hand wobble.
 */
export const EDGE_INK_RADIUS = 22;
/** Spacing of the samples taken along each road edge (≈38 samples per block). */
const EDGE_SAMPLE_SPACING = 4;
/**
 * Share of an edge's samples that must be covered for it to count as drawn.
 * A stroke crossing a road at 45° covers ≈38% of a 150-unit block at the
 * radius above; one drawn along it, even 20 units off-centre, covers ~100%.
 */
const EDGE_DRAWN_SHARE = 0.45;
/** Route ink within this distance of a drop counts toward choosing it (≈54 px). */
export const DROP_INK_RADIUS = 36;
/** Yellow ink this close to a crate marks it outright (≈36 px). */
export const STASH_INK_RADIUS = 24;
/**
 * A yellow ring around a crate (ink in 3 of 4 quadrants) may be this wide
 * (≈104 px, a comfortable Unlayer circle). The closest crates are 106 units
 * apart diagonally, so a ring around one never marks its neighbour.
 */
export const STASH_RING_RADIUS = 70;

const CREAM = "#f0ead9";
const PINK = "#ff4fb0";
const GOLD = "#ffcf4a";
const RED = "#ff3b4e";
const GREEN = "#7ee07a";
const FONT_DISPLAY = '"Barlow Condensed", Impact, sans-serif';
const FONT_BODY = '"DM Sans", Arial, sans-serif';

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function seededRandom(seed = 0x51a7c0de) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
  return cursorY + lineHeight;
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  radius = 13,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#141323";
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCamera(ctx: CanvasRenderingContext2D, landmark: Landmark) {
  const { px: x, py: y } = worldToMap(landmark);
  const radius = 20 * PX_PER_UNIT;
  ctx.save();
  ctx.fillStyle = "rgba(255,59,78,.08)";
  ctx.strokeStyle = "rgba(255,59,78,.38)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  drawBadge(ctx, x, y, RED, 10);
  ctx.fillStyle = "white";
  roundedRect(ctx, x - 6, y - 4, 9, 7, 1.5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 3, y - 2.5);
  ctx.lineTo(x + 7, y - 5);
  ctx.lineTo(x + 7, y + 3);
  ctx.lineTo(x + 3, y + 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGarage(ctx: CanvasRenderingContext2D, landmark: Landmark) {
  const { px: x, py: y } = worldToMap(landmark);
  drawBadge(ctx, x, y, GREEN, 15);
  ctx.save();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 6);
  ctx.lineTo(x + 5, y - 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 5, y - 5, 4, 0.2, 1.35);
  ctx.stroke();
  ctx.fillStyle = GREEN;
  roundedRect(ctx, x + 20, y - 17, 57, 21, 5);
  ctx.fill();
  ctx.fillStyle = "#141323";
  ctx.font = `900 14px ${FONT_DISPLAY}`;
  ctx.fillText("START", x + 29, y - 2);
  ctx.fillStyle = "rgba(240,234,217,.82)";
  ctx.font = `600 9px ${FONT_BODY}`;
  ctx.fillText(landmark.name, x + 21, y + 17);
  ctx.restore();
}

function drawDrop(ctx: CanvasRenderingContext2D, landmark: Landmark) {
  const { px: x, py: y } = worldToMap(landmark);
  drawBadge(ctx, x, y, "#24283a", 14);
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.fillStyle = GOLD;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 8);
  ctx.lineTo(x - 4, y - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 8);
  ctx.lineTo(x + 8, y - 5);
  ctx.lineTo(x - 3, y);
  ctx.closePath();
  ctx.fill();
  const label = landmark.name;
  ctx.font = `italic 800 13px ${FONT_DISPLAY}`;
  const width = ctx.measureText(label).width + 16;
  // Drop pills sit under/over the badge so they never hide the camera and
  // crate blips that share their street.
  // The west-side drop lifts its pill above the badge to leave the street
  // name visible.
  const below = x > MAP.left + MAP.size - 180;
  const labelX = x - width / 2;
  const labelY = below ? y + 22 : y - 45;
  ctx.fillStyle = "rgba(20,19,35,.9)";
  roundedRect(ctx, labelX, labelY, width, 23, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,207,74,.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.fillText(label, labelX + 8, labelY + 17);
  ctx.restore();
}

function drawSpray(ctx: CanvasRenderingContext2D, landmark: Landmark) {
  const { px: x, py: y } = worldToMap(landmark);
  drawBadge(ctx, x, y, PINK, 11);
  ctx.save();
  ctx.fillStyle = "white";
  roundedRect(ctx, x - 5, y - 4, 10, 11, 2);
  ctx.fill();
  ctx.fillRect(x - 3, y - 8, 6, 3);
  ctx.fillStyle = "rgba(240,234,217,.75)";
  ctx.font = `600 8px ${FONT_BODY}`;
  ctx.textAlign = "center";
  ctx.fillText("SPRAY & PRAY", x, y + 27);
  ctx.restore();
}

function drawStash(ctx: CanvasRenderingContext2D, landmark: Landmark) {
  const { px: x, py: y } = worldToMap(landmark);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = "#141323";
  ctx.lineWidth = 4;
  ctx.fillRect(x - 10, y - 10, 20, 20);
  ctx.strokeRect(x - 10, y - 10, 20, 20);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(20,19,35,.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 9);
  ctx.lineTo(x + 9, y + 9);
  ctx.moveTo(x + 9, y - 9);
  ctx.lineTo(x - 9, y + 9);
  ctx.stroke();
  ctx.fillStyle = "#141323";
  ctx.font = `900 15px ${FONT_DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText("?", x, y + 5);
  ctx.restore();
}

function drawMapFrame(ctx: CanvasRenderingContext2D) {
  const l = MAP.left;
  const t = MAP.top;
  const r = l + MAP.size;
  const b = t + MAP.size;
  ctx.save();
  ctx.strokeStyle = "rgba(240,234,217,.75)";
  ctx.lineWidth = 2;
  ctx.strokeRect(l, t, MAP.size, MAP.size);
  ctx.strokeStyle = "rgba(240,234,217,.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const p = l + (MAP.size * i) / 10;
    ctx.beginPath();
    ctx.moveTo(p, t);
    ctx.lineTo(p, t + (i % 5 === 0 ? 10 : 6));
    ctx.moveTo(p, b);
    ctx.lineTo(p, b - (i % 5 === 0 ? 10 : 6));
    ctx.stroke();
    const q = t + (MAP.size * i) / 10;
    ctx.beginPath();
    ctx.moveTo(l, q);
    ctx.lineTo(l + (i % 5 === 0 ? 10 : 6), q);
    ctx.moveTo(r, q);
    ctx.lineTo(r - (i % 5 === 0 ? 10 : 6), q);
    ctx.stroke();
  }
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 2;
  const tick = 16;
  for (const [x, y, dx, dy] of [
    [l, t, 1, 1],
    [r, t, -1, 1],
    [l, b, 1, -1],
    [r, b, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx * tick, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * tick);
    ctx.stroke();
  }

  // Compass rose.
  const cx = r - 38;
  const cy = t + 48;
  ctx.fillStyle = CREAM;
  ctx.font = `900 18px ${FONT_DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText("N", cx, cy - 21);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 16);
  ctx.lineTo(cx + 7, cy + 12);
  ctx.lineTo(cx, cy + 7);
  ctx.lineTo(cx - 7, cy + 12);
  ctx.closePath();
  ctx.fill();

  // 100 m scale bar (1 unit ≈ 0.8 m), split into 50 m halves.
  const scale = (100 / METERS_PER_UNIT) * PX_PER_UNIT;
  const sx = l + 24;
  const sy = b - 25;
  ctx.fillStyle = "rgba(13,20,38,.72)";
  roundedRect(ctx, sx - 10, sy - 26, scale + 20, 36, 6);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.fillRect(sx, sy - 2, scale / 2, 5);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx, sy - 2, scale, 5);
  ctx.font = `600 10px ${FONT_BODY}`;
  ctx.textAlign = "center";
  ctx.fillText("0", sx, sy - 8);
  ctx.fillText("50", sx + scale / 2, sy - 8);
  ctx.fillText("100 m", sx + scale, sy - 8);
  ctx.restore();
}

function drawLegendIcon(ctx: CanvasRenderingContext2D, kind: Landmark["kind"], x: number, y: number) {
  ctx.save();
  if (kind === "garage") {
    drawBadge(ctx, x, y, GREEN, 8);
    ctx.fillStyle = "white";
    ctx.fillRect(x - 4, y - 1, 8, 3);
  } else if (kind === "drop") {
    drawBadge(ctx, x, y, "#24283a", 8);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x - 3, y - 6, 2, 12);
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 6);
    ctx.lineTo(x + 6, y - 4);
    ctx.lineTo(x - 1, y);
    ctx.fill();
  } else if (kind === "camera") {
    drawBadge(ctx, x, y, RED, 8);
    ctx.fillStyle = "white";
    ctx.fillRect(x - 4, y - 3, 7, 6);
  } else if (kind === "respray") {
    drawBadge(ctx, x, y, PINK, 8);
    ctx.fillStyle = "white";
    ctx.fillRect(x - 3, y - 4, 6, 9);
  } else {
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = "#141323";
    ctx.lineWidth = 2;
    ctx.fillRect(x - 8, y - 8, 16, 16);
    ctx.strokeRect(x - 8, y - 8, 16, 16);
    ctx.fillStyle = "#141323";
    ctx.font = `900 12px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText("?", x, y + 4);
  }
  ctx.restore();
}

function drawLegend(ctx: CanvasRenderingContext2D) {
  const x = 958;
  ctx.save();
  ctx.fillStyle = CREAM;
  ctx.strokeStyle = "#070914";
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.font = `italic 900 58px ${FONT_DISPLAY}`;
  ctx.strokeText("THE PLAN", x, 94);
  ctx.fillText("THE PLAN", x, 94);
  ctx.fillStyle = PINK;
  ctx.fillRect(x, 108, 186, 8);
  ctx.fillStyle = "rgba(240,234,217,.62)";
  ctx.font = `600 11px ${FONT_BODY}`;
  ctx.fillText("SOLANA BAY · HEIST NIGHT", x, 137);

  const instructions = [
    "Draw your getaway route from START to a drop in any bold colour.",
    "Circle stash crates in YELLOW to grab them.",
    "Cameras on your route = wanted stars.",
  ];
  let y = 183;
  for (let i = 0; i < instructions.length; i += 1) {
    ctx.fillStyle = GOLD;
    ctx.font = `italic 900 31px ${FONT_DISPLAY}`;
    ctx.fillText(String(i + 1), x, y);
    ctx.fillStyle = CREAM;
    ctx.font = `600 15px ${FONT_BODY}`;
    y = wrapText(ctx, instructions[i], x + 28, y - 3, 184, 21) + 21;
  }

  ctx.fillStyle = "rgba(240,234,217,.42)";
  ctx.fillRect(x, y - 2, 200, 1);
  ctx.fillStyle = CREAM;
  ctx.font = `italic 900 22px ${FONT_DISPLAY}`;
  ctx.fillText("LEGEND", x, y + 29);
  y += 60;
  const rows: Array<[Landmark["kind"], string]> = [
    ["garage", "START"],
    ["drop", "DROP"],
    ["camera", "CAMERA"],
    ["respray", "SPRAY & PRAY"],
    ["stash", "STASH CRATE"],
  ];
  for (const [kind, label] of rows) {
    drawLegendIcon(ctx, kind, x + 12, y - 5);
    ctx.fillStyle = "rgba(240,234,217,.85)";
    ctx.font = `600 13px ${FONT_BODY}`;
    ctx.fillText(label, x + 36, y);
    y += 42;
  }

  // Editor cheat-sheet: names match the Unlayer "plan" context labels.
  ctx.fillStyle = "rgba(240,234,217,.42)";
  ctx.fillRect(x, y - 16, 200, 1);
  ctx.fillStyle = CREAM;
  ctx.font = `italic 900 22px ${FONT_DISPLAY}`;
  ctx.fillText("IN THE EDITOR", x, y + 14);
  y += 44;
  const tools: Array<[string, string, "line" | "ring" | "lock"]> = [
    ["ROUTE MARKER", "bold line = GPS route", "line"],
    ["CIRCLE A CRATE", "yellow ring = grab it", "ring"],
    ["LOCK THE PLAN", "ink becomes the mission", "lock"],
  ];
  for (const [name, hint, glyph] of tools) {
    ctx.save();
    ctx.lineCap = "round";
    if (glyph === "line") {
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2);
      ctx.bezierCurveTo(x + 8, y - 12, x + 16, y + 10, x + 24, y - 8);
      ctx.stroke();
    } else if (glyph === "ring") {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(x + 12, y - 3, 10, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = GREEN;
      roundedRect(ctx, x + 4, y - 6, 16, 12, 2);
      ctx.fill();
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x + 12, y - 7, 5, Math.PI, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = CREAM;
    ctx.font = `italic 800 16px ${FONT_DISPLAY}`;
    ctx.fillText(name, x + 36, y - 4);
    ctx.fillStyle = "rgba(240,234,217,.6)";
    ctx.font = `500 11px ${FONT_BODY}`;
    ctx.fillText(hint, x + 36, y + 11);
    y += 40;
  }

  ctx.fillStyle = "rgba(240,234,217,.35)";
  ctx.font = `italic 600 11px ${FONT_BODY}`;
  wrapText(
    ctx,
    "Bay PD reminds you: planning a crime is also a crime.",
    x,
    895,
    202,
    16,
  );
  ctx.restore();
}

/** Draws the editor base image. DOM access is deliberately confined here. */
export function renderPlanMap(): string {
  const canvas = document.createElement("canvas");
  canvas.width = MAP.width;
  canvas.height = MAP.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");

  ctx.fillStyle = "#0d1426";
  ctx.fillRect(0, 0, MAP.width, MAP.height);
  const { px: shoreX } = worldToMap({ x: SHORE_X, z: 0 });
  const mapRight = MAP.left + MAP.size;
  const mapBottom = MAP.top + MAP.size;
  const h = ROAD_HALF_WIDTH;
  const random = seededRandom();
  ctx.save();
  ctx.beginPath();
  ctx.rect(MAP.left, MAP.top, MAP.size, MAP.size);
  ctx.clip();

  // Water, low-contrast hatch and the shoreline.
  ctx.fillStyle = "#172536";
  ctx.fillRect(MAP.left, MAP.top, shoreX - MAP.left, MAP.size);
  ctx.strokeStyle = "rgba(119,147,158,.13)";
  ctx.lineWidth = 1;
  for (let y = MAP.top - 100; y < mapBottom + 100; y += 24) {
    ctx.beginPath();
    ctx.moveTo(MAP.left - 40, y);
    ctx.lineTo(shoreX + 40, y + 95);
    ctx.stroke();
  }

  // Land, then a quiet promenade along the water.
  ctx.fillStyle = "#26353b";
  ctx.fillRect(shoreX, MAP.top, mapRight - shoreX, MAP.size);
  ctx.fillStyle = "#747b72";
  ctx.fillRect(shoreX - 3, MAP.top, 6, MAP.size);

  // City blocks: the land between roads, with sidewalks and building lots.
  const worldXs = [SHORE_X, ...AVENUES, MAP.maxX];
  const worldZs = [MAP.minZ, ...STREETS, MAP.maxZ];
  const roadEdge = h * PX_PER_UNIT + 3; // sidewalk gap from a road centre-line
  const blockColors = ["#314147", "#2e3d43", "#34434a", "#2b3b41"];
  const isAvenue = (x: number) => (AVENUES as readonly number[]).includes(x);
  const isStreet = (z: number) => (STREETS as readonly number[]).includes(z);
  const parkBlock = { x0: AVENUES[1], z0: STREETS[1] }; // THE PLAZA
  for (let zi = 0; zi < worldZs.length - 1; zi += 1) {
    for (let xi = 0; xi < worldXs.length - 1; xi += 1) {
      const wx0 = worldXs[xi], wx1 = worldXs[xi + 1], wz0 = worldZs[zi], wz1 = worldZs[zi + 1];
      const p1 = worldToMap({ x: wx0, z: wz0 });
      const p2 = worldToMap({ x: wx1, z: wz1 });
      const x0 = p1.px + (isAvenue(wx0) ? roadEdge : 6);
      const x1 = p2.px - (isAvenue(wx1) ? roadEdge : wx1 === MAP.maxX ? -2 : 6);
      const y0 = p1.py + (isStreet(wz0) ? roadEdge : wz0 === MAP.minZ ? -2 : 6);
      const y1 = p2.py - (isStreet(wz1) ? roadEdge : wz1 === MAP.maxZ ? -2 : 6);
      const w = x1 - x0, hgt = y1 - y0;
      if (w < 8 || hgt < 8) continue;
      ctx.fillStyle = blockColors[(xi + zi * 2) % blockColors.length];
      roundedRect(ctx, x0, y0, w, hgt, 5);
      ctx.fill();

      if (wx0 === parkBlock.x0 && wz0 === parkBlock.z0) {
        // The Plaza: lawn, diagonal paths and a fountain.
        ctx.fillStyle = "#33493f";
        roundedRect(ctx, x0 + 10, y0 + 10, w - 20, hgt - 20, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(170,182,160,.2)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x0 + 16, y0 + 16);
        ctx.lineTo(x1 - 16, y1 - 16);
        ctx.moveTo(x1 - 16, y0 + 16);
        ctx.lineTo(x0 + 16, y1 - 16);
        ctx.stroke();
        ctx.fillStyle = "#2c3f3d";
        ctx.strokeStyle = "rgba(170,182,160,.28)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(24,52,66,.9)";
        ctx.beginPath();
        ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, 12, 0, Math.PI * 2);
        ctx.fill();
        for (let n = 0; n < 14; n += 1) {
          const tx = x0 + 18 + random() * (w - 36);
          const ty = y0 + 18 + random() * (hgt - 36);
          if (Math.hypot(tx - (x0 + x1) / 2, ty - (y0 + y1) / 2) < 34) continue;
          ctx.fillStyle = "rgba(96,128,104,.35)";
          ctx.beginPath();
          ctx.arc(tx, ty, 4 + random() * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }

      // Building lots: split the block into a loose grid of footprints.
      const cols = Math.max(1, Math.round(w / 62));
      const rows = Math.max(1, Math.round(hgt / 62));
      const lotW = (w - 12) / cols, lotH = (hgt - 12) / rows;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (random() < 0.14) continue; // the odd parking lot
          const bw = lotW * (0.55 + random() * 0.35);
          const bh = lotH * (0.55 + random() * 0.35);
          const bx = x0 + 6 + c * lotW + random() * (lotW - bw);
          const by = y0 + 6 + r * lotH + random() * (lotH - bh);
          ctx.fillStyle = (r + c) % 2 ? "rgba(137,149,151,.12)" : "rgba(8,17,25,.2)";
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = "rgba(180,190,188,.08)";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        }
      }
    }
  }

  // Marina piers and moored boats off Ocean Drive.
  const piers = [
    ...[-440, -416, -392, -368].map((z) => ({ z, len: 44 })),
    ...[-196, -172, -148].map((z) => ({ z, len: 32 })),
  ];
  for (const { z, len } of piers) {
    const a = worldToMap({ x: SHORE_X - len, z });
    const b = worldToMap({ x: SHORE_X, z });
    ctx.strokeStyle = "#5d686f";
    ctx.lineWidth = 5;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    for (const side of [-1, 1]) {
      if (random() < 0.3) continue;
      const bx = a.px + 8 + random() * (b.px - a.px - 18);
      ctx.save();
      ctx.translate(bx, a.py + side * 9);
      ctx.fillStyle = "rgba(170,178,180,.4)";
      ctx.beginPath();
      ctx.moveTo(-8, -3);
      ctx.lineTo(5, -3);
      ctx.lineTo(9, 0);
      ctx.lineTo(5, 3);
      ctx.lineTo(-8, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.fillStyle = "rgba(217,222,211,.16)";
  ctx.font = `italic 800 18px ${FONT_DISPLAY}`;
  ctx.letterSpacing = "5px";
  ctx.save();
  ctx.translate(MAP.left + 30, MAP.top + MAP.size * 0.52);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("SOLANA BAY", 0, 0);
  ctx.restore();
  ctx.letterSpacing = "0px";

  // Roads: only the real grid. Avenues run between the outer streets and
  // streets between the outer avenues; round caps close the corners.
  const roadWidth = h * 2 * PX_PER_UNIT;
  const A0 = AVENUES[0], A1 = AVENUES[AVENUES.length - 1];
  const S0 = STREETS[0], S1 = STREETS[STREETS.length - 1];
  const roadLines: Array<[Point, Point]> = [
    ...AVENUES.map((x): [Point, Point] => [{ x, z: S0 }, { x, z: S1 }]),
    ...STREETS.map((z): [Point, Point] => [{ x: A0, z }, { x: A1, z }]),
  ];
  const strokeRoads = (width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const [from, to] of roadLines) {
      const a = worldToMap(from);
      const b = worldToMap(to);
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
    }
    ctx.stroke();
  };
  strokeRoads(roadWidth + 4, "#1c242d"); // kerb shadow
  strokeRoads(roadWidth, "#3a444e");
  strokeRoads(roadWidth * 0.62, "#5c666f");
  // Centre dashes per block, stopping short of each crossing.
  ctx.strokeStyle = "rgba(206,210,207,.3)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "butt";
  ctx.setLineDash([7, 9]);
  ctx.beginPath();
  for (const edge of EDGES) {
    const a = node(edge.a), b = node(edge.b);
    const ux = Math.sign(b.x - a.x), uz = Math.sign(b.z - a.z);
    const from = worldToMap({ x: a.x + ux * (h + 6), z: a.z + uz * (h + 6) });
    const to = worldToMap({ x: b.x - ux * (h + 6), z: b.z - uz * (h + 6) });
    ctx.moveTo(from.px, from.py);
    ctx.lineTo(to.px, to.py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Faint zebra crossings on every approach to a crossing.
  ctx.fillStyle = "rgba(220,224,220,.14)";
  for (const n of NODES) {
    const c = worldToMap(n);
    const off = (h + 3) * PX_PER_UNIT;
    const half = roadWidth * 0.36;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const neighbour = { x: n.x + dx * BLOCK, z: n.z + dy * BLOCK };
      if (neighbour.x < A0 || neighbour.x > A1 || neighbour.z < S0 || neighbour.z > S1) continue;
      for (let k = -half; k <= half; k += 5) {
        if (dx === 0) ctx.fillRect(c.px + k - 1.2, c.py + dy * off - 2.5, 2.4, 5);
        else ctx.fillRect(c.px + dx * off - 2.5, c.py + k - 1.2, 5, 2.4);
      }
    }
  }

  // District labels stay deliberately faint under player ink.
  ctx.fillStyle = "rgba(201,207,214,.17)";
  ctx.font = `italic 800 17px ${FONT_DISPLAY}`;
  ctx.textAlign = "center";
  ctx.letterSpacing = "4px";
  const mid = (i: number, list: readonly number[]) => (list[i] + list[i + 1]) / 2;
  const districts: Array<[number, number, string]> = [
    [mid(0, AVENUES), mid(0, STREETS), "OLD TOWN"],
    [mid(1, AVENUES), mid(0, STREETS), "MARKET"],
    [mid(2, AVENUES), mid(0, STREETS), "RAIL YARD"],
    [mid(0, AVENUES), mid(1, STREETS), "PIER SIDE"],
    [mid(1, AVENUES), mid(1, STREETS) + 50, "THE PLAZA"],
    [mid(2, AVENUES), mid(1, STREETS), "PALM HEIGHTS"],
    [mid(0, AVENUES), mid(2, STREETS), "SUNDOWN ROW"],
    [mid(1, AVENUES), mid(2, STREETS), "BEACHFRONT"],
    [mid(2, AVENUES), mid(2, STREETS), "NEON STRIP"],
    [mid(0, AVENUES), S0 - 42, "HARBOR"],
  ];
  for (const [x, z, label] of districts) {
    const p = worldToMap({ x, z });
    ctx.fillText(label, p.px, p.py + 6);
  }

  // Street names ride on the road surface, in mid-block stretches free of blips.
  ctx.fillStyle = "rgba(226,230,232,.78)";
  ctx.font = `700 11px ${FONT_BODY}`;
  ctx.letterSpacing = "1.5px";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const streetLabelX: Record<number, number> = {
    [STREETS[0]]: mid(1, AVENUES) - 30,
    [STREETS[1]]: mid(2, AVENUES),
    [STREETS[2]]: mid(1, AVENUES),
    [STREETS[3]]: mid(1, AVENUES),
  };
  const avenueLabelZ: Record<number, number> = {
    [AVENUES[0]]: mid(0, STREETS) + 25,
    [AVENUES[1]]: mid(2, STREETS),
    [AVENUES[2]]: STREETS[1] + 38,
    [AVENUES[3]]: mid(2, STREETS),
  };
  for (const z of STREETS) {
    const p = worldToMap({ x: streetLabelX[z], z });
    ctx.fillText(PLAN_STREETS.streets[z], p.px, p.py + 0.5);
  }
  for (const x of AVENUES) {
    const p = worldToMap({ x, z: avenueLabelZ[x] });
    ctx.save();
    ctx.translate(p.px + 0.5, p.py);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(PLAN_STREETS.avenues[x], 0, 0);
    ctx.restore();
  }
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";
  ctx.restore();

  for (const landmark of landmarks("camera")) drawCamera(ctx, landmark);
  for (const landmark of landmarks("stash")) drawStash(ctx, landmark);
  for (const landmark of landmarks("respray")) drawSpray(ctx, landmark);
  for (const landmark of landmarks("drop")) drawDrop(ctx, landmark);
  drawGarage(ctx, landmarks("garage")[0]);
  drawMapFrame(ctx);
  drawLegend(ctx);
  return canvas.toDataURL("image/png");
}

/** Preloads map typography when available; font failure must never block play. */
export async function loadPlanFonts(): Promise<void> {
  try {
    if (typeof document === "undefined" || !document.fonts) return;
    await Promise.all([
      document.fonts.load('italic 900 48px "Barlow Condensed"'),
      document.fonts.load('800 24px "Barlow Condensed"'),
      document.fonts.load('600 16px "DM Sans"'),
    ]);
  } catch {
    // Browser/font-network failures fall back to the canvas font stacks.
  }
}

type InkClass = "stash" | "route" | "note";

/** Base-colour neighbourhood radius (px) that absorbs resampling shifts. */
const NEIGHBOURHOOD = 2;
/** Summed per-channel distance outside the neighbourhood range that counts as ink. */
const INK_DELTA = 64;
/** Minimum kept samples (at step 2) before a class counts as intentional ink. */
const MIN_ROUTE_SAMPLES = 60;
const MIN_STASH_SAMPLES = 16;
const MIN_NOTE_ROUTE_SAMPLES = 400;

/** Yellow → stash; white/grey/black (Unlayer "Notes" text) → note; else route. */
function classifyInk(red: number, green: number, blue: number): InkClass {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const saturation = max === 0 ? 0 : delta / max;
  if (hue >= 38 && hue <= 72 && saturation >= 0.5 && max >= 0.5) return "stash";
  if (saturation < 0.25 || max < 0.22) return "note";
  return "route";
}

/** Detects new, locally-supported coloured ink without requiring browser APIs. */
export function analyzeInk(
  base: Uint8ClampedArray,
  edited: Uint8ClampedArray,
  width: number,
  height: number,
  step = 2,
): InkAnalysis {
  if (width <= 0 || height <= 0 || step <= 0 || base.length !== edited.length || base.length !== width * height * 4) {
    return { route: [], stash: [], routePixels: 0, stashPixels: 0 };
  }
  const sx = MAP.width / width;
  const sy = MAP.height / height;
  const candidates = new Map<string, { x: number; y: number; index: number }>();
  const firstX = Math.max(0, Math.ceil(MAP.left / (sx * step)) * step);
  const lastX = Math.min(width - 1, Math.floor((MAP.left + MAP.size) / (sx * step)) * step);
  const firstY = Math.max(0, Math.ceil(MAP.top / (sy * step)) * step);
  const lastY = Math.min(height - 1, Math.floor((MAP.top + MAP.size) / (sy * step)) * step);

  // A sample is ink when the edited colour falls outside the per-channel
  // colour range of the base pixels around it. Resampling, blur and JPEG
  // only ever MIX neighbouring base colours (which stay inside that range),
  // so labels and icon edges survive an Unlayer re-export; new paint doesn't.
  for (let y = firstY; y <= lastY; y += step) {
    for (let x = firstX; x <= lastX; x += step) {
      const editedIndex = (y * width + x) * 4;
      let r0 = 255, g0 = 255, b0 = 255, r1 = 0, g1 = 0, b1 = 0;
      for (let oy = -NEIGHBOURHOOD; oy <= NEIGHBOURHOOD; oy += 1) {
        const by = clamp(y + oy, 0, height - 1);
        for (let ox = -NEIGHBOURHOOD; ox <= NEIGHBOURHOOD; ox += 1) {
          const bi = (by * width + clamp(x + ox, 0, width - 1)) * 4;
          const r = base[bi], g = base[bi + 1], b = base[bi + 2];
          if (r < r0) r0 = r;
          if (r > r1) r1 = r;
          if (g < g0) g0 = g;
          if (g > g1) g1 = g;
          if (b < b0) b0 = b;
          if (b > b1) b1 = b;
        }
      }
      const er = edited[editedIndex], eg = edited[editedIndex + 1], eb = edited[editedIndex + 2];
      const outside =
        Math.max(0, er - r1, r0 - er) + Math.max(0, eg - g1, g0 - eg) + Math.max(0, eb - b1, b0 - eb);
      if (outside > INK_DELTA) candidates.set(`${x}:${y}`, { x, y, index: editedIndex });
    }
  }

  const route: Point[] = [];
  const stash: Point[] = [];
  const notes: Point[] = [];
  for (const candidate of candidates.values()) {
    let neighbours = 0;
    for (let oy = -step; oy <= step; oy += step) {
      for (let ox = -step; ox <= step; ox += step) {
        if ((ox || oy) && candidates.has(`${candidate.x + ox}:${candidate.y + oy}`)) neighbours += 1;
      }
    }
    if (neighbours < 2) continue;
    const point = mapToWorld(candidate.x * sx, candidate.y * sy);
    const kind = classifyInk(
      edited[candidate.index],
      edited[candidate.index + 1],
      edited[candidate.index + 2],
    );
    (kind === "stash" ? stash : kind === "note" ? notes : route).push(point);
  }
  // Tiny amounts are export noise, not a plan (a real stroke from START to
  // the nearest drop is well over 1000 samples at step 2).
  const scale = (step / 2) ** 2;
  const keptStash = stash.length * scale >= MIN_STASH_SAMPLES ? stash : [];
  let keptRoute = route.length * scale >= MIN_ROUTE_SAMPLES ? route : [];
  let keptNotes = notes;
  // Colourless ink only counts as a route when it is the only ink there is
  // (someone drew their getaway in white or black).
  if (!keptRoute.length && notes.length * scale >= MIN_NOTE_ROUTE_SAMPLES) {
    keptRoute = notes;
    keptNotes = [];
  }
  return {
    route: keptRoute,
    stash: keptStash,
    routePixels: keptRoute.length,
    stashPixels: keptStash.length,
    notePixels: keptNotes.length,
  };
}

function spatialCell(value: number, cellSize: number) {
  return Math.floor(value / cellSize);
}

/** Returns road edges substantially covered by the player's route samples. */
export function drawnEdgeKeys(route: Point[]): Set<string> {
  const result = new Set<string>();
  if (!route.length) return result;
  const cellSize = EDGE_INK_RADIUS;
  const hash = new Map<string, Point[]>();
  for (const point of route) {
    const key = `${spatialCell(point.x, cellSize)}:${spatialCell(point.z, cellSize)}`;
    const bucket = hash.get(key);
    if (bucket) bucket.push(point);
    else hash.set(key, [point]);
  }
  const covered = (sample: Point) => {
    const cx = spatialCell(sample.x, cellSize);
    const cz = spatialCell(sample.z, cellSize);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bucket = hash.get(`${cx + dx}:${cz + dz}`);
        if (bucket?.some((p) => Math.hypot(p.x - sample.x, p.z - sample.z) <= EDGE_INK_RADIUS)) return true;
      }
    }
    return false;
  };
  for (const edge of EDGES) {
    const a = node(edge.a);
    const b = node(edge.b);
    const segments = Math.ceil(edge.length / EDGE_SAMPLE_SPACING);
    let hits = 0;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      if (covered({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) hits += 1;
    }
    if (hits / (segments + 1) >= EDGE_DRAWN_SHARE) result.add(edgeKey(edge.a, edge.b));
  }
  return result;
}

function pathCost(path: string[], weight: (edge: Edge) => number) {
  let cost = 0;
  for (let i = 1; i < path.length; i += 1) {
    const key = edgeKey(path[i - 1], path[i]);
    const edge = EDGES.find((candidate) => edgeKey(candidate.a, candidate.b) === key);
    if (edge) cost += weight(edge);
  }
  return cost;
}

function destinationForInk(points: Point[], weight: (edge: Edge) => number) {
  const drops = landmarks("drop");
  const scored = drops.map((drop) => ({
    drop,
    count: points.filter((point) => Math.hypot(point.x - drop.x, point.z - drop.z) <= DROP_INK_RADIUS).length,
  }));
  const maxCount = Math.max(0, ...scored.map((entry) => entry.count));
  // A real stroke through a drop leaves dozens of samples within the radius;
  // a stray pin or text glyph leaves a handful.
  const threshold = Math.max(12, maxCount * 0.25);
  const candidates = scored.filter((entry) => entry.count >= threshold);
  if (candidates.length) {
    candidates.sort((a, b) => {
      const aPath = shortestPath(GARAGE_NODE, a.drop.node!, weight);
      const bPath = shortestPath(GARAGE_NODE, b.drop.node!, weight);
      return pathCost(bPath, weight) - pathCost(aPath, weight) || b.count - a.count;
    });
    return candidates[0].drop;
  }

  const garage = node(GARAGE_NODE);
  let farthest = points[0] ?? garage;
  let farthestDistance = -1;
  for (const point of points) {
    const distance = Math.hypot(point.x - garage.x, point.z - garage.z);
    if (distance > farthestDistance) {
      farthest = point;
      farthestDistance = distance;
    }
  }
  return drops.reduce((best, drop) =>
    Math.hypot(drop.x - farthest.x, drop.z - farthest.z) < Math.hypot(best.x - farthest.x, best.z - farthest.z)
      ? drop
      : best,
  );
}

function markedStashes(stashInk: Point[]) {
  return landmarks("stash").filter((crate) => {
    if (stashInk.some((point) => Math.hypot(point.x - crate.x, point.z - crate.z) <= STASH_INK_RADIUS)) return true;
    let quadrants = 0;
    for (const [xSign, zSign] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      if (stashInk.some((point) => {
        const dx = point.x - crate.x;
        const dz = point.z - crate.z;
        return dx * xSign >= 0 && dz * zSign >= 0 && Math.hypot(dx, dz) <= STASH_RING_RADIUS;
      })) quadrants += 1;
    }
    return quadrants >= 3;
  });
}

/** Snaps analyzed ink to the city graph and constructs a playable mission. */
export function missionFromInk(ink: InkAnalysis): Mission {
  if (
    ink.routePixels + ink.stashPixels === 0 ||
    (ink.route.length === 0 && ink.stash.length === 0)
  ) {
    return {
      ...defaultMission(),
      notes: [
        "Blank map? Fine. My route: straight up the west side to the Marina.",
        "Try drawing next time. It’s cheaper than improvising.",
      ],
      fromDrawing: false,
    };
  }

  const drawn = drawnEdgeKeys(ink.route);
  // A short scribble that covers no road and goes nowhere is not a plan.
  const garagePoint = NODES.find((n) => n.id === GARAGE_NODE)!;
  const reach = ink.route.reduce(
    (best, p) => Math.max(best, Math.hypot(p.x - garagePoint.x, p.z - garagePoint.z)),
    0,
  );
  if (drawn.size === 0 && reach < 90 && ink.stash.length === 0) {
    return {
      ...defaultMission(),
      notes: [
        "That scribble doesn’t go anywhere. Draw along the roads from START to a gold drop.",
        "Taking my route to the Marina for now.",
      ],
      fromDrawing: false,
    };
  }
  const weight = (edge: Edge) => edge.length * (drawn.has(edgeKey(edge.a, edge.b)) ? 0.25 : 4);
  const destinationPoints = ink.route.length ? ink.route : ink.stash;
  const destination = destinationForInk(destinationPoints, weight);
  const path = shortestPath(GARAGE_NODE, destination.node!, weight);
  let pathLength = 0;
  let drawnLength = 0;
  for (let i = 1; i < path.length; i += 1) {
    const key = edgeKey(path[i - 1], path[i]);
    const edge = EDGES.find((candidate) => edgeKey(candidate.a, candidate.b) === key);
    if (!edge) continue;
    pathLength += edge.length;
    if (drawn.has(key)) drawnLength += edge.length;
  }
  const drawnShare = clamp(pathLength ? drawnLength / pathLength : 0, 0, 1);
  const stashes = markedStashes(ink.stash);
  const mission = missionFromPath(path, destination, {
    stashes,
    drawnShare,
    notes: [],
    fromDrawing: true,
  });

  const destinationNotes: Record<string, string> = {
    marina: "Marina Meet. Quiet docks, loud exit. I like it.",
    causeway: "Causeway Lot. Bold. I like it.",
    motel: "Palm Motel. Subtle as a neon alibi.",
  };
  const cameraCount = mission.camerasOnRoute.length;
  const notes = [destinationNotes[destination.id] ?? `${destination.name}. Bold. I like it.`];
  if (cameraCount === 0) notes.push("Zero cameras. Bay PD will only catch you on patrol — maybe.");
  else if (cameraCount === 1) notes.push("One camera on that route. Smile for Bay PD.");
  else if (cameraCount === 2) notes.push("Two cameras on that route. You’ll be famous.");
  else notes.push(`${cameraCount} cameras? That’s not a getaway, that’s a premiere.`);
  if (ink.route.length === 0) notes.push("No route line, so I picked the roads. You just grab the goods.");
  else if (drawnShare < 0.2) notes.push("You drew through buildings. I snapped it to real streets.");
  else if (drawnShare < 0.97) notes.push("Your route had gaps. I filled them in.");
  if (stashes.length > 0) {
    const plural = stashes.length > 1;
    notes.push(`${stashes.length} crate${plural ? "s" : ""} circled. Grab ${plural ? "them" : "it"} and the payout sweetens.`);
  } else if (ink.stashPixels > 0 || ink.stash.length > 0) {
    notes.push("That yellow missed every crate. Circle tighter next time.");
  }
  while (notes.length > 4) notes.shift();
  return { ...mission, notes };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load plan image"));
    image.src = url;
    if (typeof image.decode === "function") {
      image.decode().then(() => resolve(image)).catch(() => {
        // Some browsers reject decode for data URLs but still fire onload.
      });
    }
  });
}

/** Reads editor images and always resolves to a playable mission. */
export async function planFromImages(baseUrl: string, editedUrl: string): Promise<Mission> {
  try {
    const [baseImage, editedImage] = await Promise.all([loadImage(baseUrl), loadImage(editedUrl)]);
    const pixels = [baseImage, editedImage].map((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = MAP.width;
      canvas.height = MAP.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D is unavailable");
      ctx.drawImage(image, 0, 0, MAP.width, MAP.height);
      return ctx.getImageData(0, 0, MAP.width, MAP.height).data;
    });
    return missionFromInk(analyzeInk(pixels[0], pixels[1], MAP.width, MAP.height));
  } catch {
    return {
      ...defaultMission(),
      notes: ["Couldn’t read your map. Take my route."],
      fromDrawing: false,
    };
  }
}
