import { useState } from "react";
import { Download, Home, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { downloadImage } from "./artwork";

export type FinaleStats = {
  best: number;
  runs: number;
  destination: string;
  drawnShare: number;
  starsDropped: number;
  viewers: number;
  jobsDone: number;
  jobsTotal: number;
  /** Titles of jobs not finished yet (side jobs), shown under the ring. */
  remaining: string[];
};
type Piece = { src: string; label: string };
type Props = {
  alias: string;
  emblem: string;
  livery: string;
  plan: string;
  tattoo: string;
  hijack: string;
  photo: string;
  stats: FinaleStats;
  onKeep: () => void;
  onClear: () => void;
  onGarage: () => void;
};

const CREDITS = [
  ["STARRING", "YOU as “{alias}”"],
  ["NICO", "Shop owner · bad influence"],
  ["CHUCK MARLOWE", "Bay 9 Evening News"],
  ["CHIEF VARGA", "Solana Bay PD · offended by paint"],
  ["THE SOLSTICE ’87", "Stunt car · many liveries"],
  ["SOLANA BAY RADIO", "Coastline FM · Non-Stop Neon · Bay Soul · Freestyle 105 · Bay Talk"],
  ["IMAGE EDITOR", "Unlayer React Image Editor — seven booths, one night"],
  ["NO BILLBOARDS", "were harmed. Several were hijacked."],
];

function load(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) return resolve(null);
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.max(w / im.width, h / im.height);
  const sw = w / r, sh = h / r;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}

/** A shareable 1200 × 1500 "night in Solana Bay" poster of everything the visitor made. */
async function composePoster(p: Props, pieces: Piece[]) {
  await document.fonts?.ready;
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1500;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 1500);
  g.addColorStop(0, "#1b0f2e");
  g.addColorStop(0.55, "#3a1540");
  g.addColorStop(1, "#ff7a4d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1200, 1500);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffcf4a";
  ctx.font = 'italic 900 150px "Barlow Condensed", Impact, sans-serif';
  ctx.fillText("SUNDOWN", 600, 170);
  ctx.fillStyle = "#fff";
  ctx.font = '800 34px "Barlow Condensed", sans-serif';
  ctx.fillText(`HEIST NIGHT · STARRING “${p.alias}”`, 600, 230);
  const imgs = await Promise.all(pieces.map((x) => load(x.src)));
  const cols = 3, w = 340, h = 230, gap = 40, top = 290;
  imgs.forEach((im, i) => {
    const x = 600 - (cols * w + (cols - 1) * gap) / 2 + (i % cols) * (w + gap);
    const y = top + Math.floor(i / cols) * (h + 90);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(((i % 3) - 1) * 0.03);
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(-w / 2 - 12, -h / 2 - 12, w + 24, h + 64);
    if (im) cover(ctx, im, -w / 2, -h / 2, w, h);
    ctx.fillStyle = "#141323";
    ctx.font = '800 24px "Barlow Condensed", sans-serif';
    ctx.fillText(pieces[i].label, 0, h / 2 + 38);
    ctx.restore();
  });
  const s = p.stats;
  const lines = [
    `BEST PAYOUT $${s.best.toLocaleString()}`,
    `${s.runs} RUN${s.runs === 1 ? "" : "S"} · DROP: ${s.destination}`,
    `${s.starsDropped}★ SHAKEN · ${Math.round(s.viewers).toLocaleString()} WATCHED THE HIJACK`,
  ];
  ctx.fillStyle = "#fff";
  ctx.font = '800 40px "Barlow Condensed", sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, 600, 1030 + Math.ceil(pieces.length / 3 - 2) * 320 + i * 54));
  ctx.fillStyle = "#141323";
  ctx.font = '700 26px "DM Sans", sans-serif';
  ctx.fillText("Made in Unlayer React Image Editor · #BuiltWithImageEditor", 600, 1450);
  downloadImage(c.toDataURL("image/png"), "sundown-heist-night.png");
}

export default function Finale(p: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const pieces: Piece[] = [
    { src: p.livery, label: "THE PAINT" },
    { src: p.emblem, label: "THE CREW" },
    { src: p.plan, label: "THE PLAN" },
    { src: p.tattoo, label: "THE INK" },
    { src: p.hijack, label: "THE HIJACK" },
    { src: p.photo, label: "THE SNAPPIX" },
  ].filter((x) => x.src);
  const s = p.stats;
  const pct = Math.round((s.jobsDone / Math.max(1, s.jobsTotal)) * 100);
  return (
    <section className="finale" aria-label="The end">
      <div className="finale-bg" style={p.hijack ? { backgroundImage: `url(${p.hijack})` } : undefined} />
      <div className="finale-credits" aria-hidden="true">
        <div>
          {CREDITS.map(([a, b]) => (
            <p key={a}>
              <b>{a}</b>
              <span>{b.replace("{alias}", p.alias)}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="finale-main">
        <span className="finale-kicker">
          <Sparkles size={14} /> HEIST NIGHT · COMPLETE
        </span>
        <h1>
          THE <em>END.</em>
        </h1>
        <p className="finale-nico">
          <img src="/art/nico.webp" alt="" />
          <span>
            “Not bad for one night, {p.alias}. Painted it, planned it, lost
            the cops, owned the news. Same time tomorrow?” — Nico
          </span>
        </p>
        <div className="finale-complete">
          <div className="finale-ring" style={{ ["--pct" as string]: `${pct}%` }}>
            <b>{pct}%</b>
            <small>COMPLETE</small>
          </div>
          {s.remaining.length > 0 && (
            <p className="finale-left">
              {s.remaining.length} job{s.remaining.length > 1 ? "s" : ""} left for 100%:{" "}
              <b>{s.remaining.join(" · ")}</b>
            </p>
          )}
          <ul className="finale-stats">
            <li><span>Best payout</span><i /><b>${s.best.toLocaleString()}</b></li>
            <li><span>Runs</span><i /><b>{s.runs}</b></li>
            <li><span>Drop</span><i /><b>{s.destination}</b></li>
            <li><span>Route you drew</span><i /><b>{Math.round(s.drawnShare * 100)}%</b></li>
            <li><span>Stars shaken</span><i /><b>{s.starsDropped}★</b></li>
            <li><span>Hijack viewers</span><i /><b>{Math.round(s.viewers).toLocaleString()}</b></li>
          </ul>
        </div>
        <div className="finale-gallery">
          {pieces.map((x, i) => (
            <figure key={x.label} style={{ ["--i" as string]: i }}>
              <img src={x.src} alt={x.label} />
              <figcaption>{x.label}</figcaption>
            </figure>
          ))}
        </div>
        <div className="finale-actions">
          <button className="finale-choice keep" onClick={p.onKeep}>
            <RotateCcw size={20} />
            <span>
              <b>PLAY AGAIN · KEEP MY CREW</b>
              <small>Your paint, emblem, plan and ink stay as starting points. Every job reopens so you can redo them all.</small>
            </span>
          </button>
          {confirmClear ? (
            <div className="finale-choice clear confirm">
              <Trash2 size={20} />
              <span>
                <b>WIPE EVERYTHING?</b>
                <small>Livery, emblem, tattoo, plan and hijack are deleted from this browser.</small>
              </span>
              <button className="btn primary" onClick={p.onClear}>YES, FRESH START</button>
              <button className="btn text" onClick={() => setConfirmClear(false)}>Keep it</button>
            </div>
          ) : (
            <button className="finale-choice clear" onClick={() => setConfirmClear(true)}>
              <Trash2 size={20} />
              <span>
                <b>FRESH START · CLEAR EVERYTHING</b>
                <small>Blank car, blank map, no ink. Do every job from scratch.</small>
              </span>
            </button>
          )}
          <div className="finale-small">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await composePoster(p, pieces);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download size={16} /> {busy ? "PRINTING…" : "SAVE THE NIGHT POSTER"}
            </button>
            <button className="btn text" onClick={p.onGarage}>
              <Home size={15} /> Back to the garage
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
