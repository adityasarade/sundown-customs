import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { Download, Megaphone, Radio as RadioIcon, Warehouse } from "lucide-react";
import { downloadImage } from "./artwork";
import "./hijack.css";

type Props = {
  /** The defaced broadcast frame saved from Unlayer (PNG data URL or URL). */
  frame: string;
  /** The untouched Bay 9 frame, shown in the control-room monitor. */
  original: string;
  /** 0..1 share of pixels the player changed. */
  changed: number;
  crew: string;
  emblem?: string;
  /** Optional: silence the static / glitch sound effects. */
  muted?: boolean;
  onBillboards(): void;
  onDone(): void;
};

type Phase = "off" | "static" | "feed" | "hijack" | "live";

const ANCHOR_LINES = [
  "Dana… who is in the control room?!",
  "We— we appear to have lost the feed. Is that… is that paint?",
  "Cut to commercial. CUT TO COMMERCIAL! Why is nobody cutting?!",
  "Folks, please do not adjust your sets. Actually, maybe do.",
  "I'm being told this is… live. This is live. Oh no.",
];

const TIMELINE = { static: 90, feed: 1150, hijack: 1600, live: 2350 } as const;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function rating(pct: number) {
  if (pct >= 70) return "TOTAL BLACKOUT";
  if (pct >= 40) return "FULL TAKEOVER";
  if (pct >= 15) return "PIRATE BROADCAST";
  return "SUBLIMINAL";
}

/** Tiny self-contained SFX: tuned static hiss + a glitch "zap". */
function useHijackSound(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (muted) return;
    let ctx: AudioContext | null = null;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      ctxRef.current = ctx;
      void ctx.resume().catch(() => undefined);
    } catch {
      return;
    }
    return () => {
      ctxRef.current = null;
      void ctx?.close().catch(() => undefined);
    };
  }, [muted]);

  return useMemo(
    () => ({
      hiss(duration: number, level = 0.07) {
        const ctx = ctxRef.current;
        if (!ctx) return;
        try {
          const len = Math.floor(ctx.sampleRate * duration);
          const buf = ctx.createBuffer(1, len, ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const band = ctx.createBiquadFilter();
          band.type = "bandpass";
          band.frequency.value = 2400;
          band.Q.value = 0.6;
          const g = ctx.createGain();
          const t = ctx.currentTime;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(level, t + 0.04);
          g.gain.setValueAtTime(level, t + duration * 0.7);
          g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
          src.connect(band).connect(g).connect(ctx.destination);
          src.start(t);
          src.stop(t + duration + 0.05);
        } catch {
          /* audio is decoration */
        }
      },
      zap(level = 0.05) {
        const ctx = ctxRef.current;
        if (!ctx) return;
        try {
          const t = ctx.currentTime;
          const o = ctx.createOscillator();
          o.type = "square";
          o.frequency.setValueAtTime(1400, t);
          o.frequency.exponentialRampToValueAtTime(90, t + 0.22);
          const g = ctx.createGain();
          g.gain.setValueAtTime(level, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + 0.3);
        } catch {
          /* audio is decoration */
        }
      },
    }),
    [],
  );
}

/** Analogue snow on a small canvas, scaled up by CSS. */
function useStatic(
  canvas: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  fps: number,
) {
  useEffect(() => {
    const c = canvas.current;
    if (!c || !enabled) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width,
      h = c.height;
    const image = ctx.createImageData(w, h);
    const px = new Uint32Array(image.data.buffer);
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 1000 / fps) return;
      last = t;
      // Horizontal "tearing": each row gets a brightness bias.
      for (let y = 0; y < h; y++) {
        const bias = Math.random() < 0.04 ? 70 : 0;
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const v = Math.min(255, ((Math.random() * 235) | 0) + bias);
          px[row + x] = 0xff000000 | (v << 16) | (v << 8) | v;
        }
      }
      ctx.putImageData(image, 0, 0);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [canvas, enabled, fps]);
}

type Slice = { top: number; height: number; shift: number; hue: number };

export default function HijackAir({
  frame,
  original,
  changed,
  crew,
  emblem,
  muted = false,
  onBillboards,
  onDone,
}: Props) {
  const reduced = useMemo(prefersReducedMotion, []);
  const [phase, setPhase] = useState<Phase>(reduced ? "live" : "off");
  const [glitch, setGlitch] = useState(false);
  const [slices, setSlices] = useState<Slice[]>([]);
  const [viewers, setViewers] = useState(reduced ? 0 : 2417);
  const [typed, setTyped] = useState("");
  const [lineIndex, setLineIndex] = useState(0);
  const noiseRef = useRef<HTMLCanvasElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const sfx = useHijackSound(muted || reduced);

  const safeCrew = (crew || "AN UNKNOWN CREW").toUpperCase();
  const share = Number.isFinite(changed) ? Math.max(0, Math.min(1, changed)) : 0;
  const pct = Math.round(share * 100);
  const targetViewers = Math.round(120000 + share * 880000);
  const lines = useMemo(() => {
    const start = Math.floor(Math.random() * ANCHOR_LINES.length);
    return [ANCHOR_LINES[start], ANCHOR_LINES[(start + 2) % ANCHOR_LINES.length]];
  }, []);
  const onAir = phase === "hijack" || phase === "live";

  // Master timeline.
  useEffect(() => {
    if (reduced) return;
    const timers = [
      window.setTimeout(() => {
        setPhase("static");
        sfx.hiss(0.95);
      }, TIMELINE.static),
      window.setTimeout(() => setPhase("feed"), TIMELINE.feed),
      window.setTimeout(() => {
        setPhase("hijack");
        sfx.zap();
        sfx.hiss(0.35, 0.09);
      }, TIMELINE.hijack),
      window.setTimeout(() => setPhase("live"), TIMELINE.live),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, sfx]);

  // Snow: full-strength while standing by, a faint grain once live.
  useStatic(noiseRef, !reduced && phase !== "off", phase === "static" ? 30 : 14);

  // Occasional glitch bursts with random tear slices.
  useEffect(() => {
    if (reduced || (phase !== "feed" && phase !== "hijack" && phase !== "live")) return;
    let alive = true;
    let timer = 0;
    const burst = (length: number) => {
      if (!alive) return;
      setSlices(
        Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => ({
          top: Math.random() * 88,
          height: 2 + Math.random() * 11,
          shift: (Math.random() - 0.5) * 12,
          hue: Math.random() < 0.3 ? 140 + Math.random() * 120 : 0,
        })),
      );
      setGlitch(true);
      timer = window.setTimeout(() => {
        if (!alive) return;
        setGlitch(false);
        schedule();
      }, length);
    };
    const schedule = () => {
      const wait = phase === "feed" ? 140 + Math.random() * 180 : 1700 + Math.random() * 2600;
      timer = window.setTimeout(() => burst(90 + Math.random() * 190), wait);
    };
    if (phase === "hijack") burst(420);
    else schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [phase, reduced]);

  // Viewer counter: climbs from Bay 9's usual audience to the target, then keeps ticking.
  useEffect(() => {
    if (!onAir) return;
    if (reduced) {
      setViewers(targetViewers);
      return;
    }
    let raf = 0;
    const from = 2417;
    const start = performance.now();
    const dur = 2600;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setViewers(Math.round(from + (targetViewers - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const drift = window.setInterval(() => {
      setViewers((v) => (v >= targetViewers ? v + Math.round(40 + Math.random() * 900) : v));
    }, 650);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(drift);
    };
  }, [onAir, reduced, targetViewers]);

  // Panicked anchor: typewriter subtitle + speech synthesis.
  useEffect(() => {
    if (!onAir) return;
    const line = lines[lineIndex];
    if (!line) return;
    let i = 0;
    let typer = 0;
    const startDelay = window.setTimeout(
      () => {
        if (reduced) {
          setTyped(line);
        } else {
          typer = window.setInterval(() => {
            i += 1;
            setTyped(line.slice(0, i));
            if (i >= line.length) clearInterval(typer);
          }, 34);
        }
        if (!muted && typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            const u = new SpeechSynthesisUtterance(line.replace(/[—…]/g, ", "));
            u.rate = 1.12;
            u.pitch = lineIndex === 0 ? 1.15 : 1.3;
            u.volume = 0.9;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
          } catch {
            /* optional */
          }
        }
      },
      lineIndex === 0 ? 380 : 0,
    );
    const next =
      lineIndex === 0
        ? window.setTimeout(() => setLineIndex(1), 5200)
        : 0;
    return () => {
      clearTimeout(startDelay);
      clearInterval(typer);
      clearTimeout(next);
    };
  }, [onAir, lineIndex, lines, muted, reduced]);

  // Stop the anchor on unmount, and immediately when the game gets muted.
  useEffect(() => {
    const stop = () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
    if (muted) stop();
    return stop;
  }, [muted]);

  useEffect(() => {
    if (phase === "live") primaryRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const ticker = [
    "WE ARE EXPERIENCING TECHNICAL DIFFICULTIES",
    `BAY 9 DOES NOT ENDORSE ${safeCrew}’S ART`,
    "PLEASE DO NOT ADJUST YOUR SET",
    "STATION MANAGER LAST SEEN SPRINTING TOWARD THE PARKING LOT",
    `SOLANA BAY PD: “WE ARE AWARE OF THE PAINTING”`,
    `${pct}% OF TONIGHT’S BROADCAST NOW BELONGS TO ${safeCrew}`,
    "WEATHER: CLEAR SKIES, UNCLEAR OWNERSHIP OF CHANNEL 9",
    "CRITICS CALL IT “VANDALISM”, “GENIUS”, “WHY IS IT STILL ON”",
  ].join("  ◆  ");

  // Memoised: frame is a multi-MB data URL and the counter re-renders every frame.
  const feedStyle = useMemo(() => ({ "--frame": `url("${frame}")` }) as CSSProperties, [frame]);
  const segments = 20;
  const lit = Math.round((pct / 100) * segments);

  return (
    <section
      className={`hj phase-${phase}${glitch ? " glitching" : ""}${reduced ? " reduced" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Signal hijacked by ${safeCrew}`}
    >
      <svg className="hj-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="hj-red-only" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
        </filter>
        <filter id="hj-cyan-only" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
        </filter>
      </svg>

      <header className="hj-banner" aria-hidden={!onAir}>
        <span className="hj-banner-icon">⚠</span>
        <span className="hj-banner-text">
          SIGNAL HIJACKED BY <b>{safeCrew}</b>
        </span>
        <span className="hj-banner-icon">⚠</span>
      </header>

      <div className="hj-stage">
        <div className="hj-tv">
          <div className="hj-screen">
            {/* Legit Bay 9 feed, seen briefly before the takeover. */}
            {original && <img className="hj-original" src={original} alt="" draggable={false} />}

            <div className="hj-feed" style={feedStyle}>
              <img className="hj-layer base" src={frame || undefined} alt="The hijacked Bay 9 broadcast" draggable={false} />
              <img className="hj-layer red" src={frame || undefined} alt="" draggable={false} />
              <img className="hj-layer cyan" src={frame || undefined} alt="" draggable={false} />
              {slices.map((s, i) => (
                <div
                  key={i}
                  className="hj-slice"
                  style={{
                    clipPath: `inset(${s.top}% 0 ${Math.max(0, 100 - s.top - s.height)}% 0)`,
                    transform: `translateX(${s.shift}%)`,
                    filter: s.hue ? `hue-rotate(${s.hue}deg) saturate(1.8)` : undefined,
                  }}
                />
              ))}
            </div>

            <canvas ref={noiseRef} className="hj-noise" width={240} height={135} aria-hidden="true" />

            <div className="hj-standby" aria-hidden="true">
              <div className="hj-bars">
                {["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"].map(
                  (c) => (
                    <i key={c} style={{ background: c }} />
                  ),
                )}
              </div>
              <div className="hj-standby-card">
                <small>BAY 9 · SOLANA BAY</small>
                <strong>PLEASE STAND BY</strong>
              </div>
            </div>

            <div className="hj-scan" aria-hidden="true" />
            <div className="hj-roll" aria-hidden="true" />
            <div className="hj-vignette" aria-hidden="true" />
            <div className="hj-flash" aria-hidden="true" />

            <div className="hj-bug" aria-hidden={!onAir}>
              {emblem ? <img src={emblem} alt="" /> : <span className="hj-bug-skull">☠</span>}
              <span>
                <b>PIRATE</b> TV
                <small>{safeCrew}</small>
              </span>
            </div>

            <div className="hj-viewers" aria-hidden={!onAir}>
              <span className="hj-rec" />
              <b>{viewers.toLocaleString("en-US")}</b>
              <small>WATCHING LIVE</small>
            </div>

            <p className="hj-subtitle" aria-live="polite">
              {typed && (
                <>
                  <span className="hj-speaker">ANCHOR:</span> {typed}
                  <span className="hj-caret" />
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <footer className="hj-foot">
        <div className="hj-ticker" aria-hidden="true">
          <span className="hj-ticker-tag">BAY 9</span>
          <div className="hj-ticker-track">
            <div>
              <span>{ticker}  ◆  </span>
              <span>{ticker}  ◆  </span>
            </div>
          </div>
        </div>

        <div className="hj-dock">
          <div
            className="hj-meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Signal takeover"
          >
            <div className="hj-meter-head">
              <span>
                SIGNAL TAKEOVER <b>{pct}%</b>
              </span>
              <em>{rating(pct)}</em>
            </div>
            <div className="hj-meter-bar">
              {Array.from({ length: segments }, (_, i) => (
                <i
                  key={i}
                  className={i < lit ? "on" : ""}
                  style={{ animationDelay: `${0.2 + i * 0.05}s` }}
                />
              ))}
            </div>
          </div>

          <aside className="hj-control" aria-hidden={!onAir}>
            <figure>
              {original && <img src={original} alt="" />}
              <span className="hj-lost">FEED LOST</span>
            </figure>
            <figcaption>
              <b>BAY 9 CONTROL ROOM</b>
              What they were supposed to air.
            </figcaption>
          </aside>

          <div className="hj-actions">
            <button
              ref={primaryRef}
              className="hj-btn primary"
              onClick={() => frame && downloadImage(frame, "sundown-signal-hijack.png")}
            >
              <Download size={17} /> SAVE THE HIJACK
            </button>
            <button className="hj-btn billboards" onClick={onBillboards}>
              <Megaphone size={17} /> PUT IT ON EVERY BILLBOARD
            </button>
            <button className="hj-btn ghost" onClick={onDone}>
              <Warehouse size={16} /> BACK TO THE GARAGE
            </button>
          </div>
        </div>
        <p className="hj-sig">
          <RadioIcon size={12} /> Frame defaced in Unlayer’s Image Editor · aired on Bay 9 whether they like it or not
        </p>
      </footer>
    </section>
  );
}
