import { useEffect, useMemo, useRef, useState } from "react";
import ImageEditor, {
  type ImageEditorOptions,
  type ImageEditorRef,
  type ImageEditorSaveResult,
} from "@unlayer/react-image-editor";
import { actionNames, editorOptions, type EditorKind } from "./editor-contexts";
import { KITS, disguise } from "./decals";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { labelEditorActions } from "./editor-accessibility";
import { judgeEditorSave } from "./editor-gate";
import { paintChange } from "./paint-diff";
type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  intro: string;
  tips: [string, string, string];
  foot: string;
  loading: string;
};
const COPY: Record<EditorKind, Copy> = {
  wrap: {
    back: "Back to garage",
    eyebrow: "01 / THE PAINT BOOTH",
    title: "Leave your mark.",
    intro: "Your decals are already on. Tag your name, spray a stripe, stick on more. Fit the wrap to put it on the car.",
    tips: ["Tag → your crew name", "Spray can → a signature stripe", "Fit the wrap"],
    foot: "Your saved pixels become the car’s hood and side panels. Edits stay in your browser.",
    loading: "Opening the paint booth…",
  },
  emblem: {
    back: "Back to garage",
    eyebrow: "CREW EMBLEM CREATOR",
    title: "Rep your crew.",
    intro: "Your crew emblem rides on the roof of your car, in your HUD, on BAYFEED and on Bay 9 News. Stack symbols, badge shapes and a crew name.",
    tips: ["Symbols → stack a mascot", "Crew name → your tag", "Rep the crew"],
    foot: "The saved emblem becomes a texture on your roof. Edits stay in your browser.",
    loading: "Opening the emblem creator…",
  },
  plan: {
    back: "Back to garage",
    eyebrow: "02 / THE PLAN · NICO’S MAP",
    title: "Draw the getaway.",
    intro: "This map is the mission. Draw a line from START to a drop, circle stash crates in yellow, and avoid the red cameras. Your saved pixels become the GPS route, the checkpoints and the pickups.",
    tips: ["Route marker → START to a gold drop", "Circle a crate in YELLOW → cash", "Lock the plan"],
    foot: "We read your saved ink: route pixels snap to the nearest roads; yellow rings claim crates.",
    loading: "Unrolling Nico’s map…",
  },
  ink: {
    back: "Back to the parlor",
    eyebrow: "INK & IRON · TATTOO PARLOR",
    title: "Make it permanent.",
    intro: "Your flash is stencilled on. Add linework with the needle, a name in script, a little shading. It rides on your arm out the driver’s window — and on your mugshot if Bay PD ever catches you.",
    tips: ["Needle → your own linework", "Script → a name that matters", "Ink it"],
    foot: "The saved skin becomes your driver’s arm texture in the 3D car.",
    loading: "Warming up the machine…",
  },
  respray: {
    back: "Drive off unchanged",
    eyebrow: "SPRAY & PRAY",
    title: "Lose the heat.",
    intro: "Bay PD has a description of this exact paint. Repaint it — every 8% of the livery you change shakes off one star. The clock is stopped.",
    tips: ["Kit or Instant respray → big change, fast", "Cover-up / Spray can → hide the old paint", "Respray & go"],
    foot: "We compare your saved pixels against the paint the cops saw. Bigger change, fewer stars.",
    loading: "Opening the respray booth…",
  },
  hijack: {
    back: "Abort the hijack",
    eyebrow: "SIGNAL HIJACK · BAY 9 LIVE FEED",
    title: "Own the airwaves.",
    intro: "You’re patched into Bay 9’s live frame. Deface the anchor, rewrite the headline, slap your crew on it. Whatever you save goes out to every screen in Solana Bay.",
    tips: ["Deface → draw on the broadcast", "Your message → a new headline", "GO LIVE"],
    foot: "Takeover strength is the share of the frame you changed. More chaos, more viewers.",
    loading: "Patching into the Bay 9 uplink…",
  },
  photo: {
    back: "Back to photo",
    eyebrow: "SNAPPIX · DARKROOM",
    title: "Make it post-worthy.",
    intro: "Your actual 3D shot. Frame it up, grade it, add a border and a caption — then post it to BAYFEED.",
    tips: ["Frame up → crop the shot", "Borders → a Snappix frame", "Post to BAYFEED"],
    foot: "Finish your photograph, then post it. Edits stay in your browser.",
    loading: "Opening Snappix…",
  },
};
const METERED: EditorKind[] = ["respray", "hijack"];
export default function Editor({
  source,
  onSave,
  onCancel,
  onPreview,
  kind = "wrap",
  stars = 0,
}: {
  source: string;
  onSave: (url: string) => void;
  onCancel: () => void;
  onPreview: (url: string) => void;
  kind?: EditorKind;
  stars?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const copy = COPY[kind];
  const ref = useRef<ImageEditorRef>(null),
    baseline = useRef<string | null>(null),
    dirty = useRef(false),
    available = useRef(false);
  const [ready, setReady] = useState(false),
    [issue, setIssue] = useState(""),
    [key, setKey] = useState(0),
    [hint, setHint] = useState(""),
    [live, setLive] = useState(0),
    [pending, setPending] = useState(false);
  useEffect(() => {
    if (!METERED.includes(kind)) return;
    let busy = false;
    const id = setInterval(async () => {
      const editor = ref.current?.editor;
      if (!editor || busy) return;
      busy = true;
      try {
        const now = editor.getImage();
        const changed = editor.hasChanges();
        const pct = now?.startsWith("data:image/")
          ? await paintChange(source, now)
          : 0;
        setLive(pct);
        setPending(changed && pct < 0.01);
      } catch {
      } finally {
        busy = false;
      }
    }, 1400);
    return () => clearInterval(id);
  }, [kind, source]);
  const liveCleared = Math.min(stars, Math.floor(live / 0.08));
  const options = useMemo(
    () => editorOptions(kind) as unknown as ImageEditorOptions,
    [kind],
  );
  const kitted = useRef(false);
  const [kitBusy, setKitBusy] = useState("");
  const applyKit = async (id: (typeof KITS)[number]["id"]) => {
    const editor = ref.current?.editor;
    if (!editor || kitBusy) return;
    setKitBusy(id);
    try {
      const url = await disguise(source, id);
      await editor.reset(url);
      kitted.current = true;
      dirty.current = true;
      setHint("Disguise kit loaded into the booth. Tweak it, then Respray & go.");
    } finally {
      setKitBusy("");
    }
  };
  useEffect(() => {
    const id = setInterval(() => {
      const editor = ref.current?.editor;
      if (!editor) return;
      try {
        const changed = editor.hasChanges();
        available.current = true;
        if (changed) dirty.current = true;
        if (!baseline.current && !changed) {
          const image = editor.getImage();
          if (image?.startsWith("data:image/")) baseline.current = image;
        }
      } catch {}
    }, 700);
    return () => clearInterval(id);
  }, [onPreview]);
  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(
      () =>
        setIssue(
          "The paint booth is taking longer than usual. Check your connection, then retry.",
        ),
      25000,
    );
    return () => clearTimeout(timeout);
  }, [ready, key]);
  useEffect(() => {
    if (hostRef.current)
      return labelEditorActions(hostRef.current, actionNames(kind));
  }, [key, ready]);
  const save = ({ dataUrl }: ImageEditorSaveResult) => {
    const verdict = judgeEditorSave({
      saved: dataUrl,
      baseline: baseline.current,
      current: ref.current?.editor?.getImage() ?? null,
      sawChanges: dirty.current || kitted.current,
      changeTrackingAvailable: available.current,
    });
    if (kind !== "photo" && !verdict.edited) {
      setHint(
        kind === "respray"
          ? "Same paint, same stars. Change something — every 8% you repaint drops a star."
          : "Make it yours first: add text, draw a mark, or try a filter. Then hit Save.",
      );
      return;
    }
    onSave(dataUrl);
  };
  return (
    <section className={`editor-screen editor-${kind}`}>
      <div className="editor-heading">
        <button className="icon-text" onClick={onCancel}>
          <ArrowLeft size={16} /> {copy.back}
        </button>
        <span className="eyebrow">
          {copy.eyebrow}
          {kind === "respray" &&
            ` · ${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}`}
        </span>
        <span className="editor-credit">Powered by Unlayer</span>
      </div>
      <div className="editor-intro">
        <h2>{copy.title}</h2>
        <p>{copy.intro}</p>
      </div>
      {kind === "hijack" && (
        <div className="respray-meter hijack-meter" role="status">
          <span>
            SIGNAL TAKEOVER{" "}
            <b>{pending ? "…" : `${Math.round(live * 100)}%`}</b>
          </span>
          <div className="respray-bar">
            <i style={{ width: `${Math.min(100, live * 160)}%` }} />
          </div>
          <span className="respray-stars">
            <small>
              {pending
                ? "MEASURED WHEN YOU GO LIVE"
                : `≈ ${Math.round(120 + live * 880)}K VIEWERS`}
            </small>
          </span>
        </div>
      )}
      {kind === "respray" && (
        <div className="respray-meter" role="status">
          <span>
            PAINT CHANGED{" "}
            <b>{pending ? "…" : `${Math.round(live * 100)}%`}</b>
          </span>
          <div className="respray-bar">
            <i style={{ width: `${Math.min(100, (live / Math.max(0.08, stars * 0.08)) * 100)}%` }} />
          </div>
          <span className="respray-stars">
            {Array.from({ length: stars }, (_, i) => (
              <em key={i} className={i < stars - liveCleared ? "" : "gone"}>
                ★
              </em>
            ))}
            <small>
              {pending
                ? "MEASURED ON SAVE"
                : liveCleared >= stars
                  ? "THEY WON’T RECOGNISE IT"
                  : `−${liveCleared}★ SO FAR`}
            </small>
          </span>
        </div>
      )}
      {kind === "respray" && (
        <div className="kit-rack">
          <span className="kit-label">DISGUISE KITS</span>
          {KITS.map((k) => (
            <button
              key={k.id}
              className={`kit ${kitBusy === k.id ? "busy" : ""}`}
              onClick={() => applyKit(k.id)}
              disabled={!ready || !!kitBusy}
              title={k.blurb}
            >
              <b>{k.name}</b>
              <small>{k.blurb}</small>
            </button>
          ))}
        </div>
      )}
      <div className="tool-tips">
        {copy.tips.map((t, i) => (
          <span key={t}>
            <b>0{i + 1}</b> {i === 2 ? <>Save → {t} <Check size={13} /></> : t}
          </span>
        ))}
      </div>
      <div className="editor-mount" ref={hostRef}>
        {!ready && !issue && (
          <div className="editor-loading">
            <LoaderCircle className="spin" />
            <p>{copy.loading}</p>
            <small>Loading the real React Image Editor</small>
          </div>
        )}
        {issue ? (
          <div className="editor-error">
            <h3>The booth needs a restart.</h3>
            <p>{issue}</p>
            <button
              className="btn primary"
              onClick={() => {
                setIssue("");
                setReady(false);
                baseline.current = null;
                dirty.current = false;
                setKey((k) => k + 1);
              }}
            >
              <RotateCcw size={16} />
              Retry editor
            </button>
            <button className="btn text" onClick={onCancel}>
              Back to garage
            </button>
          </div>
        ) : (
          <ImageEditor
            key={key}
            ref={ref}
            image={source}
            options={options}
            minHeight="100%"
            onLoad={() => {
              setReady(true);
              setIssue("");
            }}
            onSave={save}
            onCancel={onCancel}
            onError={(e) => setIssue(e.message)}
            onLoadError={() =>
              setIssue(
                "Your artwork could not load. Retry the booth to restore it.",
              )
            }
          />
        )}
      </div>
      <div className="editor-foot" role="status">
        <Sparkles size={14} />
        {hint || copy.foot}
        <span className="portrait-tip">
          Tool settings sit below your canvas. Scroll them for more options.
        </span>
      </div>
    </section>
  );
}
