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
    if (kind !== "respray") return;
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
          <ArrowLeft size={16} />{" "}
          {kind === "wrap" || kind === "emblem"
            ? "Back to garage"
            : kind === "respray"
              ? "Drive off unchanged"
              : "Back to photo"}
        </button>
        <span className="eyebrow">
          {kind === "emblem"
            ? "CREW EMBLEM CREATOR"
            : kind === "wrap"
            ? "02 / THE PAINT BOOTH"
            : kind === "respray"
              ? `SPRAY & PRAY · ${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}`
              : "SNAPPIX · DARKROOM"}
        </span>
        <span className="editor-credit">Powered by Unlayer</span>
      </div>
      <div className="editor-intro">
        <h2>
          {kind === "emblem"
            ? "Rep your crew."
            : kind === "wrap"
            ? "Leave your mark."
            : kind === "respray"
              ? "Lose the heat."
              : "Make it post-worthy."}
        </h2>
        <p>
          {kind === "emblem"
            ? "Your crew emblem rides on the roof of your car, next to your name on BAYFEED, and on Bay 9 News. Stack symbols, shapes and a crew name, then Rep the crew."
            : kind === "wrap"
            ? "Your decals are already on. Tag your name, spray a stripe, stick on more. Fit the wrap to put it on the car."
            : kind === "respray"
              ? "Bay PD has a description of this exact paint. Repaint it — every 8% of the livery you change shakes off one star. The clock is stopped."
              : "Your actual 3D shot. Frame it up, grade it, add a border and a caption — then post it to BAYFEED."}
        </p>
      </div>
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
        <span>
          <b>01</b>{" "}
          {kind === "respray" ? "Kit or Instant respray → big change, fast" : "Tag → your crew name"}
        </span>
        <span>
          <b>02</b>{" "}
          {kind === "respray" ? "Cover-up / Spray can → hide the old paint" : "Spray can → a signature stripe"}
        </span>
        <span>
          <b>03</b> Save →{" "}
          {kind === "wrap"
            ? "Fit the wrap"
            : kind === "respray"
              ? "Respray & go"
              : "Post to BAYFEED"}{" "}
          <Check size={13} />
        </span>
      </div>
      <div className="editor-mount" ref={hostRef}>
        {!ready && !issue && (
          <div className="editor-loading">
            <LoaderCircle className="spin" />
            <p>Opening the paint booth…</p>
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
        {hint ||
          (kind === "photo"
            ? "Finish your photograph, then use Save to keep it for your run card. Edits stay in your browser."
            : kind === "respray"
              ? "We compare your saved pixels against the paint the cops saw. Bigger change, fewer stars."
              : "Your saved pixels become the car’s hood and side panels. Edits stay in your browser.")}
        <span className="portrait-tip">
          Tool settings sit below your canvas. Scroll them for more options.
        </span>
      </div>
    </section>
  );
}
