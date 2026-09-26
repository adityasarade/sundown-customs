import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
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
  Star,
  Sun,
  Tv,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import {
  World,
  type RunResult,
  type Telemetry,
  type WorldApi,
} from "./World";
import { CHECKPOINTS, type DriveEvent } from "./driving";
import { paintChange } from "./paint-diff";
import News from "./News";
import PlanLocked from "./PlanLocked";
import Parlor from "./Parlor";
import HijackAir from "./HijackAir";
import BillboardTour from "./BillboardTour";
import Finale from "./Finale";
import GpsHud from "./GpsHud";
import Jobs, { ObjectivePill, type JobStep } from "./Jobs";
import { renderPlanMap, planFromImages, loadPlanFonts } from "./planmap";
import { cropTattoo } from "./tattoo";
import { composeBroadcast } from "./broadcast";
import {
  defaultMission,
  missionFromPath,
  shortestPath,
  GARAGE_NODE,
  LANDMARKS,
  type Mission,
} from "./city";
import Home from "./Home";
import DecalRack from "./DecalRack";
import Guide from "./Guide";
import BayFeed from "./BayFeed";
import { composeLivery, type Slot } from "./decals";
import { createEmblem } from "./emblem";
import { wantedBillboard } from "./poster";

type Tip = { id: string; title?: string; text: string };
const LOADING_TIPS = [
  "The more of your paint you change at Spray & Pray, the more wanted stars you drop.",
  "Police cruisers drive the exact line you drove. Cut clean corners.",
  "Stalling near a cruiser fills the BUSTED meter. Keep moving.",
  "Drifting through corners earns cash. Hold SPACE while steering at speed.",
  "Press R while driving to switch radio stations.",
  "Your crew emblem rides on the roof. Bay PD has noticed.",
  "Disguise kits in the respray booth change almost every pixel.",
  "The route you draw on Nico’s map becomes your GPS line. Avoid the red cameras.",
  "Circle stash crates in yellow on the plan to turn them into cash pickups.",
  "Hijack Bay 9 after a job — whatever you draw goes out on every billboard.",
];
const LOADING_ART = ["/art/chase.webp", "/art/respray.webp", "/art/cover.webp", "/art/planning.webp", "/art/hijack.webp"];
const TIPS: Record<string, Tip> = {
  garage: {
    id: "garage",
    title: "WELCOME TO SUNDOWN CUSTOMS",
    text: "Your <em>BAYPHONE</em> lists tonight’s jobs. Start with <em>Fresh paint</em>: pick a livery, stamp symbols from the <em>Decal Rack</em>, then <em>Make it yours</em> in the image editor.",
  },
  editor: {
    id: "editor",
    title: "THE PAINT BOOTH",
    text: "<em>Tag</em> = text, <em>Spray can</em> = freehand, <em>Decals</em> = stickers, <em>Tint</em> = filters. When it looks right, hit <em>Fit the wrap</em> (top right).",
  },
  fitted: {
    id: "fitted",
    title: "THAT’S YOUR CAR NOW",
    text: "Your exact saved pixels are on the hood and doors. Drag to spin it, choose <em>underglow</em>, then <em>Take the delivery</em>.",
  },
  drive: {
    id: "drive",
    title: "DRIVING",
    text: "Hold <kbd>W</kbd>/<kbd>↑</kbd> to drive, <kbd>A</kbd><kbd>D</kbd> to steer. Head through the <em>yellow gates</em>. <kbd>SPACE</kbd> drifts, <kbd>SHIFT</kbd> boosts, <kbd>R</kbd> changes station.",
  },
  wanted: {
    id: "wanted",
    title: "YOU’RE WANTED",
    text: "Cops follow the exact line you drive. Keep your speed up — stalling fills the <em class=cop>BUSTED</em> meter. The pink <em class=pink>$</em> on the radar is <em class=pink>Spray &amp; Pray</em>.",
  },
  respray: {
    id: "respray",
    title: "SPRAY & PRAY",
    text: "Every <em>8%</em> of paint you change drops a star. <em>Disguise kits</em> and <em>Instant respray</em> filters change the most pixels fastest. Then <em>Respray &amp; go</em>.",
  },
  lost: {
    id: "lost",
    title: "HEAT’S OFF",
    text: "Follow the yellow gates back to the garage. Drift through corners for bonus cash.",
  },
  result: {
    id: "result",
    title: "JOB DONE",
    text: "Bay 9 already has the story. Hit <em>You made the news</em>, then save the broadcast.",
  },
  plan: {
    id: "plan",
    title: "THE PLAN",
    text: "Pick <em>Route marker</em>, then drag a line along the roads from <em>START</em> to a gold <em>drop</em>. Circle crates in <em>yellow</em> to claim the cash. Red cameras on your line = wanted stars. Hit <em>Lock the plan</em>.",
  },
  planLocked: {
    id: "planLocked",
    title: "YOUR INK IS THE MISSION",
    text: "Your drawing just became the GPS route, the checkpoints and the pickups. Happy with it? <em>Start the run</em>. Not? <em>Redraw</em>.",
  },
  parlor: {
    id: "parlor",
    title: "INK & IRON",
    text: "Pick a flash design, then <em>Get in the chair</em> to finish it in the editor. Your tattoo rides on the driver’s arm — look out the window.",
  },
  hijack: {
    id: "hijack",
    title: "YOU’RE IN THE FEED",
    text: "This is Bay 9’s live frame. <em>Deface</em> it, write <em>Your message</em>, add stickers. The more you change, the more viewers you steal. Then <em>GO LIVE</em>.",
  },
  gps: {
    id: "gps",
    title: "FOLLOW YOUR ROUTE",
    text: "The pink ribbon on the road and the arrow up top follow the route <em>you drew</em>. Gold $ bags are the crates you circled.",
  },
  photo: {
    id: "photo",
    title: "SNAPPIX",
    text: "Drag to frame your car, <em>Capture this angle</em>, then open it in <em>Snappix</em> to add borders, filters and a caption.",
  },
};
import { createWrap, downloadImage, downloadRunCard } from "./artwork";
import { Radio, STATIONS } from "./audio";
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
  | "editPhoto"
  | "respray"
  | "emblem"
  | "news"
  | "plan"
  | "planLocked"
  | "parlor"
  | "ink"
  | "hijack"
  | "hijackAir"
  | "billboards"
  | "finale";
const EDITOR_PHASES: Phase[] = ["edit", "editPhoto", "respray", "emblem", "plan", "ink", "hijack"];
const SCREEN_PHASES: Phase[] = ["home", "news", "planLocked", "parlor", "hijackAir", "finale"];
type JobId = "paint" | "crew" | "plan" | "ink" | "run" | "hijack";
type Banner = { id: number; title: string; sub?: string; tone: string };
type Respray = {
  changed: number;
  cleared: number;
  remaining: number;
  before: string;
  after: string;
};
const glows = [
  { name: "No underglow", hex: null },
  { name: "Hot pink", hex: "#ff3fa4" },
  { name: "Miami cyan", hex: "#3ff0ff" },
  { name: "Toxic lime", hex: "#b6ff3f" },
];
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
  stars: 0,
  bust: 0,
  cops: 0,
  payout: 0,
  respray: false,
  message: "Head for the glowing checkpoint.",
};
const load = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const CREW_BASES = ["bay-bonez", "sunset-run", "neon-bird", "causeway-kings", "snake-eyes"];
function createEmblemSafe(alias: string, base: string) {
  try {
    return createEmblem(alias, base);
  } catch {
    return "";
  }
}
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
    [best, setBest] = useState(() => Number(load("sundown-best", "0"))),
    [banner, setBanner] = useState<Banner | null>(null),
    [texts, setTexts] = useState<{ id: number; text: string }[]>([]),
    [wantedShot, setWantedShot] = useState(""),
    [billboard, setBillboard] = useState(""),
    [respray, setRespray] = useState<Respray | null>(null),
    [shake, setShake] = useState(false),
    [glow, setGlow] = useState<string | null>(
      () => load("sundown-glow", "") || null,
    );
  const [tip, setTip] = useState<Tip | null>(null),
    seenTips = useRef(new Set<string>()),
    [placed, setPlaced] = useState<Partial<Record<Slot, string>>>({}),
    [racked, setRacked] = useState(""),
    [posted, setPosted] = useState(false),
    [emblem, setEmblem] = useState(() => load("sundown-emblem", ""));
  const [crewBase, setCrewBase] = useState(0);
  const defaultEmblem = useMemo(
    () => createEmblemSafe(alias, CREW_BASES[crewBase]),
    [alias, crewBase],
  );
  const emblemUrl = emblem || defaultEmblem;
  const showTip = useCallback((id: keyof typeof TIPS) => {
    if (seenTips.current.has(id)) return;
    seenTips.current.add(id);
    setTip(TIPS[id]);
  }, []);
  const [loading, setLoading] = useState<{ art: string; tip: string } | null>(null);
  const [mission, setMission] = useState<Mission>(() => defaultMission()),
    [planBase, setPlanBase] = useState(""),
    [planUrl, setPlanUrl] = useState(""),
    [planBusy, setPlanBusy] = useState(false),
    [planSource, setPlanSource] = useState(""),
    [stencil, setStencil] = useState(""),
    [tattoo, setTattoo] = useState(() => load("sundown-tattoo", "")),
    [tattooCrop, setTattooCrop] = useState(""),
    [hijackFrame, setHijackFrame] = useState(""),
    [hijackUrl, setHijackUrl] = useState(""),
    [hijackChanged, setHijackChanged] = useState(0),
    [runs, setRuns] = useState(0),
    [runMission, setRunMission] = useState<Mission | null>(null),
    [starsDropped, setStarsDropped] = useState(0),
    [done, setDone] = useState<Set<JobId>>(() => {
      const d = new Set<JobId>();
      if (load("sundown-wrap", "")) d.add("paint");
      if (load("sundown-emblem", "")) d.add("crew");
      if (load("sundown-tattoo", "")) d.add("ink");
      return d;
    }),
    [jobsOpen, setJobsOpen] = useState(true);
  useEffect(() => {
    if (tattoo && !tattooCrop) cropTattoo(tattoo).then(setTattooCrop).catch(() => {});
  }, [tattoo, tattooCrop]);
  const [intro, setIntro] = useState(true),
    [station, setStation] = useState(0),
    [stationPop, setStationPop] = useState(0);
  const telemetryRef = useRef<Telemetry>(emptyTelemetry),
    missionRef = useRef<Mission | null>(null);
  telemetryRef.current = telemetry;
  missionRef.current = mission;
  const savedRef = useRef(""),
    aliasRef = useRef("");
  const phaseRef = useRef<Phase>("home");
  phaseRef.current = phase;
  const worldApi = useRef<WorldApi | null>(null),
    seq = useRef(0);
  const flash = useCallback(
    (title: string, sub?: string, tone = "gold") =>
      setBanner({ id: ++seq.current, title, sub, tone }),
    [],
  );
  const text = useCallback(
    (t: string) =>
      setTexts((all) => [...all.slice(-3), { id: ++seq.current, text: t }]),
    [],
  );
  const controls = useRef({
      left: false,
      right: false,
      gas: false,
      brake: false,
      boost: false,
    }),
    captureRef = useRef<(() => string) | null>(null),
    radio = useRef<Radio | null>(null);
  const baseWrap = saved || templates[style];
  savedRef.current = baseWrap;
  aliasRef.current = alias;
  const hasDecals = Object.values(placed).some(Boolean);
  useEffect(() => {
    if (!hasDecals) {
      setRacked("");
      return;
    }
    let live = true;
    composeLivery(baseWrap, placed)
      .then((url) => live && setRacked(url))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [baseWrap, placed, hasDecals]);
  const garageWrap = (hasDecals && racked) || baseWrap;
  const activeWrap =
    (phase === "edit" || phase === "respray") && preview
      ? preview
      : phase === "garage" || phase === "edit"
        ? garageWrap
        : baseWrap;
  const outcome = !result
    ? "passed"
    : result.won
      ? "passed"
      : result.busted
        ? "busted"
        : "failed";
  const onPreview = useCallback((url: string) => setPreview(url), []);
  const markDone = useCallback(
    (id: JobId) => setDone((d) => (d.has(id) ? d : new Set(d).add(id))),
    [],
  );
  const finish = useCallback((r: RunResult) => {
    if (r.won) markDone("run");
    setResult(r);
    setPhoto(r.snapshot);
    radio.current?.stinger(r.won);
    setPhase("result");
    setPaused(false);
    setBest((old) => {
      const next = Math.max(old, r.score);
      try {
        localStorage.setItem("sundown-best", String(next));
      } catch {}
      return next;
    });
  }, [markDone]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [phase]);
  useEffect(() => {
    const r = radio.current;
    if (!r) return;
    const driving = phase === "drive" && !paused;
    r.setEngine(driving ? Math.min(1, telemetry.speed / 140) : 0, driving && controls.current.boost);
    r.setHeat(driving ? telemetry.cops : 0);
  }, [telemetry, phase, paused]);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 11000);
    return () => clearTimeout(t);
  }, [tip]);
  useEffect(() => {
    if (phase === "garage") {
      const t = setTimeout(() => showTip(saved ? "fitted" : "garage"), intro ? 3500 : 400);
      return () => clearTimeout(t);
    }
    if (phase === "edit") showTip("editor");
    else if (phase === "plan") showTip("plan");
    else if (phase === "planLocked") showTip("planLocked");
    else if (phase === "parlor") showTip("parlor");
    else if (phase === "hijack") showTip("hijack");
    else if (phase === "drive") {
      showTip("drive");
      const t = setTimeout(() => {
        if (phaseRef.current === "drive") showTip("gps");
      }, 14000);
      return () => clearTimeout(t);
    }
    else if (phase === "respray") showTip("respray");
    else if (phase === "result") {
      const t = setTimeout(() => showTip("result"), 3300);
      return () => clearTimeout(t);
    } else if (phase === "photo") showTip("photo");
    else setTip(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, saved]);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(timer);
  }, [banner]);
  const onEvent = useCallback(
    (e: DriveEvent, shot?: string) => {
      if (e === "checkpoint") {
        flash("CHECKPOINT", "+$300", "gold");
        radio.current?.sfx("checkpoint");
      }
      if (e === "stash") {
        flash("+$750", "Stash crate grabbed", "green");
        radio.current?.sfx("cash");
      }
      if (e === "wanted") {
        if (shot) {
          setWantedShot(shot);
          wantedBillboard(shot, savedRef.current, aliasRef.current || "GHOST")
            .then(setBillboard)
            .catch(() => {});
        }
        setTimeout(() => {
          if (phaseRef.current === "drive")
            flash("WANTED", "The pier cameras clocked your paint", "red");
        }, 900);
        radio.current?.siren();
        radio.current?.sfx("wanted");
        text("Pier cameras just clocked your paint. Every cop in Solana Bay has a description of it.");
        setTimeout(() => {
          if (phaseRef.current === "drive") showTip("wanted");
        }, 2600);
        setTimeout(
          () =>
            phaseRef.current === "drive" &&
            text("Spray & Pray, east road. Change the look and they lose you. The more you change, the more stars you drop."),
          3200,
        );
      }
      if (e === "respray") {
        radio.current?.sfx("respray");
        setPreview("");
        setPhase("respray");
      }
      if (e === "lost") {
        flash("LOST THEM", "Wanted level cleared", "green");
        setTimeout(() => {
          if (phaseRef.current === "drive") showTip("lost");
        }, 2600);
        text("Clean. Now get my car to the meet before they reconsider.");
      }
      if (e === "bump") {
        setShake(true);
        setTimeout(() => setShake(false), 380);
      }
      if (e === "closing")
        flash("THEY’RE ON YOU", "Speed up or get busted", "red");
    },
    [flash, text, showTip],
  );
  const respraySave = async (url: string) => {
    const before = saved || templates[style];
    const changed = await paintChange(before, url);
    const r = worldApi.current?.respray(changed) ?? {
      cleared: 0,
      remaining: 0,
    };
    setRespray({ changed, ...r, before, after: url });
    setStarsDropped((n) => n + r.cleared);
    setSaved(url);
    setPreview("");
    try {
      localStorage.setItem("sundown-wrap", url);
    } catch {}
    setPhase("drive");
    flash(
      `${Math.round(changed * 100)}% NEW PAINT`,
      r.remaining
        ? `−${r.cleared}★ · still ${r.remaining}★ hot. Keep moving.`
        : `−${r.cleared}★ · they don’t recognise you`,
      r.remaining ? "pink" : "green",
    );
    text(
      r.remaining
        ? `${Math.round(changed * 100)}% different? They still half-recognise it. Floor it.`
        : "Look at that. Every Bay PD billboard is hunting a car that doesn’t exist anymore.",
    );
  };
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
  const tune = async () => {
    const next = sound ? (station + 1) % STATIONS.length : station;
    if (!sound) await toggleSound();
    radio.current?.setStation(next);
    setStation(next);
    setStationPop(Date.now());
  };
  useEffect(() => {
    if (!stationPop) return;
    const t = setTimeout(() => setStationPop(0), 2200);
    return () => clearTimeout(t);
  }, [stationPop]);
  const tuneRef = useRef(tune);
  tuneRef.current = tune;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "drive" && e.key.toLowerCase() === "r" && !e.repeat)
        void tuneRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);
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
    markDone("paint");
    setPlaced({});
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
  if (import.meta.env.DEV)
    (window as unknown as Record<string, unknown>).__sd = {
      setSaved,
      setPhase,
      world: worldApi,
      startRun: () => startRun(),
      telemetry: () => telemetryRef.current,
      radio: () => radio.current,
      phase: () => phaseRef.current,
      mission: () => missionRef.current,
      useRoute: (dropId: string) => {
        const dest = LANDMARKS.find((l) => l.id === dropId);
        if (dest?.node) setMission(missionFromPath(shortestPath(GARAGE_NODE, dest.node), dest));
      },
    };
  const openPlan = async (redraw = false) => {
    setPlanBusy(true);
    try {
      await loadPlanFonts().catch(() => {});
      const base = planBase || renderPlanMap();
      if (!planBase) setPlanBase(base);
      setPlanSource((redraw || planUrl) && planUrl ? planUrl : base);
      setPhase("plan");
    } finally {
      setPlanBusy(false);
    }
  };
  const lockPlan = async (url: string) => {
    radio.current?.sfx("lock");
    try {
      const m = await planFromImages(planBase, url);
      if (phaseRef.current !== "plan") return;
      setMission(m);
      if (m.fromDrawing) markDone("plan");
      setPlanUrl(url);
      setPhase("planLocked");
    } catch {
      if (phaseRef.current !== "plan") return;
      setMission(defaultMission());
      setNotice("Couldn’t read that map. Nico’s route is loaded instead.");
      setPhase("brief");
    }
  };
  const openHijack = async () => {
    if (!result) return;
    const from = phaseRef.current;
    try {
      const frame = await composeBroadcast({
        alias: alias || "GHOST",
        headline:
          outcome === "busted"
            ? `LOCAL MENACE “${alias || "GHOST"}” IN CUSTODY`
            : `MYSTERY COUPE REACHES ${(runMission ?? mission).destination.name}`,
        cctv: wantedShot || result.snapshot,
        before: respray?.before || baseWrap,
        after: respray?.after || "",
        changed: respray?.changed ?? 0,
        emblem: emblemUrl,
        score: result.score,
      });
      if (phaseRef.current !== from) return;
      setHijackFrame(frame);
      setPhase("hijack");
    } catch {
      setNotice("The uplink dropped. Try the hijack again.");
    }
  };
  const goLive = async (url: string) => {
    radio.current?.sfx("hijack");
    const changed = await paintChange(hijackFrame, url);
    if (phaseRef.current !== "hijack") return;
    setHijackChanged(changed);
    setHijackUrl(url);
    markDone("hijack");
    setPhase("hijackAir");
  };
  const startRun = () => {
    setRuns((n) => n + 1);
    setRunMission(mission);
    setLoading({
      art: LOADING_ART[Math.floor(Math.random() * LOADING_ART.length)],
      tip: LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)],
    });
    setTimeout(() => setLoading(null), 1900);
    setRunId((v) => v + 1);
    setPaused(false);
    setTelemetry(emptyTelemetry);
    setWantedShot("");
    setBillboard("");
    setRespray(null);
    setBanner(null);
    setTexts([]);
    setPhase("drive");
    setTimeout(
      () => flash("THE LAST DELIVERY", `DROP · ${missionRef.current?.destination.name ?? "MARINA"}`, "title"),
      1950,
    );
    setTimeout(() => {
      if (phaseRef.current === "drive")
        text(
          missionRef.current?.fromDrawing
            ? `Your route, your call. ${missionRef.current.destination.name}. Try not to be memorable.`
            : `Nice paint, ${alias || "GHOST"}. My route: ${missionRef.current?.destination.name ?? "the Marina"}. Try not to be memorable.`,
        );
    }, 2300);
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
  const collectedIds =
    (telemetry as Telemetry & { collected?: string[] }).collected ?? [];
  const painted = !!saved;
  const planned = mission.fromDrawing;
  const has = (id: JobId) => done.has(id);
  const jobSteps: JobStep[] = [
    { id: "paint", title: "FRESH PAINT", sub: has("paint") ? "Livery fitted" : painted ? "Repaint your car in the booth" : "Paint your car in the booth", status: has("paint") ? "done" : "next" },
    { id: "crew", title: "CREW COLORS", sub: has("crew") ? "Emblem on the roof" : "Design a crew emblem", status: has("crew") ? "done" : "optional" },
    { id: "plan", title: "THE PLAN", sub: has("plan") ? `Route to ${mission.destination.name}` : "Draw your route on Nico’s map", status: has("plan") ? "done" : painted ? "next" : "locked" },
    { id: "ink", title: "INK & IRON", sub: has("ink") ? "Inked" : tattoo ? "Re-ink your tattoo" : "Get a tattoo for the job", status: has("ink") ? "done" : "optional" },
    { id: "run", title: "THE LAST DELIVERY", sub: has("run") ? `Delivered · ${runs} run${runs === 1 ? "" : "s"}` : "Deliver the car", status: has("run") ? "done" : painted && (has("plan") || planned) ? "next" : painted ? "optional" : "locked" },
    { id: "hijack", title: "HIJACK BAY 9", sub: has("hijack") ? "You own the airwaves" : "After a run: take over the news", status: has("hijack") ? "done" : result ? "next" : "locked" },
  ];
  const heistDone = has("run") && has("hijack");
  const objective = !has("paint") && !painted
    ? "Paint your car in the booth"
    : !has("paint")
      ? "Freshen the paint — or skip straight to the plan"
      : !has("plan") && !planned
        ? "Draw the getaway route on Nico’s map"
        : !has("run")
          ? `Deliver the car to ${mission.destination.name}`
          : !has("hijack")
            ? "Hijack Bay 9 — or run it back"
            : "Heist complete. Watch the ending or start a new heist.";
  const viewers = 120000 + hijackChanged * 880000;
  /** Replay with everything the visitor made kept as starting points. */
  const newHeistKeep = () => {
    setDone(new Set());
    setResult(null);
    setRespray(null);
    setWantedShot("");
    setBillboard("");
    setPosted(false);
    setStarsDropped(0);
    setRunMission(null);
    setJobsOpen(true);
    seenTips.current.clear();
    setPhase("garage");
    setNotice("New heist. Your crew’s gear is still here — every job is open again.");
  };
  /** Wipe the visitor's creations and start from a blank car. */
  const newHeistClear = () => {
    for (const k of ["sundown-wrap", "sundown-emblem", "sundown-tattoo", "sundown-glow"])
      try {
        localStorage.removeItem(k);
      } catch {}
    setSaved("");
    setPreview("");
    setPlaced({});
    setEmblem("");
    setCrewBase(0);
    setTattoo("");
    setTattooCrop("");
    setStencil("");
    setGlow(null);
    setMission(defaultMission());
    setPlanUrl("");
    setPlanSource("");
    setHijackUrl("");
    setHijackFrame("");
    setHijackChanged(0);
    setPhoto("");
    setRuns(0);
    setIntro(true);
    newHeistKeep();
    setNotice("Fresh start. Blank car, blank map. Nico’s waiting.");
  };
  const selectJob = (id: string) => {
    if (id === "paint") edit();
    else if (id === "crew") setPhase("emblem");
    else if (id === "plan" && painted) void openPlan();
    else if (id === "ink") setPhase("parlor");
    else if (id === "run" && painted) setPhase("brief");
    else if (id === "hijack" && result) void openHijack();
    else if (id === "hijack" && hijackUrl) setPhase("finale");
    else setNotice(painted ? "That one unlocks after a run." : "Paint the car first — the booth is waiting.");
  };
  const worldVisible =
    phase !== "home" && phase !== "editPhoto" && !SCREEN_PHASES.includes(phase) && phase !== "plan" && phase !== "ink" && phase !== "hijack";
  return (
    <main className={`app phase-${phase}`}>
      {phase !== "home" && (
        <div
          className={`world-stage ${worldVisible ? "" : "hidden"} ${EDITOR_PHASES.includes(phase) ? "editor-world" : ""}`}
        >
          <World
            mode={
              phase === "billboards"
                ? "tour"
                : phase === "drive" || phase === "respray"
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
              phase === "editPhoto" ||
              phase === "respray" ||
              EDITOR_PHASES.includes(phase) ||
              SCREEN_PHASES.includes(phase) ||
              !!loading
            }
            mission={mission}
            tattooUrl={tattooCrop}
            apiRef={worldApi}
            onEvent={onEvent}
            underglow={glow}
            emblemUrl={emblemUrl}
            billboardUrl={hijackUrl || billboard}
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
      {!EDITOR_PHASES.includes(phase) && !SCREEN_PHASES.includes(phase) && phase !== "billboards" && (
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
            {(phase === "garage" || phase === "brief") && <ObjectivePill text={objective} />}
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
        <Home
          onStart={() => setPhase("garage")}
          onSound={toggleSound}
          sound={sound}
        />
      )}
      {phase === "garage" && intro && (
        <button
          className="char-intro"
          onClick={() => setIntro(false)}
          onAnimationEnd={(e) => {
            if (e.animationName === "intro-out") setIntro(false);
          }}
          aria-label="Skip introduction"
        >
          <img src="/art/nico.webp" alt="" />
          <span className="char-name">
            Nico
            <small>SHOP OWNER · BAD INFLUENCE</small>
          </span>
        </button>
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
                <img src={garageWrap} alt="Your saved custom livery" />
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
            <div className="emblem-row">
              {emblemUrl && <img src={emblemUrl} alt="Your crew emblem" />}
              <div>
                <span className="field-label">CREW EMBLEM</span>
                <small>Rides on your roof, BAYFEED and the news.</small>
              </div>
              <button
                className="btn text emblem-cycle"
                aria-label="Next crew badge"
                title="Next crew badge"
                onClick={() => {
                  setEmblem("");
                  try {
                    localStorage.removeItem("sundown-emblem");
                  } catch {}
                  setCrewBase((i) => (i + 1) % CREW_BASES.length);
                }}
              >
                <RotateCcw size={14} />
              </button>
              <button className="btn secondary" onClick={() => setPhase("emblem")}>
                EDIT
              </button>
            </div>
            <DecalRack placed={placed} onChange={setPlaced} />
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
            <div className="paint-row">
              <span className="field-label">NEON UNDERGLOW</span>
              <div>
                {glows.map((g) => (
                  <button
                    key={g.name}
                    aria-label={g.name}
                    aria-pressed={glow === g.hex}
                    className={`paint-chip glow-chip ${glow === g.hex ? "active" : ""} ${g.hex ? "" : "off"}`}
                    style={{ background: g.hex ?? "transparent", color: g.hex ?? undefined }}
                    onClick={() => {
                      setGlow(g.hex);
                      try {
                        localStorage.setItem("sundown-glow", g.hex ?? "");
                      } catch {}
                    }}
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
                onClick={() => {
                  if (hasDecals && racked) {
                    setSaved(racked);
                    setPlaced({});
                    try {
                      localStorage.setItem("sundown-wrap", racked);
                    } catch {}
                  }
                  setPhase("brief");
                }}
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
          {jobsOpen ? (
            <div className="garage-jobs">
              <Jobs
                steps={jobSteps}
                onSelect={selectJob}
                objective={objective}
                onClose={() => setJobsOpen(false)}
                footer={
                  heistDone ? (
                    <div className="bp-footer">
                      <button onClick={() => setPhase("finale")}>WATCH THE ENDING</button>
                      <button onClick={newHeistKeep}>NEW HEIST</button>
                    </div>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <button className="jobs-reopen" onClick={() => setJobsOpen(true)}>
              <img src="/art/nico.webp" alt="" /> BAYPHONE · JOBS
            </button>
          )}
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
      {EDITOR_PHASES.includes(phase) && (
        <Suspense
          fallback={
            <div className="world-loader">Opening the paint booth…</div>
          }
        >
          <Editor
            source={
              phase === "plan"
                ? planSource || planBase
                : phase === "ink"
                ? stencil
                : phase === "hijack"
                ? hijackFrame
                : phase === "emblem"
                ? emblemUrl
                : phase === "editPhoto"
                ? photo
                : phase === "edit"
                  ? garageWrap
                  : baseWrap
            }
            kind={
              phase === "plan" || phase === "ink" || phase === "hijack"
                ? phase
                : phase === "emblem"
                ? "emblem"
                : phase === "editPhoto"
                ? "photo"
                : phase === "respray"
                  ? "respray"
                  : "wrap"
            }
            stars={telemetry.stars}
            onPreview={onPreview}
            onSave={
              phase === "plan"
                ? lockPlan
                : phase === "ink"
                ? (url) => {
                    setTattoo(url);
                    markDone("ink");
                    setTattooCrop("");
                    try {
                      localStorage.setItem("sundown-tattoo", url);
                    } catch {}
                    setPhase("garage");
                    setNotice("Fresh ink. Check the driver’s arm out the window.");
                  }
                : phase === "hijack"
                ? goLive
                : phase === "emblem"
                ? (url) => {
                    setEmblem(url);
                    markDone("crew");
                    try {
                      localStorage.setItem("sundown-emblem", url);
                    } catch {}
                    setPhase("garage");
                    setNotice("Crew emblem locked in. Check the roof.");
                  }
                : phase === "respray"
                ? respraySave
                : phase === "editPhoto"
                ? (url) => {
                    setPhoto(url);
                    setPhase("photo");
                    setPosted(true);
                  }
                : saveWrap
            }
            onCancel={() => {
              setPreview("");
              if (phase === "plan") setPhase("garage");
              else if (phase === "ink") setPhase("parlor");
              else if (phase === "hijack") setPhase("news");
              else if (phase === "emblem") setPhase("garage");
              else if (phase === "respray") {
                setPhase("drive");
                text("Walked out? Bold. Loop back through Spray & Pray if you change your mind.");
              } else setPhase(phase === "editPhoto" ? "photo" : "garage");
            }}
          />
        </Suspense>
      )}
      {phase === "brief" && (
        <div className="modal-scrim">
          <section className="brief-card">
            <div className="brief-art" />
            <span className="eyebrow">NICO HAS ONE LAST FAVOR</span>
            <h2>
              THE LAST
              <br />
              <em>DELIVERY.</em>
            </h2>
            <p>
              {mission.fromDrawing
                ? `“Your route, ${alias || "GHOST"}. ${mission.destination.name}. I’ll believe it when I see it.”`
                : `“Nice paint, ${alias || "GHOST"}. No plan? Then it’s my route: straight to the ${mission.destination.name}.”`}
            </p>
            <div className="job-facts">
              <span>
                <Flag size={19} />
                <b>{mission.destination.name}</b>
                <small>{mission.checkpoints.length} gates on your route</small>
              </span>
              <span>
                <Gauge size={19} />
                <b>
                  {Math.floor(mission.seconds / 60)}:{String(mission.seconds % 60).padStart(2, "0")}
                </b>
                <small>Before the meet closes</small>
              </span>
              <span>
                <Zap size={19} />
                <b>
                  {mission.camerasOnRoute.length
                    ? `${mission.camerasOnRoute.length} CAMERA${mission.camerasOnRoute.length > 1 ? "S" : ""}`
                    : "NO CAMERAS"}
                </b>
                <small>
                  {mission.stashes.length ? `${mission.stashes.length} crate${mission.stashes.length > 1 ? "s" : ""} marked` : "Drift for bonus cash"}
                </small>
              </span>
            </div>
            {!mission.fromDrawing ? (
              <button className="brief-plan" onClick={() => void openPlan()} disabled={planBusy}>
                <img src="/art/planning.webp" alt="" />
                <span>
                  <b>DRAW YOUR OWN ROUTE</b>
                  <small>Plan it on Nico’s map in the image editor — your ink becomes the GPS, the checkpoints and the cash.</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ) : (
              <p className="brief-warning">
                <Star size={16} />
                <span>
                  {mission.camerasOnRoute.length
                    ? <>Your route passes <b>{mission.camerasOnRoute.length} camera{mission.camerasOnRoute.length > 1 ? "s" : ""}</b>. Expect <b>wanted stars</b> — a pink <b>Spray &amp; Pray</b> repaint in Unlayer drops them.</>
                    : <>Clean route — no cameras. A patrol may still get curious near the end. <b>Spray &amp; Pray</b> is your way out.</>}
                </span>
              </p>
            )}
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
      {phase === "planLocked" && (
        <PlanLocked
          mapUrl={planUrl}
          mission={mission}
          onStart={() => setPhase("brief")}
          onRedo={() => void openPlan(true)}
          onNicoRoute={() => {
            setMission(defaultMission());
            setPhase("brief");
          }}
        />
      )}
      {phase === "parlor" && (
        <Parlor
          current={tattoo}
          onBack={() => setPhase("garage")}
          onChair={(url) => {
            setStencil(url);
            setPhase("ink");
          }}
        />
      )}
      {phase === "hijackAir" && (
        <HijackAir
          frame={hijackUrl}
          original={hijackFrame}
          changed={hijackChanged}
          crew={alias || "GHOST"}
          emblem={emblemUrl}
          muted={!sound}
          onBillboards={() => setPhase("billboards")}
          onDone={() => setPhase("garage")}
        />
      )}
      {phase === "billboards" && (
        <BillboardTour
          crew={alias || "GHOST"}
          frame={hijackUrl}
          viewers={viewers}
          onDone={() => {
            radio.current?.stinger(true);
            setPhase("finale");
          }}
        />
      )}
      {phase === "finale" && (
        <Finale
          alias={alias || "GHOST"}
          emblem={emblemUrl}
          livery={baseWrap}
          plan={planUrl}
          tattoo={tattooCrop}
          hijack={hijackUrl}
          photo={posted ? photo : ""}
          stats={{
            best,
            runs,
            destination: (runMission ?? mission).destination.name,
            drawnShare: (runMission ?? mission).drawnShare,
            starsDropped,
            viewers,
            jobsDone: jobSteps.filter((j) => j.status === "done").length,
            jobsTotal: jobSteps.length,
            remaining: jobSteps.filter((j) => j.status !== "done").map((j) => j.title),
          }}
          onKeep={newHeistKeep}
          onClear={newHeistClear}
          onGarage={() => setPhase("garage")}
        />
      )}
      {(phase === "drive" || phase === "respray") && (
        <section
          className={`drive-ui ${telemetry.cops ? "hot" : ""} ${shake ? "shake" : ""}`}
        >
          <div className="gta-texts" aria-live="polite">
            {texts.slice(-2).map((m) => (
              <div className="gta-text" key={m.id}>
                <img src="/art/nico.webp" alt="" />
                <div>
                  <span>
                    NICO <small>now</small>
                  </span>
                  <p>{m.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="gta-status">
            <div className="stars" aria-label={`Wanted level ${telemetry.stars} of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={i < telemetry.stars ? "on" : ""}
                  size={26}
                  strokeWidth={2.4}
                />
              ))}
            </div>
            <b className="cash">
              {emblemUrl && <img className="hud-crew" src={emblemUrl} alt="" />}$
              {telemetry.payout.toLocaleString()}
            </b>
            <span
              className={`clock ${telemetry.remaining < 20 ? "urgent" : ""}`}
            >
              {Math.floor(Math.ceil(telemetry.remaining) / 60)}:
              {String(Math.ceil(telemetry.remaining) % 60).padStart(2, "0")}
            </span>
            {telemetry.bust > 0.02 && (
              <div className="bust-meter">
                <i style={{ width: `${telemetry.bust * 100}%` }} />
                <small>BUSTED</small>
              </div>
            )}
          </div>
          {stationPop > 0 && (
            <div className="station-pop" key={stationPop}>
              <Music2 size={20} />
              <strong>{STATIONS[station].name}</strong>
              <span>
                {STATIONS[station].freq} · {STATIONS[station].genre}
              </span>
            </div>
          )}
          {banner && (
            <div className={`gta-banner ${banner.tone}`} key={banner.id}>
              <strong>{banner.title}</strong>
              {banner.sub && <span>{banner.sub}</span>}
            </div>
          )}
          <GpsHud turn={telemetry.turn} />
          {(telemetry.stashTotal ?? 0) > 0 && (
            <div className="stash-counter">
              <b>$</b> CRATES {telemetry.stashes}/{telemetry.stashTotal}
            </div>
          )}
          <p className="gta-subtitle">
            {telemetry.stars > 0 ? (
              telemetry.respray ? (
                <>
                  Lose the <em className="cop">cops</em>. Keep your speed up.
                </>
              ) : (
                <>
                  Find a pink <em className="pink">Spray &amp; Pray</em> $ on
                  the radar to change your look.
                </>
              )
            ) : telemetry.checkpoint < telemetry.totalCheckpoints ? (
              <>
                {telemetry.checkpoint === telemetry.totalCheckpoints - 1 ? "Deliver the car to " : "Head for "}
                <em>{mission.checkpoints[telemetry.checkpoint]?.name}</em>.
              </>
            ) : (
              <>Bring it home.</>
            )}
          </p>
          <div className="radar">
            <Minimap
              x={telemetry.x ?? 0}
              z={telemetry.z ?? 40}
              heading={telemetry.heading ?? 0}
              checkpoint={telemetry.checkpoint}
              mission={mission}
              collected={collectedIds}
              hot={telemetry.stars > 0}
              showResprays={!telemetry.respray && telemetry.stars > 0}
            />
            <div className="radar-bars">
              <i style={{ width: `${telemetry.boost}%` }} />
              <i
                className="heat"
                style={{ width: `${telemetry.heat}%` }}
              />
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
            <button className="station" onClick={tune}>
              <Music2 size={13} />{" "}
              {sound
                ? `${STATIONS[station].name} ${STATIONS[station].freq}`
                : "RADIO OFF · R TO TUNE"}
            </button>
          </div>
          <div className="keyboard-hint">
            WASD / DRIVE <span>SPACE / DRIFT</span> SHIFT / BOOST
            <span>R / RADIO</span> ESC / PAUSE
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
          {paused && phase === "drive" && (
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
        <section className={`result-ui ${outcome}`}>
          <div className="gta-splash" aria-hidden="true">
            <strong>
              {outcome === "passed"
                ? "MISSION PASSED"
                : outcome === "busted"
                  ? "BUSTED"
                  : "MISSION FAILED"}
            </strong>
            <span>
              {outcome === "passed"
                ? `RESPECT + · $${result.score.toLocaleString()}`
                : outcome === "busted"
                  ? "Bay PD would like a word about the paint."
                  : "The meet closed without you."}
            </span>
          </div>
          <div className="result-panel">
            <span className="eyebrow">
              THE LAST DELIVERY ·{" "}
              {outcome === "passed"
                ? "COMPLETE"
                : outcome === "busted"
                  ? "IN CUSTODY"
                  : "TIME UP"}
            </span>
            <h1>
              {outcome === "passed" ? (
                <>
                  MADE IT.
                  <br />
                  <em>MADE IT YOURS.</em>
                </>
              ) : outcome === "busted" ? (
                <>
                  NICE PAINT.
                  <br />
                  <em>BAD LUCK.</em>
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
              {outcome === "passed"
                ? result.stars
                  ? `“${alias || "GHOST"}, you brought company. Still — that paint is a calling card.” — Nico`
                  : `“${alias || "GHOST"}, that’s not a car anymore. That’s a calling card.” — Nico`
                : outcome === "busted"
                  ? "“Next time, change the paint before they memorise it.” — Nico"
                  : "The meet closed, but the paint is still yours. Learn the corners. Come back faster."}
            </p>
            {outcome === "busted" && (
              <div className="mugshot">
                <div className="mugshot-photo">
                  <img src={wantedShot || result.snapshot} alt="Booking photo of your car" />
                  <span>BAY PD · BOOKING #{String(result.score).padStart(5, "0")}</span>
                </div>
                <div className="mugshot-info">
                  <b>“{alias || "GHOST"}”</b>
                  <small>CHARGE: EXTREMELY MEMORABLE PAINT</small>
                  {tattooCrop ? (
                    <>
                      <small>IDENTIFYING MARKS: LEFT FOREARM</small>
                      <img className="mugshot-ink" src={tattooCrop} alt="Your tattoo on file" />
                    </>
                  ) : (
                    <small>IDENTIFYING MARKS: NONE ON FILE</small>
                  )}
                </div>
              </div>
            )}
            <div className="result-stats">
              <span>
                <b>${result.score.toLocaleString()}</b>
                <small>PAYOUT</small>
              </span>
              <span>
                <b>{result.time.toFixed(1)}s</b>
                <small>RUN TIME</small>
              </span>
              <span>
                <b>
                  {respray ? `${Math.round(respray.changed * 100)}%` : "—"}
                </b>
                <small>RESPRAYED</small>
              </span>
            </div>
            <ul className="mission-rows">
              <li>
                <span>Wanted stars dropped</span>
                <i />
                <b>{respray ? `${respray.cleared}★` : "0★"}</b>
              </li>
              <li>
                <span>Stars still on you</span>
                <i />
                <b className={result.stars ? "hot" : ""}>{result.stars}★</b>
              </li>
              <li>
                <span>Drift cash</span>
                <i />
                <b>${Math.round(result.drift * 3).toLocaleString()}</b>
              </li>
              <li>
                <span>Scrapes &amp; rams</span>
                <i />
                <b>{result.collisions}</b>
              </li>
            </ul>
            <div className="best-score">
              PERSONAL BEST <b>${best.toLocaleString()}</b>
              <span>THIS BROWSER</span>
            </div>
            <button
              className="btn primary full"
              onClick={() => setPhase("news")}
            >
              <Tv size={18} />
              YOU MADE THE NEWS
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
        </section>
      )}
      {phase === "news" && result && (
        <News
          alias={alias || "GHOST"}
          outcome={outcome}
          result={result}
          cctv={wantedShot || result.snapshot}
          emblem={emblemUrl}
          tattoo={tattooCrop}
          before={respray?.before || saved}
          after={respray?.after || ""}
          changed={respray?.changed ?? 0}
          onPhoto={() => {
            setPhase("photo");
            setNotice(
              "Drag to find your angle. Capture the shot, then make it a cover.",
            );
          }}
          onRetry={startRun}
          onHijack={() => void openHijack()}
        />
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
              OPEN IN SNAPPIX
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
      {loading && (
        <div className="gta-loading" style={{ backgroundImage: `url(${loading.art})` }}>
          <div className="gta-loading-logo">
            SUNDOWN<small>CUSTOMS</small>
          </div>
          <p className="gta-loading-tip">
            <b>TIP</b> {loading.tip}
          </p>
          <span className="gta-loading-spin">
            <i /> LOADING
          </span>
        </div>
      )}
      <Guide
        tip={tip}
        onClose={() => setTip(null)}
        placement={EDITOR_PHASES.includes(phase) ? "editor" : "top"}
      />
      {posted && phase === "photo" && (
        <BayFeed
          photo={photo}
          alias={alias || "GHOST"}
          avatar={emblemUrl || baseWrap}
          score={result?.score ?? 0}
          outcome={outcome}
          onClose={() => setPosted(false)}
        />
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
    </main>
  );
}
export default App;
