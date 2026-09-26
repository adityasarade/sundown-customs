import { useEffect, useState } from "react";
import { ArrowRight, Radio } from "lucide-react";
import { TOUR_BOARD_NAMES, TOUR_SHOT_MS } from "./World";

/**
 * Overlay for the post-hijack fly-by: the 3D camera visits every Bay PD
 * billboard in the city, each now showing the visitor's hijacked frame.
 */
export default function BillboardTour({
  crew,
  frame,
  viewers,
  onDone,
}: {
  crew: string;
  frame: string;
  viewers: number;
  onDone: () => void;
}) {
  const [shot, setShot] = useState(0);
  const [count, setCount] = useState(Math.round(viewers * 0.6));
  const total = TOUR_BOARD_NAMES.length;
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const elapsed = performance.now() - start;
      const k = Math.floor(elapsed / TOUR_SHOT_MS);
      if (k >= total) {
        clearInterval(id);
        onDone();
        return;
      }
      setShot(k);
      setCount(Math.round(viewers * (0.6 + (0.9 * elapsed) / (TOUR_SHOT_MS * total))));
    }, 120);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reactions = [
    `BAY PD: “WHO AUTHORISED THIS BILLBOARD?”`,
    `CHIEF VARGA SEEN THROWING HIS RADIO`,
    `CITIZENS REPORT ${crew}’S ART “ACTUALLY PRETTY GOOD”`,
    `BAY 9 CONFIRMS: WE DID NOT APPROVE THIS`,
    `TRAFFIC STOPS ON PALM AVE AS DRIVERS FILM THE SCREENS`,
    `SPRAY & PRAY OWNER: “NEVER SEEN THIS IN MY LIFE”`,
  ].join("   ◆   ");
  return (
    <section className="tour" aria-label="Your broadcast on the city's billboards">
      <i className="tour-bar top" aria-hidden="true" />
      <i className="tour-bar bottom" aria-hidden="true" />
      <header className="tour-head">
        <span className="tour-live">
          <i /> LIVE · SIGNAL HIJACKED BY {crew}
        </span>
        <h2>
          ON EVERY SCREEN
          <br />
          <em>IN SOLANA BAY.</em>
        </h2>
      </header>
      <aside className="tour-now">
        <span>NOW SHOWING</span>
        {frame && <img src={frame} alt="Your hijacked broadcast frame" />}
        <b>
          {count.toLocaleString()} <small>WATCHING</small>
        </b>
      </aside>
      <div className="tour-shot" key={shot}>
        <Radio size={16} />
        <span>
          SCREEN {shot + 1}/{total} · <b>{TOUR_BOARD_NAMES[shot]}</b> BILLBOARD
        </span>
        <div className="tour-pips">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i <= shot ? "on" : ""} />
          ))}
        </div>
      </div>
      <div className="tour-ticker" aria-hidden="true">
        <div>
          <span>{reactions}</span>
          <span>{reactions}</span>
        </div>
      </div>
      <button className="tour-skip" onClick={onDone}>
        SKIP <ArrowRight size={15} />
      </button>
    </section>
  );
}
