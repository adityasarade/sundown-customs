import type { Turn, TurnDir } from "./gps";
import "./jobs.css";

const VERB: Record<TurnDir, string> = {
  left: "Turn left",
  right: "Turn right",
  straight: "Continue",
  arrive: "Destination",
  uturn: "Turn around",
};

/** 180 m / 1.2 km, rounded the way sat-navs do. */
export function formatDistance(m: number) {
  const d = Number.isFinite(m) ? Math.max(0, m) : 0;
  if (d < 25) return "now";
  const rounded = Math.round(d / 10) * 10;
  if (rounded >= 1000) return `${(d / 1000).toFixed(1)} km`;
  return `${rounded} m`;
}

function Arrow({ dir }: { dir: TurnDir }) {
  if (dir === "arrive")
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M14 43 V6" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M16 6 H38 L33 13.5 L38 21 H16 Z" fill="currentColor" />
        <path d="M21 6 H27 V13.5 H21 Z M27 13.5 H33 V21 H27 Z" fill="#141323" opacity=".85" />
      </svg>
    );
  if (dir === "uturn")
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M32 45 V20 Q32 8 21 8 Q10 8 10 20 V30" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
        <path d="M10 44 L-1 28 H21 Z" fill="currentColor" transform="translate(0 0)" />
      </svg>
    );
  if (dir === "straight")
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 44 V16" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
        <path d="M24 3 L37 19 H11 Z" fill="currentColor" strokeLinejoin="round" />
      </svg>
    );
  const flip = dir === "left" ? "translate(48 0) scale(-1 1)" : undefined;
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <g transform={flip}>
        <path d="M14 45 V26 Q14 18 22 18 H30" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M44 18 L28 5 V31 Z" fill="currentColor" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Top-centre GTA-style next-turn card. */
export default function GpsHud({ turn }: { turn: Turn | null | undefined }) {
  // Telemetry arrives a frame after the run starts; render nothing until then.
  if (!turn) return null;
  const soon = turn.dir !== "straight" && turn.distance < 45;
  const street = turn.street || (turn.dir === "straight" ? "Follow the route" : "");
  return (
    <div className={`gps-hud gps-${turn.dir}${soon ? " gps-soon" : ""}`}>
      {/* Only the instruction is live: the distance ticks every frame and would flood screen readers. */}
      <span className="gps-sr" role="status" aria-live="polite">
        {VERB[turn.dir]}
        {turn.street ? ` ${turn.dir === "arrive" ? "" : "onto "}${turn.street}` : ""}
      </span>
      <div className="gps-arrow">
        <Arrow dir={turn.dir} />
      </div>
      <div className="gps-copy" aria-hidden="true">
        <div className="gps-top">
          <b className="gps-dist">{formatDistance(turn.distance)}</b>
          <span className="gps-verb">{VERB[turn.dir]}</span>
        </div>
        {street && <div className="gps-street">{street}</div>}
      </div>
    </div>
  );
}
