export type WrapStyle = "club" | "racer" | "outlaw";

export interface RunCardOptions {
  snapshot: string;
  wrap: string;
  alias: string;
  score: number | string;
  time: number | string;
  drift: number | string;
  won: boolean;
}

const TAU = Math.PI * 2;

function requireCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error(
      "Sundown Customs artwork can only be rendered in a browser.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function polygon(
  ctx: CanvasRenderingContext2D,
  points: readonly [number, number][],
): void {
  ctx.beginPath();
  points.forEach(([x, y], index) =>
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
  );
  ctx.closePath();
  ctx.fill();
}

function line(
  ctx: CanvasRenderingContext2D,
  points: readonly [number, number][],
): void {
  ctx.beginPath();
  points.forEach(([x, y], index) =>
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
  );
  ctx.stroke();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 700,
  align: CanvasTextAlign = "left",
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function addGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
): void {
  // Deterministic, low-opacity print grain keeps each livery feeling screen-printed without assets.
  ctx.save();
  ctx.globalAlpha = 0.075;
  ctx.fillStyle = color;
  let seed = 941;
  for (let i = 0; i < 1200; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = (seed >>> 8) % width;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = (seed >>> 8) % height;
    const size = 1 + (seed % 3);
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawClub(ctx: CanvasRenderingContext2D): void {
  const coral = "#e65d4f";
  const coralDark = "#b9343b";
  const cream = "#f7e4c1";
  const ink = "#172b36";

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, 1200, 600);
  ctx.fillStyle = coral;
  polygon(ctx, [
    [0, 0],
    [1200, 0],
    [980, 600],
    [0, 600],
  ]);
  ctx.fillStyle = ink;
  polygon(ctx, [
    [330, 0],
    [472, 0],
    [280, 600],
    [138, 600],
  ]);
  ctx.fillStyle = coralDark;
  polygon(ctx, [
    [510, 0],
    [590, 0],
    [435, 600],
    [356, 600],
  ]);
  ctx.fillStyle = cream;
  polygon(ctx, [
    [625, 0],
    [752, 0],
    [590, 600],
    [466, 600],
  ]);

  // Warm rising-sun medallion and fine latitude lines.
  ctx.save();
  ctx.translate(825, 304);
  ctx.fillStyle = coral;
  ctx.beginPath();
  ctx.arc(0, 0, 132, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = cream;
  ctx.lineWidth = 11;
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, 132 - i * 23, Math.PI, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = coralDark;
  ctx.lineWidth = 7;
  for (let i = -4; i <= 4; i += 1) {
    line(ctx, [
      [i * 25, 0],
      [i * 44, -170],
    ]);
  }
  ctx.restore();

  ctx.save();
  ctx.rotate(-0.07);
  label(ctx, "SUNSET", 75, 150, 76, cream, 900);
  label(ctx, "CLUB", 79, 218, 76, ink, 900);
  ctx.restore();
  label(ctx, "COASTAL MOTOR WORKS", 78, 505, 22, ink, 800);
  label(ctx, "S / 06", 1095, 535, 28, cream, 900, "right");
  ctx.strokeStyle = cream;
  ctx.lineWidth = 5;
  line(ctx, [
    [76, 460],
    [322, 460],
  ]);
}

function drawRacer(ctx: CanvasRenderingContext2D): void {
  const teal = "#22b7ae";
  const tealLight = "#7be0d0";
  const black = "#11191d";
  const cream = "#f2e7ca";
  const orange = "#f36e4e";

  ctx.fillStyle = black;
  ctx.fillRect(0, 0, 1200, 600);
  ctx.fillStyle = teal;
  polygon(ctx, [
    [0, 95],
    [1200, 0],
    [1200, 142],
    [0, 247],
  ]);
  ctx.fillStyle = cream;
  polygon(ctx, [
    [0, 280],
    [1200, 174],
    [1200, 218],
    [0, 330],
  ]);
  ctx.fillStyle = orange;
  polygon(ctx, [
    [0, 360],
    [1200, 253],
    [1200, 277],
    [0, 389],
  ]);
  ctx.fillStyle = teal;
  polygon(ctx, [
    [0, 427],
    [1200, 335],
    [1200, 600],
    [0, 600],
  ]);

  // Small checker rail gives the strip a real race-bred seam.
  const tile = 34;
  ctx.fillStyle = cream;
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 36; column += 1) {
      if ((row + column) % 2 === 0)
        ctx.fillRect(30 + column * tile, 486 + row * tile, tile, tile);
    }
  }

  ctx.save();
  ctx.translate(790, 285);
  ctx.rotate(-0.09);
  ctx.fillStyle = black;
  ctx.strokeStyle = cream;
  ctx.lineWidth = 10;
  ctx.font = '900 270px "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText("07", 0, 0);
  ctx.fillText("07", 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = tealLight;
  ctx.strokeText("07", 0, 0);
  ctx.restore();

  label(ctx, "NIGHT RUNNER", 70, 115, 62, cream, 900);
  label(ctx, "TEAL / BLACK SPEC · 07", 75, 177, 22, black, 900);
  label(ctx, "SUNDOWN CUSTOMS", 80, 553, 24, black, 900);
  ctx.strokeStyle = black;
  ctx.lineWidth = 8;
  line(ctx, [
    [79, 204],
    [385, 180],
  ]);
}

function drawOutlaw(ctx: CanvasRenderingContext2D): void {
  const ink = "#17212b";
  const cream = "#f7e8c7";
  const rust = "#d15343";
  const blue = "#254d5e";

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, 1200, 600);
  ctx.fillStyle = ink;
  polygon(ctx, [
    [0, 0],
    [1200, 0],
    [1200, 110],
    [0, 325],
  ]);
  ctx.fillStyle = rust;
  polygon(ctx, [
    [0, 338],
    [1200, 118],
    [1200, 184],
    [0, 420],
  ]);
  ctx.fillStyle = blue;
  polygon(ctx, [
    [0, 440],
    [1200, 215],
    [1200, 257],
    [0, 488],
  ]);

  // Layered hand-drawn flame wave: broad silhouette plus cream cut-outs.
  ctx.save();
  ctx.translate(80, 120);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(0, 240);
  ctx.bezierCurveTo(115, 120, 130, 42, 202, 0);
  ctx.bezierCurveTo(186, 98, 261, 75, 318, 18);
  ctx.bezierCurveTo(302, 112, 392, 112, 470, 50);
  ctx.bezierCurveTo(444, 150, 586, 152, 696, 100);
  ctx.bezierCurveTo(590, 198, 520, 234, 404, 245);
  ctx.bezierCurveTo(274, 259, 210, 292, 0, 320);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = cream;
  ctx.beginPath();
  ctx.moveTo(66, 260);
  ctx.bezierCurveTo(173, 184, 204, 118, 237, 77);
  ctx.bezierCurveTo(230, 149, 274, 148, 327, 91);
  ctx.bezierCurveTo(307, 176, 394, 174, 460, 139);
  ctx.bezierCurveTo(393, 215, 311, 214, 230, 235);
  ctx.bezierCurveTo(165, 252, 114, 271, 66, 260);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.rotate(-0.04);
  label(ctx, "OUTLAW", 765, 430, 84, cream, 900);
  label(ctx, "FLAME / WAVE", 773, 493, 22, ink, 900);
  ctx.restore();
  label(ctx, "NO RULES · COASTAL GARAGE", 76, 548, 23, ink, 900);
  ctx.strokeStyle = rust;
  ctx.lineWidth = 8;
  line(ctx, [
    [78, 505],
    [360, 465],
  ]);
}

/** Creates one of three original 1200 × 600 car-livery strips as a PNG data URL. */
export function createWrap(style: WrapStyle): string {
  const canvas = requireCanvas(1200, 600);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (style === "club") drawClub(ctx);
  else if (style === "racer") drawRacer(ctx);
  else drawOutlaw(ctx);
  addGrain(ctx, 1200, 600, "#ffffff");
  return canvas.toDataURL("image/png");
}

export function downloadImage(dataUrl: string, filename: string): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not load the run-card image."));
    image.src = source;
  });
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

/** Downloads a 1600 × 1200 fictional garage card with the exact saved snapshot and wrap. */
export async function downloadRunCard(options: RunCardOptions): Promise<void> {
  const [snapshot, wrap] = await Promise.all([
    loadImage(options.snapshot),
    loadImage(options.wrap),
  ]);
  const canvas = requireCanvas(1600, 1200);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const navy = "#101d2b";
  const cream = "#f6e5c4";
  const coral = "#e65d4f";
  const teal = "#36c3b3";
  const muted = "#8ea6ab";

  const background = ctx.createLinearGradient(0, 0, 1600, 1200);
  background.addColorStop(0, "#172d3b");
  background.addColorStop(0.58, navy);
  background.addColorStop(1, "#0a131d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1600, 1200);
  ctx.fillStyle = coral;
  ctx.fillRect(0, 0, 1600, 18);
  ctx.fillStyle = teal;
  ctx.fillRect(0, 18, 410, 8);

  label(ctx, "SUNDOWN CUSTOMS", 88, 86, 40, cream, 900);
  label(ctx, "COASTAL GARAGE / RUN CARD", 90, 132, 19, teal, 800);
  label(ctx, "ARCHIVE  ·  24 / 09 / 26", 1510, 92, 20, muted, 800, "right");
  ctx.strokeStyle = "rgba(246,229,196,.22)";
  ctx.lineWidth = 2;
  line(ctx, [
    [88, 170],
    [1512, 170],
  ]);

  ctx.fillStyle = "#0a141f";
  roundedRect(ctx, 88, 214, 1424, 500, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(246,229,196,.3)";
  ctx.lineWidth = 2;
  roundedRect(ctx, 88, 214, 1424, 500, 22);
  ctx.stroke();
  drawImageContain(
    ctx,
    snapshot,
    snapshot.naturalWidth || 16,
    snapshot.naturalHeight || 9,
    112,
    238,
    1376,
    452,
  );
  ctx.strokeStyle = coral;
  ctx.lineWidth = 5;
  ctx.strokeRect(112, 238, 1376, 452);
  label(
    ctx,
    options.won ? "RUN CLEARED" : "RUN LOGGED",
    136,
    674,
    18,
    options.won ? teal : coral,
    900,
  );

  label(ctx, "THE WRAP", 88, 774, 20, muted, 800);
  ctx.fillStyle = "#0a141f";
  roundedRect(ctx, 88, 810, 1424, 224, 18);
  ctx.fill();
  drawImageContain(
    ctx,
    wrap,
    wrap.naturalWidth || 2,
    wrap.naturalHeight || 1,
    108,
    830,
    1384,
    184,
  );
  ctx.strokeStyle = "rgba(246,229,196,.3)";
  ctx.lineWidth = 2;
  roundedRect(ctx, 88, 810, 1424, 224, 18);
  ctx.stroke();

  label(ctx, options.alias.trim() || "NIGHT DRIVER", 88, 1100, 48, cream, 900);
  const elapsed =
    typeof options.time === "number" ? options.time.toFixed(1) : options.time;
  const drift =
    typeof options.drift === "number"
      ? Math.round(options.drift)
      : options.drift;
  const stats = `SCORE ${options.score}   ·   TIME ${elapsed}s   ·   DRIFT ${drift}`;
  label(ctx, stats, 1512, 1098, 20, teal, 800, "right");
  label(
    ctx,
    "FICTIONAL COASTAL GARAGE / BUILT FOR THE RUN",
    88,
    1152,
    17,
    muted,
    800,
  );
  label(ctx, "KEEP THE STREET MOVING", 1512, 1152, 17, coral, 900, "right");
  addGrain(ctx, 1600, 1200, "#ffffff");

  downloadImage(
    canvas.toDataURL("image/png"),
    `sundown-${(options.alias.trim() || "driver").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-run-card.png`,
  );
}
