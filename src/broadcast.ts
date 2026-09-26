// Bay 9 broadcast composition: the 1600×900 "news frame" that the News screen
// saves and that the Signal Hijack mode hands to Unlayer to deface.

export type BroadcastInput = {
  alias: string;
  headline: string;
  cctv: string;
  before: string;
  after: string;
  changed: number;
  emblem?: string;
  score: number;
};

export const BROADCAST_WIDTH = 1600;
export const BROADCAST_HEIGHT = 900;

function img(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!url) return resolve(null);
    const i = new Image();
    i.decoding = "async";
    // Remote art must come with CORS or it would taint the canvas and make
    // toDataURL throw; without CORS it simply fails to load and is skipped.
    if (!/^(data|blob):/i.test(url)) i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = url;
  });
}

function cover(
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = im.naturalWidth || im.width,
    ih = im.naturalHeight || im.height;
  if (!iw || !ih) return;
  const r = Math.max(w / iw, h / ih);
  const sw = w / r,
    sh = h / r;
  ctx.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  lh: number,
) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

/** Largest font size (px) at which `text` fits on one line of `max` width. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  family: string,
  start: number,
  min: number,
  max: number,
) {
  let size = start;
  for (; size > min; size -= 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= max) break;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

async function fontsReady() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("900 40px 'Barlow Condensed'"),
        document.fonts.load("700 24px 'DM Sans'"),
      ]),
      new Promise((r) => setTimeout(r, 1200)),
    ]);
  } catch {
    /* fonts are a nicety; the fallback stack still reads fine */
  }
}

/**
 * Render the Bay 9 "breaking news" frame (anchor desk, CCTV inset, before/after
 * paint, lower third, crawl) and return it as a 1600×900 PNG data URL.
 */
export async function composeBroadcast(input: BroadcastInput): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("composeBroadcast can only run in a browser.");
  }
  const c = document.createElement("canvas");
  c.width = BROADCAST_WIDTH;
  c.height = BROADCAST_HEIGHT;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("composeBroadcast: 2D canvas is unavailable.");
  const changed = Number.isFinite(input.changed) ? Math.max(0, Math.min(1, input.changed)) : 0;
  const score = Number.isFinite(input.score) ? Math.round(input.score) : 0;
  const [bg, cctv, before, after, crest] = await Promise.all([
    img("/art/anchor.webp"),
    img(input.cctv),
    img(input.before),
    img(input.after),
    img(input.emblem ?? ""),
    fontsReady(),
  ]);

  const g = ctx.createLinearGradient(0, 0, 1600, 900);
  g.addColorStop(0, "#2a1140");
  g.addColorStop(1, "#ff6a3d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1600, 900);
  if (bg) cover(ctx, bg, 0, 0, 1600, 900);

  // Inset monitor.
  ctx.fillStyle = "#0b0714";
  ctx.fillRect(868, 110, 680, 420);
  if (cctv) {
    ctx.filter = "grayscale(0.85) contrast(1.25) brightness(0.95)";
    cover(ctx, cctv, 880, 122, 656, 396);
    ctx.filter = "none";
  } else {
    ctx.fillStyle = "#1b1726";
    ctx.fillRect(880, 122, 656, 396);
    ctx.fillStyle = "#6d6780";
    ctx.font = "700 26px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("NO SIGNAL", 1208, 330);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = "rgba(0,0,0,.18)";
  for (let y = 122; y < 518; y += 4) ctx.fillRect(880, y, 656, 1);
  ctx.fillStyle = "#ff3344";
  ctx.beginPath();
  ctx.arc(906, 150, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 22px ui-monospace, Menlo, monospace";
  ctx.fillText("CAM 04 · NORTH PIER · 19:44", 924, 158);

  // Before / after paint.
  const boxes: [HTMLImageElement | null, string][] = [
    [before, "PAINT THEY SAW"],
    [after ?? before, after ? "PAINT NOW" : "STILL THE SAME"],
  ];
  boxes.forEach(([im, label], i) => {
    const x = 880 + i * 340;
    ctx.fillStyle = "#0b0714";
    ctx.fillRect(x - 6, 548, 328, 176);
    if (im) cover(ctx, im, x, 554, 316, 140);
    ctx.fillStyle = "#fff";
    ctx.font = "700 18px ui-monospace, Menlo, monospace";
    ctx.fillText(label, x, 716);
  });
  if (after) {
    ctx.save();
    ctx.translate(1208, 624);
    ctx.rotate(-0.08);
    ctx.fillStyle = "#ff2e88";
    ctx.fillRect(-120, -34, 240, 68);
    ctx.fillStyle = "#fff";
    ctx.font = "900 40px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(changed * 100)}% NEW`, 0, 14);
    ctx.restore();
  }

  // Logo.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(52, 44, 190, 64);
  ctx.fillStyle = "#e3163b";
  ctx.fillRect(242, 44, 92, 64);
  ctx.font = "900 46px 'Barlow Condensed', Impact, sans-serif";
  ctx.fillStyle = "#101022";
  ctx.fillText("BAY", 74, 94);
  ctx.fillStyle = "#fff";
  ctx.fillText("9", 274, 94);
  ctx.fillStyle = "#e3163b";
  ctx.fillRect(356, 56, 94, 40);
  ctx.fillStyle = "#fff";
  ctx.font = "800 24px 'Barlow Condensed', Impact, sans-serif";
  ctx.fillText("● LIVE", 368, 85);
  if (crest) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(500, 76, 34, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(crest, 466, 42, 68, 68);
    ctx.restore();
  }

  // Lower third.
  ctx.fillStyle = "#e3163b";
  ctx.fillRect(0, 752, 230, 58);
  ctx.fillStyle = "#fff";
  ctx.font = "900 34px 'Barlow Condensed', Impact, sans-serif";
  ctx.fillText("BREAKING", 44, 794);
  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.fillRect(230, 752, 1370, 58);
  ctx.fillStyle = "#101022";
  // Headlines are one line in the frame; shrink long ones instead of spilling
  // into the crawl below.
  fitFont(ctx, input.headline, "900", "'Barlow Condensed', Impact, sans-serif", 34, 22, 1320);
  if (ctx.measureText(input.headline).width > 1320) {
    wrapText(ctx, input.headline, 256, 778, 1320, 26);
  } else {
    ctx.fillText(input.headline, 256, 794);
  }

  // Crawl.
  ctx.fillStyle = "#101022";
  ctx.fillRect(0, 810, 1600, 90);
  ctx.fillStyle = "#ffd36b";
  const crawl = `SUSPECT: “${input.alias}” · VEHICLE: SOLSTICE ’87 · PAYOUT $${score.toLocaleString("en-US")} · #BuiltWithImageEditor`;
  fitFont(ctx, crawl, "700", "'DM Sans', sans-serif", 24, 16, 1512);
  ctx.fillText(crawl, 44, 864);

  return c.toDataURL("image/png");
}
