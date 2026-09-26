import { FLASH, flashThumb } from "./tattoo";
import "./tattoo.css";

// Crisp thumbnails on retina phones without rendering huge canvases.
const THUMB = Math.min(320, Math.round(160 * Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)));

/** Ink & Iron parlor wall: pick a flash design to stencil onto the forearm before Unlayer opens. */
export default function FlashRack({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const current = FLASH.find((f) => f.id === selected);
  return (
    <div className="flash-rack">
      <div className="flash-rack-head">
        <span className="flash-rack-title">INK &amp; IRON</span>
        <span className="flash-rack-sub">FLASH WALL · {current ? current.name : "PICK A DESIGN"}</span>
      </div>
      <div className="flash-grid" role="group" aria-label="Tattoo flash designs">
        <button
          type="button"
          aria-pressed={selected === null}
          className={`flash-card flash-none ${selected === null ? "on" : ""}`}
          onClick={() => onSelect(null)}
          title="Freehand: bare skin"
        >
          <span className="flash-none-mark" aria-hidden="true">✎</span>
          <span className="flash-name">Freehand</span>
        </button>
        {FLASH.map((f, i) => {
          const on = selected === f.id;
          return (
            <button
              type="button"
              key={f.id}
              aria-pressed={on}
              className={`flash-card ${on ? "on" : ""}`}
              style={{ ["--tilt" as string]: `${((i * 37) % 7) - 3}deg` }}
              onClick={() => onSelect(on ? null : f.id)}
              title={f.name}
            >
              <span className="flash-pin" aria-hidden="true" />
              <img src={flashThumb(f.id, THUMB)} alt="" draggable={false} />
              <span className="flash-name">{f.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
