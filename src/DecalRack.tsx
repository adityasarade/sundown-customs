import { useState } from "react";
import { DECALS, SLOTS, decalThumb, type Slot } from "./decals";

const CATS = [
  { id: "crew", name: "Crew" },
  { id: "number", name: "Numbers" },
  { id: "sponsor", name: "Sponsors" },
  { id: "flair", name: "Flair" },
] as const;

/** Pre-built original symbols stamped onto the livery before it opens in Unlayer. */
export default function DecalRack({
  placed,
  onChange,
}: {
  placed: Partial<Record<Slot, string>>;
  onChange: (next: Partial<Record<Slot, string>>) => void;
}) {
  const [slot, setSlot] = useState<Slot>("hood");
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("crew");
  const count = Object.values(placed).filter(Boolean).length;
  return (
    <div className="decal-rack">
      <div className="field-label">
        DECAL RACK <span>{count}/4 PLACED</span>
      </div>
      <div className="rack-slots" role="tablist" aria-label="Decal position">
        {SLOTS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={slot === s.id}
            className={`${slot === s.id ? "on" : ""} ${placed[s.id] ? "filled" : ""}`}
            onClick={() => setSlot(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="rack-cats">
        {CATS.map((c) => (
          <button
            key={c.id}
            className={cat === c.id ? "on" : ""}
            onClick={() => setCat(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="rack-grid">
        {DECALS.filter((d) => d.category === cat).map((d) => {
          const on = placed[slot] === d.id;
          return (
            <button
              key={d.id}
              className={on ? "on" : ""}
              aria-pressed={on}
              title={d.name}
              onClick={() => onChange({ ...placed, [slot]: on ? undefined : d.id })}
            >
              <img src={decalThumb(d.id, 96)} alt={d.name} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
