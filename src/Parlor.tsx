import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import FlashRack from "./FlashRack";
import { composeTattoo } from "./tattoo";

/**
 * Ink & Iron: pick a flash design, see it stencilled on the arm, then take it
 * into the chair (the native Unlayer "ink" context) to make it your own.
 */
export default function Parlor({
  current,
  onChair,
  onBack,
}: {
  /** The last tattoo the visitor inked (full arm image), if any. */
  current: string;
  onChair: (stencilled: string) => void;
  onBack: () => void;
}) {
  const [flash, setFlash] = useState<string | null>("palm-skull");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    let live = true;
    composeTattoo("/art/arm.webp", flash)
      .then((url) => live && setPreview(url))
      .catch(() => live && setPreview("/art/arm.webp"));
    return () => {
      live = false;
    };
  }, [flash]);
  return (
    <section className="parlor">
      <div className="parlor-bg" />
      <header className="parlor-head">
        <button className="icon-text" onClick={onBack}>
          <ArrowLeft size={16} /> Back to garage
        </button>
        <span className="parlor-sign">
          INK <i>&amp;</i> IRON
        </span>
        <span className="parlor-sub">TATTOOS · PIERCINGS · NO REFUNDS</span>
      </header>
      <div className="parlor-body">
        <div className="parlor-stage">
          <figure className="parlor-arm">
            {preview && <img src={preview} alt="Your arm with the chosen flash stencilled on" />}
            <figcaption>
              <Sparkles size={13} /> STENCIL PREVIEW · your driver’s left arm
            </figcaption>
          </figure>
          {current && (
            <figure className="parlor-current">
              <img src={current} alt="Your current tattoo" />
              <figcaption>CURRENTLY INKED</figcaption>
            </figure>
          )}
        </div>
        <aside className="parlor-panel">
          <span className="eyebrow">PICK YOUR FLASH</span>
          <h2>
            Wear the <em>job.</em>
          </h2>
          <p>
            Choose a design off the wall, or go freehand. In the chair you’ll
            finish it in the image editor — it rides on your arm out the driver’s
            window, and on your mugshot if you get busted.
          </p>
          <FlashRack selected={flash} onSelect={setFlash} />
          <button
            className="btn primary full"
            disabled={!preview}
            onClick={() => onChair(preview)}
          >
            GET IN THE CHAIR <ArrowRight size={18} />
          </button>
          {current && (
            <button className="btn secondary full parlor-rework" onClick={() => onChair(current)}>
              KEEP WORKING ON MY CURRENT TATTOO
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}
