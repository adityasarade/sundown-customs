import { useEffect, useRef } from "react";
import { Pencil, Play, Route } from "lucide-react";
import { MAP, landmarks, polylineLength, worldToMap } from "./city";
import type { Mission } from "./city";
import "./plan.css";

export type PlanLockedProps = {
  mapUrl: string;
  mission: Mission;
  onStart(): void;
  onRedo(): void;
  onNicoRoute(): void;
};

const STAR_COUNT = 5;
const CAMERA_RADIUS = (20 / (MAP.maxX - MAP.minX)) * MAP.size;

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function PlanLocked({
  mapUrl,
  mission,
  onStart,
  onRedo,
  onNicoRoute,
}: PlanLockedProps) {
  const startRef = useRef<HTMLButtonElement>(null);
  // Focus START without scrolling: on phones autoFocus would jump the screen
  // past the headline and the map.
  useEffect(() => {
    startRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRedo]);

  // route[0] is the garage pad just off the first node; draw that first leg
  // as an elbow so the GPS line never cuts across a block.
  const [first, second] = mission.route;
  const drawnRoute =
    first && second && first.x !== second.x && first.z !== second.z
      ? [first, { x: first.x, z: second.z }, ...mission.route.slice(1)]
      : mission.route;
  const routePoints = drawnRoute.map((point) => {
    const projected = worldToMap(point);
    return `${projected.px},${projected.py}`;
  }).join(" ");
  const destination = worldToMap(mission.destination);
  const start = worldToMap(mission.route[0] ?? { x: 0, z: 40 });
  const heatStars = mission.camerasOnRoute.length > 0 ? 3 : 1;
  const drawnPercent = Math.round(mission.drawnShare * 100);
  const allStashes = landmarks("stash");

  return (
    <section
      className="plan-locked"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-locked-title"
    >
      <div className="plan-scanlines" aria-hidden="true" />
      <header className="plan-header">
        <p className="plan-kicker">SOLANA BAY · HEIST NIGHT</p>
        <h1 className="plan-title" id="plan-locked-title">PLAN LOCKED</h1>
        <span className="plan-title-rule" aria-hidden="true" />
      </header>

      <div className="plan-layout">
        <div className="plan-main">
          <div className="plan-map-frame">
            <div className="plan-map">
              <img className="plan-map-image" src={mapUrl} alt="Your saved plan map" />
              <svg
                className="plan-route-overlay"
                viewBox="0 0 1200 960"
                aria-label={`Snapped route to ${mission.destination.name}`}
              >
                <defs>
                  <filter id="plan-route-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="plan-gold-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {routePoints && (
                  <>
                    <polyline className="plan-route-casing" points={routePoints} />
                    <polyline className="plan-route-line" points={routePoints} />
                  </>
                )}

                <circle className="plan-start-ring" cx={start.px} cy={start.py} r="15" />
                <circle className="plan-start-dot" cx={start.px} cy={start.py} r="7" />

                {mission.checkpoints.slice(0, -1).map((checkpoint, index) => {
                  const point = worldToMap(checkpoint);
                  return (
                    <g className="plan-checkpoint" key={`${checkpoint.x}:${checkpoint.z}:${index}`}>
                      <circle cx={point.px} cy={point.py} r="11" />
                      <text x={point.px} y={point.py + 4}>{index + 1}</text>
                    </g>
                  );
                })}

                {mission.stashes.map((stash) => {
                  const point = worldToMap(stash);
                  return (
                    <g className="plan-stash-marker" key={stash.id}>
                      <circle cx={point.px} cy={point.py} r="24" />
                      <text x={point.px} y={point.py + 6}>$</text>
                    </g>
                  );
                })}

                {mission.camerasOnRoute.map((camera) => {
                  const point = worldToMap(camera);
                  return (
                    <g className="plan-camera-marker" key={camera.id}>
                      <circle className="plan-camera-radius" cx={point.px} cy={point.py} r={CAMERA_RADIUS} />
                      <circle className="plan-camera-dot" cx={point.px} cy={point.py} r="7" />
                    </g>
                  );
                })}

                <g className="plan-destination" filter="url(#plan-gold-glow)">
                  <circle className="plan-destination-pulse" cx={destination.px} cy={destination.py} r="25" />
                  <circle className="plan-destination-ring" cx={destination.px} cy={destination.py} r="25" />
                  <path
                    className="plan-destination-pole"
                    d={`M ${destination.px - 4} ${destination.py + 14} V ${destination.py - 17}`}
                  />
                  <path
                    className="plan-destination-flag"
                    d={`M ${destination.px - 3} ${destination.py - 17} L ${destination.px + 16} ${destination.py - 11} L ${destination.px - 3} ${destination.py - 4} Z`}
                  />
                </g>
              </svg>
            </div>
            <div className="plan-frame-corner plan-frame-corner-tl" aria-hidden="true" />
            <div className="plan-frame-corner plan-frame-corner-br" aria-hidden="true" />
          </div>
          <p className="plan-map-caption">
            ROUTE SNAPPED TO STREET GRID · {mission.route.length} WAYPOINTS
          </p>
        </div>

        <aside className="plan-panel">
          <div className="plan-stats">
            <div className="plan-stat">
              <span className="plan-stat-label">DESTINATION</span>
              <strong className="plan-stat-value plan-stat-value-pink">{mission.destination.name}</strong>
            </div>

            <div className="plan-stat plan-stat-split">
              <div className="plan-stat-half">
                <span className="plan-stat-label">DISTANCE</span>
                <strong className="plan-stat-value">{Math.round(polylineLength(mission.route))} m</strong>
              </div>
              <div className="plan-stat-half">
                <span className="plan-stat-label">TIME LIMIT</span>
                <strong className="plan-stat-value">{formatTime(mission.seconds)}</strong>
              </div>
            </div>

            <div className="plan-stat">
              <span className="plan-stat-label">CAMERAS ON ROUTE</span>
              <div className="plan-stat-row">
                <strong className="plan-stat-value">{mission.camerasOnRoute.length}</strong>
                <span className="plan-heat-label">HEAT FORECAST</span>
                <span className="plan-stars" aria-label={`${heatStars} of ${STAR_COUNT} heat stars`}>
                  {Array.from({ length: STAR_COUNT }, (_, index) => (
                    <span className={index < heatStars ? "plan-star plan-star-lit" : "plan-star"} key={index}>★</span>
                  ))}
                </span>
              </div>
              <span className="plan-stat-note">
                {mission.camerasOnRoute.length > 0 ? "Camera = 3★ instantly" : "Patrol spots you late = 1★"}
              </span>
            </div>

            <div className="plan-stat plan-stat-split">
              <div className="plan-stat-half">
                <span className="plan-stat-label">STASHES MARKED</span>
                <strong className="plan-stat-value">{mission.stashes.length} / {allStashes.length}</strong>
              </div>
              <div className="plan-stat-half">
                <span className="plan-stat-label">YOUR INK</span>
                <strong className="plan-stat-value">
                  {mission.fromDrawing ? `${drawnPercent}%` : "NICO’S ROUTE"}
                </strong>
              </div>
              <div className="plan-progress" aria-label={`${drawnPercent}% of route drawn`}>
                <span className="plan-progress-fill" style={{ width: `${drawnPercent}%` }} />
              </div>
            </div>
          </div>

          <section className="plan-nico" aria-label="Nico's notes">
            <div className="plan-nico-heading">
              <img className="plan-avatar" src="/art/nico.webp" alt="" />
              <div>
                <strong className="plan-nico-name">Nico</strong>
                <span className="plan-nico-status">online · typing with one thumb</span>
              </div>
            </div>
            <div className="plan-bubbles">
              {mission.notes.map((note, index) => (
                <p
                  className="plan-bubble"
                  style={{ animationDelay: `${0.35 + index * 0.13}s` }}
                  key={`${note}:${index}`}
                >
                  {note}
                </p>
              ))}
            </div>
          </section>

          <div className="plan-actions">
            <button className="plan-button plan-button-primary" type="button" onClick={onStart} ref={startRef}>
              <Play size={22} fill="currentColor" aria-hidden="true" />
              START THE RUN
            </button>
            <div className="plan-secondary-actions">
              <button className="plan-button plan-button-secondary" type="button" onClick={onRedo}>
                <Pencil size={18} aria-hidden="true" />
                REDRAW
              </button>
              <button className="plan-button plan-button-tertiary" type="button" onClick={onNicoRoute}>
                <Route size={18} aria-hidden="true" />
                USE NICO’S ROUTE
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

