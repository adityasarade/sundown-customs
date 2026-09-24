import { useEffect, useMemo, useRef, useState } from "react";
import ImageEditor, {
  type ImageEditorRef,
  type ImageEditorSaveResult,
} from "@unlayer/react-image-editor";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { labelEditorActions } from "./editor-accessibility";
import { judgeEditorSave } from "./editor-gate";
export default function Editor({
  source,
  onSave,
  onCancel,
  onPreview,
  kind = "wrap",
}: {
  source: string;
  onSave: (url: string) => void;
  onCancel: () => void;
  onPreview: (url: string) => void;
  kind?: "wrap" | "photo";
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ref = useRef<ImageEditorRef>(null),
    baseline = useRef<string | null>(null),
    dirty = useRef(false),
    available = useRef(false);
  const [ready, setReady] = useState(false),
    [issue, setIssue] = useState(""),
    [key, setKey] = useState(0),
    [hint, setHint] = useState("");
  const options = useMemo(
    () => ({
      theme: "light" as const,
      aiAssistantOpenState: "closed" as const,
      features: {
        imageEditor: {
          tools: {
            crop: true,
            filter: true,
            draw: true,
            text: true,
            shapes: true,
            stickers: true,
            resize: false,
            frame: false,
            corners: false,
          },
        },
      },
    }),
    [],
  );
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
    if (hostRef.current) return labelEditorActions(hostRef.current);
  }, [key, ready]);
  const save = ({ dataUrl }: ImageEditorSaveResult) => {
    const verdict = judgeEditorSave({
      saved: dataUrl,
      baseline: baseline.current,
      current: ref.current?.editor?.getImage() ?? null,
      sawChanges: dirty.current,
      changeTrackingAvailable: available.current,
    });
    if (kind === "wrap" && !verdict.edited) {
      setHint(
        "Make it yours first: add text, draw a mark, or try a filter. Then hit Save.",
      );
      return;
    }
    onSave(dataUrl);
  };
  return (
    <section className="editor-screen">
      <div className="editor-heading">
        <button className="icon-text" onClick={onCancel}>
          <ArrowLeft size={16} /> Back to {kind === "wrap" ? "garage" : "photo"}
        </button>
        <span className="eyebrow">
          {kind === "wrap" ? "02 / THE PAINT BOOTH" : "THE DARKROOM"}
        </span>
        <span className="editor-credit">Powered by Unlayer</span>
      </div>
      <div className="editor-intro">
        <h2>{kind === "wrap" ? "Leave your mark." : "Make the cover."}</h2>
        <p>
          {kind === "wrap"
            ? "Add your name, spray a line, or change the mood. Save to fit your work to the car."
            : "Crop, grade, or caption your actual 3D shot. Save to keep the final photograph."}
        </p>
      </div>
      <div className="tool-tips">
        <span>
          <b>01</b> Text → your crew name
        </span>
        <span>
          <b>02</b> Draw → a signature stripe
        </span>
        <span>
          <b>03</b> Save → {kind === "wrap" ? "fit the wrap" : "keep the shot"}{" "}
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
            : "Your saved pixels become the car’s hood and side panels. Edits stay in your browser.")}
        <span className="portrait-tip">
          Tool settings sit below your canvas. Scroll them for more options.
        </span>
      </div>
    </section>
  );
}
