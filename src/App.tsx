import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Gauge,
  Maximize,
  Music2,
  Paintbrush,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { World, type RunResult, type Telemetry } from "./World";
import { createWrap, downloadImage, downloadRunCard } from "./artwork";
import { Radio } from "./audio";
import Minimap from "./Minimap";
import { warmImageEditor } from "./editor-warmup";
const Editor = lazy(() => import("./Editor"));
type Phase =
  | "home"
  | "garage"
  | "edit"
  | "brief"
  | "drive"
  | "result"
  | "photo"
  | "editPhoto";
const styles = [
  {
    id: "club" as const,
    name: "SUN CLUB",
    detail: "Good taste. Bad intentions.",
    color: "#ef895d",
  },
  {
    id: "racer" as const,
    name: "APEX 07",
    detail: "Built for the long way home.",
    color: "#72bcb2",
  },
  {
    id: "outlaw" as const,
    name: "NIGHT SHIFT",
    detail: "Clock out. Stand out.",
    color: "#e8dcb8",
  },
];
const paints = [
  { name: "Tangerine", hex: "#f27545" },
  { name: "Sea glass", hex: "#54b4aa" },
  { name: "Vanilla", hex: "#e9debf" },
  { name: "Midnight", hex: "#243844" },
];
const emptyTelemetry: Telemetry = {
  speed: 0,
  remaining: 90,
  checkpoint: 0,
  totalCheckpoints: 4,
  drift: 0,
  boost: 100,
  heat: 0,
  message: "Head for the glowing checkpoint.",
};
const load = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
function App() {
  const [phase, setPhase] = useState<Phase>("home"),
    [style, setStyle] = useState(0),
    [paint, setPaint] = useState(paints[0].hex),
    [alias, setAlias] = useState(() => load("sundown-alias", "GHOST"));
  const [templates] = useState(() => styles.map((s) => createWrap(s.id))),
    [saved, setSaved] = useState(() => load("sundown-wrap", "")),
    [preview, setPreview] = useState(""),
    [photo, setPhoto] = useState("");
  const [telemetry, setTelemetry] = useState<Telemetry>(emptyTelemetry),
    [result, setResult] = useState<RunResult | null>(null),
    [runId, setRunId] = useState(0),
    [paused, setPaused] = useState(false),
    [autoThrottle, setAutoThrottle] = useState(false),
    [sound, setSound] = useState(false),
    [worldReady, setWorldReady] = useState(false),
    [worldError, setWorldError] = useState(""),
    [notice, setNotice] = useState(""),
    [downloading, setDownloading] = useState(false),
    [best, setBest] = useState(() => Number(load("sundown-best", "0")));
  const controls = useRef({
      left: false,
      right: false,
      gas: false,
      brake: false,
      boost: false,
    }),
    captureRef = useRef<(() => string) | null>(null),
    radio = useRef<Radio | null>(null);
  const activeWrap =
    phase === "edit" && preview ? preview : saved || templates[style];
  const onPreview = useCallback((url: string) => setPreview(url), []);
  const finish = useCallback((r: RunResult) => {
    setResult(r);
    setPhoto(r.snapshot);
    setPhase("result");
    setPaused(false);
    setBest((old) => {
      const next = Math.max(old, r.score);
      try {
        localStorage.setItem("sundown-best", String(next));
      } catch {}
      return next;
    });
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [phase]);
  useEffect(() => {
    warmImageEditor();
    return () => radio.current?.dispose();
  }, []);
  useEffect(() => {
    radio.current?.setDriving(phase === "drive" && !paused);
    if (phase !== "drive" || paused)
      Object.keys(controls.current).forEach((k) => {
        controls.current[k as keyof typeof controls.current] = false;
      });
  }, [phase, paused]);
  useEffect(() => {
    const handle = () => {
      if (document.hidden && phase === "drive") setPaused(true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "drive") setPaused((v) => !v);
    };
    document.addEventListener("visibilitychange", handle);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("visibilitychange", handle);
      window.removeEventListener("keydown", key);
    };
  }, [phase]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const toggleSound = async () => {
    if (sound) {
      radio.current?.stop();
      setSound(false);
    } else {
      try {
        radio.current ??= new Radio();
        await radio.current.start();
        radio.current.setDriving(phase === "drive");
        setSound(true);
      } catch {
        setNotice(
          "Audio is unavailable in this browser. The coast still looks good.",
        );
      }
    }
  };
  const saveWrap = (url: string) => {
    setSaved(url);
    setPreview("");
    setPhase("garage");
    setNotice("Fresh paint. Your exact artwork is now fitted to the car.");
    try {
      localStorage.setItem("sundown-wrap", url);
      localStorage.setItem("sundown-alias", alias);
    } catch {
      setNotice("Wrap fitted for this session. Browser storage is full.");
    }
  };
  const startRun = () => {
    setRunId((v) => v + 1);
    setPaused(false);
    setTelemetry(emptyTelemetry);
    setPhase("drive");
  };
  const edit = () => {
    setPreview("");
    setPhase("edit");
  };
  const getPhoto = () => {
    const shot = captureRef.current?.();
    if (shot) {
      setPhoto(shot);
      setNotice("Shot captured. Take it into the darkroom.");
    } else setNotice("The camera is still warming up.");
  };
  const downloadCard = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      await downloadRunCard({
        snapshot: photo || result.snapshot,
        wrap: saved,
        alias: alias || "GHOST",
        score: result.score,
        time: result.time,
        drift: result.drift,
        won: result.won,
      });
      setNotice("Your run card is ready.");
    } catch {
      setNotice("Could not export that shot. Try capturing a new one.");
    } finally {
      setDownloading(false);
    }
  };
  const touch = (
    key: keyof typeof controls.current,
    label: string,
    icon: React.ReactNode,
  ) => (
    <button
      aria-label={label}
      className={`touch-btn ${key}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        controls.current[key] = true;
      }}
      onPointerUp={() => (controls.current[key] = false)}
      onPointerCancel={() => (controls.current[key] = false)}
      onLostPointerCapture={() => (controls.current[key] = false)}
    >
      {icon}
    </button>
  );
  const worldVisible = phase !== "home" && phase !== "editPhoto";
  return (
    <main className={`app phase-${phase}`}>
      {phase !== "home" && (
        <div
          className={`world-stage ${worldVisible ? "" : "hidden"} ${phase === "edit" ? "editor-world" : ""}`}
        >
          <World
            mode={
              phase === "drive"
                ? "drive"
                : phase === "result" || phase === "photo"
                  ? "photo"
                  : "garage"
            }
            wrapUrl={activeWrap}
            paint={paint}
            runId={runId}
            paused={
              paused ||
              phase === "brief" ||
              phase === "edit" ||
              phase === "editPhoto"
            }
            autoThrottle={autoThrottle}
            onTelemetry={setTelemetry}
            onFinish={finish}
            onReady={() => setWorldReady(true)}
            onError={setWorldError}
            controls={controls}
            captureRef={captureRef}
          />
          {!worldReady && !worldError && (
            <div className="world-loader">
              <Sun className="spin" />
              <p>Opening the coast…</p>
            </div>
          )}
          {worldError && (
            <div className="world-loader">
              <h2>The coast needs WebGL.</h2>
              <p>{worldError}</p>
              <button className="btn primary" onClick={() => location.reload()}>
                Reload experience
              </button>
            </div>
          )}
        </div>
      )}
      {phase !== "edit" && phase !== "editPhoto" && (
        <header className="topbar">
          <button
            className="brand"
            onClick={() => {
              setPhase("home");
              setPaused(false);
            }}
            aria-label="Sundown Customs home"
          >
            <Sun size={29} strokeWidth={1.6} />
            <span>
              SUNDOWN<small>CUSTOMS & BAD DECISIONS</small>
            </span>
          </button>
          <div className="top-right">
            <span className="location">
              <i /> SOLANA BAY, FL <span> / </span> 19:42
            </span>
            <button
              className={`sound-btn ${sound ? "on" : ""}`}
              onClick={toggleSound}
              aria-label={sound ? "Mute radio" : "Turn on radio"}
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
              <span>{sound ? "RADIO ON" : "SOUND OFF"}</span>
            </button>
            {phase === "drive" && (
              <button
                className="round-btn"
                onClick={() => setPaused((v) => !v)}
                aria-label="Pause run"
              >
                <Pause size={18} />
              </button>
            )}
          </div>
        </header>
      )}
      {phase === "home" && (
        <section className="home">
          <div className="cover-art" />
          <div className="cover-shade" />
          <div className="home-content">
            <span className="eyebrow">
              <span className="small-line" /> AN AFTER-HOURS COASTAL ESCAPE
            </span>
            <h1>
              GOOD PAINT.
              <br />
              BAD <em>IDEAS.</em>
            </h1>
            <p>
              A custom-car shop. One sunset.
              <br />A delivery you probably shouldn’t take.
            </p>
            <button
              className="btn primary hero-cta"
              onClick={() => setPhase("garage")}
            >
              OPEN THE GARAGE <ArrowUpRight size={23} />
            </button>
            <div className="home-meta">
              <span>3–5 MINUTES</span>
              <span>NO SIGN-UP</span>
              <span>YOUR CAR. YOUR ART.</span>
            </div>
          </div>
          <div className="cover-caption">
            <span className="caption-dot" /> YOUR SHIFT STARTS WHEN THEIRS ENDS.
            <span className="coordinates">25°46′ N / 80°11′ W</span>
          </div>
          <div className="home-bottom">
            <div>
              <b>01</b>
              <span>
                MAKE YOUR MARK<small>Design a livery in the paint booth.</small>
              </span>
            </div>
            <div>
              <b>02</b>
              <span>
                TAKE THE KEYS
                <small>Your saved art. An actual drivable car.</small>
              </span>
            </div>
            <div>
              <b>03</b>
              <span>
                BEAT THE SUNSET
                <small>Four checkpoints. One clean getaway.</small>
              </span>
            </div>
            <span className="built-with">
              BUILT WITH
              <br />
              <strong>Unlayer Image Editor ↗</strong>
            </span>
          </div>
        </section>
      )}
      {phase === "garage" && (
        <section className="garage-ui">
          <div className="section-kicker">
            <span className="eyebrow">01 / SUNDOWN CUSTOMS</span>
            <span className="status-pill">
              <i />
              {saved ? "WRAP FITTED" : "BAY 03 · OPEN"}
            </span>
          </div>
          <div className="garage-title">
            <h1>
              YOUR RIDE.
              <br />
              <em>YOUR RULES.</em>
            </h1>
            <p>
              Meet the Solstice ’87.
              <br />
              Runs hot. Looks better with your name on it.
            </p>
          </div>
          <div className="car-tag">
            <span>SC—087</span>
            <b>SOLSTICE ’87</b>
            <small>REAR-WHEEL DRIVE / QUESTIONABLE HISTORY</small>
          </div>
          <aside className="custom-panel">
            <div className="panel-top">
              <span className="eyebrow">THE BUILD SHEET</span>
              <Paintbrush size={18} />
            </div>
            <label className="field-label" htmlFor="alias">
              WHAT SHOULD WE CALL YOU?
            </label>
            <input
              id="alias"
              value={alias}
              maxLength={14}
              onChange={(e) => setAlias(e.target.value.toUpperCase())}
              placeholder="YOUR CALLSIGN"
            />
            <div className="field-label">
              {saved ? "YOUR FITTED LIVERY" : "PICK A STARTING LIVERY"}{" "}
              <span>{saved ? "CUSTOM" : "01—03"}</span>
            </div>
            {saved ? (
              <div className="saved-swatch">
                <img src={saved} alt="Your saved custom livery" />
                <span>
                  <Check size={13} /> YOUR ORIGINAL
                </span>
                <button
                  className="small-link"
                  onClick={() => {
                    setSaved("");
                    setPreview("");
                    try {
                      localStorage.removeItem("sundown-wrap");
                    } catch {}
                  }}
                >
                  New build
                </button>
              </div>
            ) : (
              <div className="style-grid">
                {styles.map((s, i) => (
                  <button
                    key={s.id}
                    className={`style-card ${style === i ? "selected" : ""}`}
                    onClick={() => setStyle(i)}
                    aria-pressed={style === i}
                  >
                    <img src={templates[i]} alt={`${s.name} livery`} />
                    <span>
                      {s.name}
                      {style === i && <Check size={12} />}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="paint-row">
              <span className="field-label">BODY FINISH</span>
              <div>
                {paints.map((p) => (
                  <button
                    key={p.hex}
                    aria-label={p.name}
                    aria-pressed={paint === p.hex}
                    className={`paint-chip ${paint === p.hex ? "active" : ""}`}
                    style={{ background: p.hex }}
                    onClick={() => setPaint(p.hex)}
                  />
                ))}
              </div>
            </div>
            <button
              className={`btn ${saved ? "secondary" : "primary"} full`}
              onClick={edit}
            >
              <Paintbrush size={17} />
              {saved ? "REFINE YOUR LIVERY" : "MAKE IT YOURS"}
              <ArrowRight size={17} />
            </button>
            {saved ? (
              <button
                className="btn primary full"
                disabled={!worldReady || !!worldError}
                onClick={() => setPhase("brief")}
              >
                TAKE THE DELIVERY <ArrowUpRight size={18} />
              </button>
            ) : (
              <p className="panel-note">
                Open the paint booth. Add a personal touch.
                <br />
                Your saved artwork goes straight onto the car.
              </p>
            )}
          </aside>
          <div className="garage-bottom">
            <div>
              <span className="eyebrow">NICO / SHOP OWNER</span>
              <p>“I said make it memorable. Didn’t say make it legal.”</p>
            </div>
            <span className="tiny-label">
              <Sparkles size={14} /> DRAG THE CAR TO LOOK AROUND
            </span>
          </div>
        </section>
      )}
      {(phase === "edit" || phase === "editPhoto") && (
        <Suspense
          fallback={
            <div className="world-loader">Opening the paint booth…</div>
          }
        >
          <Editor
            source={phase === "editPhoto" ? photo : saved || templates[style]}
            kind={phase === "editPhoto" ? "photo" : "wrap"}
            onPreview={onPreview}
            onSave={
              phase === "editPhoto"
                ? (url) => {
                    setPhoto(url);
                    setPhase("photo");
                    setNotice("Your photograph, finished. Download it below.");
                  }
                : saveWrap
            }
            onCancel={() => {
              setPreview("");
              setPhase(phase === "editPhoto" ? "photo" : "garage");
            }}
          />
        </Suspense>
      )}
      {phase === "brief" && (
        <div className="modal-scrim">
          <section className="brief-card">
            <span className="eyebrow">NICO HAS ONE LAST FAVOR</span>
            <h2>
              THE LAST
              <br />
              <em>DELIVERY.</em>
            </h2>
            <p>
              “Nice paint, {alias || "GHOST"}. Now get my car around the bay
              before the meet closes. Four yellow gates. Keep it moving.”
            </p>
            <div className="job-facts">
              <span>
                <Flag size={19} />
                <b>4 GATES</b>
                <small>Follow the glowing route</small>
              </span>
              <span>
                <Gauge size={19} />
                <b>90 SECONDS</b>
                <small>Beat the closing time</small>
              </span>
              <span>
                <Zap size={19} />
                <b>YOUR STYLE</b>
                <small>Drift for bonus points</small>
              </span>
            </div>
            <label className="assist-option">
              <input
                type="checkbox"
                checked={autoThrottle}
                onChange={(e) => setAutoThrottle(e.target.checked)}
              />
              <span>
                Automatic throttle
                <small>
                  Keep accelerating while I steer. Brake still works.
                </small>
              </span>
            </label>
            <div className="controls-guide">
              <span>
                <kbd>W A S D</kbd> / arrows to drive
              </span>
              <span>
                <kbd>SPACE</kbd> drift
              </span>
              <span>
                <kbd>SHIFT</kbd> boost
              </span>
              <span>
                <kbd>ESC</kbd> pause
              </span>
            </div>
            <p className="touch-guide">
              On a phone? On-screen pedals and steering are ready.
            </p>
            <button className="btn primary full" onClick={startRun}>
              LET’S MAKE BAD DECISIONS <ArrowRight size={20} />
            </button>
            <button
              className="btn text full"
              onClick={() => setPhase("garage")}
            >
              One more look at the paint
            </button>
          </section>
        </div>
      )}
      {phase === "drive" && (
        <section className="drive-ui">
          <div className="run-top">
            <div className="mission">
              <span className="eyebrow">THE LAST DELIVERY</span>
              <strong>{telemetry.message}</strong>
              <div className="checkpoint-pips">
                {Array.from({ length: telemetry.totalCheckpoints }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < telemetry.checkpoint
                        ? "done"
                        : i === telemetry.checkpoint
                          ? "current"
                          : ""
                    }
                  />
                ))}
                <span>
                  {telemetry.checkpoint}/{telemetry.totalCheckpoints}{" "}
                  CHECKPOINTS
                </span>
              </div>
            </div>
            <div
              className={`countdown ${telemetry.remaining < 20 ? "urgent" : ""}`}
            >
              <small>BEFORE THE MEET CLOSES</small>
              <b>
                {Math.floor(Math.ceil(telemetry.remaining) / 60)}:
                {String(Math.ceil(telemetry.remaining) % 60).padStart(2, "0")}
              </b>
            </div>
          </div>
          <div className="drive-bottom">
            <div className="radio-card">
              <Music2 size={17} />
              <div>
                <span>COASTLINE FM / 88.7</span>
                <p>
                  {telemetry.checkpoint === 0
                    ? "“Fresh paint. Keep it that way.”"
                    : telemetry.checkpoint === 1
                      ? "“The marina crowd heard you coming.”"
                      : telemetry.checkpoint === 2
                        ? "“Two gates left. Don’t get sentimental.”"
                        : "“Home stretch. Bring it back pretty.”"}
                </p>
              </div>
            </div>
            <div className="speedometer">
              <span className="drift-score">
                {Math.round(telemetry.drift).toLocaleString()}{" "}
                <small>DRIFT PTS</small>
              </span>
              <strong>
                {Math.round(telemetry.speed)}
                <small>KM/H</small>
              </strong>
              <div className="boost-meter">
                <i style={{ width: `${telemetry.boost}%` }} />
              </div>
              <span className="tiny-label">SHIFT / BOOST</span>
            </div>
          </div>
          <div className="minimap">
            <Minimap
              x={telemetry.x ?? 0}
              z={telemetry.z ?? 40}
              heading={telemetry.heading ?? 0}
              checkpoint={telemetry.checkpoint}
            />
          </div>
          <div className="keyboard-hint">
            WASD / DRIVE <span>SPACE / DRIFT</span> SHIFT / BOOST
          </div>
          <div className="touch-controls">
            <div>
              {touch("left", "Steer left", <ChevronLeft />)}
              {touch("right", "Steer right", <ChevronRight />)}
            </div>
            <div>
              {touch("brake", "Brake and drift", <span>DRIFT</span>)}
              {touch("boost", "Boost", <Zap />)}
              {touch("gas", "Accelerate", <ArrowUpRight />)}
            </div>
          </div>
          {paused && (
            <div className="modal-scrim pause-scrim">
              <section className="pause-card">
                <span className="eyebrow">TAKE A BREATHER</span>
                <h2>COAST IS CLEAR.</h2>
                <p>Your timer is paused. Your paint is safe.</p>
                <button
                  className="btn primary full"
                  onClick={() => setPaused(false)}
                >
                  <Play size={18} />
                  BACK TO THE RUN
                </button>
                <button className="btn secondary full" onClick={startRun}>
                  <RotateCcw size={16} />
                  Restart delivery
                </button>
                <button
                  className="btn text full"
                  onClick={() => setPhase("garage")}
                >
                  Return to garage
                </button>
              </section>
            </div>
          )}
        </section>
      )}
      {phase === "result" && result && (
        <section className="result-ui">
          <div className="result-panel">
            <span className="eyebrow">
              {result.won
                ? "DELIVERY COMPLETE"
                : "THE COAST GETS ANOTHER CHANCE"}
            </span>
            <h1>
              {result.won ? (
                <>
                  MADE IT.
                  <br />
                  <em>MADE IT YOURS.</em>
                </>
              ) : (
                <>
                  NICE RIDE.
                  <br />
                  <em>ONE MORE TRY?</em>
                </>
              )}
            </h1>
            <p>
              {result.won
                ? `“${alias || "GHOST"}, that’s not a car anymore. That’s a calling card.” — Nico`
                : "The meet closed, but the paint is still yours. Learn the corners. Come back faster."}
            </p>
            <div className="result-stats">
              <span>
                <b>{result.score.toLocaleString()}</b>
                <small>STREET SCORE</small>
              </span>
              <span>
                <b>{result.time.toFixed(1)}s</b>
                <small>RUN TIME</small>
              </span>
              <span>
                <b>{Math.round(result.drift)}</b>
                <small>DRIFT POINTS</small>
              </span>
            </div>
            <div className="best-score">
              PERSONAL BEST <b>{best.toLocaleString()}</b>
              <span>THIS BROWSER</span>
            </div>
            <button
              className="btn primary full"
              onClick={() => {
                setPhase("photo");
                setNotice(
                  "Drag to find your angle. Capture the shot, then make it a cover.",
                );
              }}
            >
              <Camera size={18} />
              KEEP THE EVIDENCE
              <ArrowRight size={18} />
            </button>
            <button className="btn secondary full" onClick={startRun}>
              <RotateCcw size={16} />
              RUN IT BACK
            </button>
            <button
              className="btn text full"
              onClick={() => setPhase("garage")}
            >
              Back to the garage
            </button>
          </div>
          <div className="result-stamp">
            <Sun size={26} />
            <span>
              SUNDOWN
              <br />
              APPROVED
            </span>
          </div>
        </section>
      )}
      {phase === "photo" && (
        <section className="photo-ui">
          <div className="photo-heading">
            <span className="eyebrow">THE GOOD KIND OF EVIDENCE</span>
            <h1>
              POSTCARD FROM
              <br />
              <em>A BAD IDEA.</em>
            </h1>
            <p>Your car. Your pixels. Your night.</p>
          </div>
          <div className="photo-frame">
            <i />
            <i />
            <i />
            <i />
          </div>
          <aside className="photo-panel">
            {photo && (
              <img
                src={photo}
                alt="Your captured Sundown Customs car photograph"
              />
            )}
            <button className="btn primary full" onClick={getPhoto}>
              <Camera size={17} />
              CAPTURE THIS ANGLE
            </button>
            <button
              className="btn secondary full"
              disabled={!photo}
              onClick={() => setPhase("editPhoto")}
            >
              <Paintbrush size={17} />
              EDIT PHOTO IN UNLAYER
            </button>
            <div className="download-pair">
              <button
                className="btn secondary"
                disabled={!photo}
                onClick={() =>
                  downloadImage(photo, "sundown-customs-photo.png")
                }
              >
                <Download size={16} />
                Photo
              </button>
              <button
                className="btn secondary"
                disabled={!saved}
                onClick={() =>
                  downloadImage(saved, "sundown-customs-livery.png")
                }
              >
                <Download size={16} />
                Livery
              </button>
            </div>
            <button
              className="btn primary full"
              disabled={downloading || !result}
              onClick={downloadCard}
            >
              <Download size={16} />
              {downloading ? "PRINTING…" : "DOWNLOAD RUN CARD"}
            </button>
            <button
              className="btn text full"
              onClick={() => setPhase("result")}
            >
              <ArrowLeft size={14} />
              Back to your run
            </button>
          </aside>
          <span className="photo-caption">
            SOLANA BAY / {alias || "GHOST"} / SOLSTICE ’87
          </span>
        </section>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {phase === "home" && (
        <footer className="site-footer">
          <span>AN ORIGINAL PLAYABLE EXPERIENCE</span>
          <a
            href="https://github.com/adityasarade/sundown-customs"
            target="_blank"
            rel="noreferrer"
          >
            SOURCE CODE <ArrowUpRight size={12} />
          </a>
          <span>PAINT LOCAL. DRIVE FICTIONAL.</span>
        </footer>
      )}
    </main>
  );
}
export default App;
