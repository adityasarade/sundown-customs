import { useMemo, useState } from "react";
import { ArrowRight, Camera, Download, RotateCcw } from "lucide-react";
import type { RunResult } from "./World";
import { downloadImage } from "./artwork";

type Props = {
  alias: string;
  outcome: "passed" | "busted" | "failed";
  result: RunResult;
  cctv: string;
  before: string;
  after: string;
  changed: number;
  emblem?: string;
  onPhoto: () => void;
  onRetry: () => void;
};

function copy({ alias, outcome, result, after, changed }: Props) {
  const pct = Math.round(changed * 100);
  if (outcome === "busted")
    return {
      headline: `LOCAL MENACE “${alias}” IN CUSTODY. PAINT JOB SEIZED AS EVIDENCE.`,
      line: `“Officers say the suspect’s custom livery was ‘extremely memorable’, which, experts note, is the opposite of what you want. Back to you, Dana.”`,
    };
  if (outcome === "failed")
    return {
      headline: `DELIVERY DRIVER “${alias}” MISSES THE MEET. BLAMES THE SUNSET.`,
      line: `“The coupe was last seen admiring its own reflection near the marina. Nobody was impressed, except everyone. Back to you, Dana.”`,
    };
  if (after && !result.stars)
    return {
      headline: `MYSTERY COUPE VANISHES AFTER ${pct}% “MAKEOVER”.`,
      line: `“Police had a perfect description of the car. Then it was ${pct}% a different car. Chief Varga calls it ‘an insult to paint’. Back to you, Dana.”`,
    };
  return {
    headline: `CUSTOM COUPE LEADS BAY PD ON A ${result.stars}-STAR SUNSET TOUR.`,
    line: `“Witnesses describe the livery as ‘loud’, ‘personal’ and ‘honestly? kind of iconic’. Police are still looking for it. It’s very easy to spot. Back to you, Dana.”`,
  };
}

function img(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!url) return resolve(null);
    const i = new Image();
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
  const r = Math.max(w / im.width, h / im.height);
  const sw = w / r,
    sh = h / r;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
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

async function exportBroadcast(p: Props, headline: string) {
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 900;
  const ctx = c.getContext("2d")!;
  const [bg, cctv, before, after, crest] = await Promise.all([
    img("/art/anchor.webp"),
    img(p.cctv),
    img(p.before),
    img(p.after),
    img(p.emblem ?? ""),
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
    [after ?? before, p.after ? "PAINT NOW" : "STILL THE SAME"],
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
  if (p.after) {
    ctx.save();
    ctx.translate(1208, 624);
    ctx.rotate(-0.08);
    ctx.fillStyle = "#ff2e88";
    ctx.fillRect(-120, -34, 240, 68);
    ctx.fillStyle = "#fff";
    ctx.font = "900 40px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(p.changed * 100)}% NEW`, 0, 14);
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
  ctx.font = "900 34px 'Barlow Condensed', Impact, sans-serif";
  wrapText(ctx, headline, 256, 794, 1320, 36);
  ctx.fillStyle = "#101022";
  ctx.fillRect(0, 810, 1600, 90);
  ctx.fillStyle = "#ffd36b";
  ctx.font = "700 24px 'DM Sans', sans-serif";
  ctx.fillText(
    `SUSPECT: “${p.alias}” · VEHICLE: SOLSTICE ’87 · PAYOUT $${p.result.score.toLocaleString()} · #BuiltWithImageEditor`,
    44,
    864,
  );
  downloadImage(c.toDataURL("image/png"), "sundown-bay9-news.png");
}

export default function News(p: Props) {
  const { headline, line } = useMemo(() => copy(p), [p]);
  const [busy, setBusy] = useState(false);
  const pct = Math.round(p.changed * 100);
  const ticker = [
    `SOLANA BAY PD CONSIDERS BANNING THE COLOUR ORANGE`,
    `SPRAY & PRAY OWNER: “NEVER SEEN THAT CAR BEFORE IN MY LIFE”`,
    `MARINA CROWD RATES ${p.alias}’S LIVERY 10/10`,
    `PAYOUT REPORTED: $${p.result.score.toLocaleString()}`,
    `LOCAL SUNSET CONTINUES TO BE A SUNSET`,
    `TRAFFIC: EAST ROAD CLEAR, SUSPICIOUSLY`,
  ].join("  ◆  ");
  return (
    <section className={`news ${p.outcome}`}>
      <div className="news-bg" />
      <header className="news-top">
        <span className="news-logo">
          BAY<b>9</b>
        </span>
        <span className="news-live">● LIVE</span>
        <span className="news-place">SOLANA BAY · 19:48</span>
        {p.emblem && (
          <span className="news-crew">
            <img src={p.emblem} alt="Suspect crew emblem" />
            SUSPECT CREW
          </span>
        )}
      </header>
      <div className="news-inset">
        <div className="cctv">
          <img src={p.cctv} alt="Security-camera still of your car" />
          <span>
            <i /> CAM 04 · NORTH PIER · 19:44
          </span>
        </div>
        <div className="paint-compare">
          <figure>
            <img src={p.before} alt="The livery police saw" />
            <figcaption>PAINT THEY SAW</figcaption>
          </figure>
          <b className={p.after ? "" : "same"}>
            {p.after ? `${pct}% NEW` : "SAME PAINT"}
          </b>
          <figure>
            <img src={p.after || p.before} alt="Your livery now" />
            <figcaption>{p.after ? "PAINT NOW" : "STILL THE SAME"}</figcaption>
          </figure>
        </div>
      </div>
      <div className="lower-third">
        <div className="lt-head">
          <span>BREAKING</span>
          <h2>{headline}</h2>
        </div>
        <p>{line}</p>
      </div>
      <div className="ticker" aria-hidden="true">
        <div>
          <span>{ticker}</span>
          <span>{ticker}</span>
        </div>
      </div>
      <div className="news-actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await exportBroadcast(p, headline);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} /> {busy ? "PRINTING…" : "SAVE THE BROADCAST"}
        </button>
        <button className="btn secondary" onClick={p.onPhoto}>
          <Camera size={16} /> PHOTO MODE <ArrowRight size={15} />
        </button>
        <button className="btn text" onClick={p.onRetry}>
          <RotateCcw size={14} /> Run it back
        </button>
      </div>
    </section>
  );
}
