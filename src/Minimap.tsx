import { useId } from "react";
import {
  AVENUES,
  STREETS,
  defaultMission,
  landmarks,
  type Mission,
  type Point,
} from "./city";
import "./jobs.css";

export type MinimapProps = {
  x: number;
  z: number;
  heading: number;
  mission?: Mission;
  checkpoint: number;
  hot?: boolean;
  collected?: string[];
  showResprays?: boolean;
  /** @deprecated alias of `showResprays` (v2 prop). */
  respray?: boolean;
};

/** Radar canvas (matches the .radar svg box in gta.css). */
const W = 176;
const H = 182;
/** Player sits a little below centre, like the GTA radar. */
const CX = W / 2;
const CY = H * 0.6;
/** Pixels per world unit. */
const SCALE = 0.92;
const EDGE = 11;
const ROAD_W = 8.5;

const CAMERAS = landmarks("camera");
const RESPRAYS = landmarks("respray");

const A0 = AVENUES[0];
const A1 = AVENUES[AVENUES.length - 1];
const S0 = STREETS[0];
const S1 = STREETS[STREETS.length - 1];
/** Everything west of this is marina water. */
const SHORE_X = -25;
/** How far the roads run past the outermost nodes (dead-end stubs / beyond the map). */
const STUB = 60;

const isAvenue = (v: number) => (AVENUES as readonly number[]).includes(v);

/**
 * Road-snapped polyline: a diagonal hop (e.g. START → a first node on another
 * avenue) gets an elbow on the grid so the GPS never cuts through a block.
 */
function snapToGrid(pts: Point[]): Point[] {
  const out: Point[] = [];
  pts.forEach((p, i) => {
    const a = pts[i - 1];
    if (a && a.x !== p.x && a.z !== p.z) out.push(isAvenue(a.x) ? { x: a.x, z: p.z } : { x: p.x, z: a.z });
    out.push(p);
  });
  return out;
}

/**
 * The GPS line from the car to the destination: the car is projected onto the
 * nearest segment of the current leg, so the line hugs the road instead of
 * drawing a diagonal from the car to the next node.
 */
function gpsPath(route: Point[], done: number, car: Point): Point[] {
  const from = Math.max(0, Math.min(done, route.length - 2));
  const legEnd = route[from + 1];
  const tail = snapToGrid(route.slice(from));
  const target = tail.indexOf(legEnd);
  let best = { i: 0, d: Infinity, p: tail[0] };
  for (let i = 0; i < target; i++) {
    const a = tail[i],
      b = tail[i + 1];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((car.x - a.x) * dx + (car.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const p = { x: a.x + dx * t, z: a.z + dz * t };
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < best.d) best = { i, d, p };
  }
  return [car, best.p, ...tail.slice(best.i + 1)];
}

let fallbackMission: Mission | null = null;
const getDefault = () => (fallbackMission ??= defaultMission());

const fmt = (n: number) => n.toFixed(1);

export default function Minimap({
  x,
  z,
  heading,
  mission,
  checkpoint,
  hot,
  collected,
  showResprays,
  respray,
}: MinimapProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const m = mission ?? getDefault();
  const resprays = showResprays ?? respray ?? false;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);

  /** World → radar pixels (map rotates so the car always points up). */
  const P = (p: Point) => {
    const dx = (p.x - x) * SCALE;
    const dz = (p.z - z) * SCALE;
    return { sx: CX + dx * cos + dz * sin, sy: CY - dx * sin + dz * cos };
  };
  /** Clamp a radar point to the frame edge (GTA pins off-screen blips to the rim). */
  const pin = (p: Point, inset = EDGE) => {
    const { sx, sy } = P(p);
    const inside = sx >= inset && sx <= W - inset && sy >= inset && sy <= H - inset;
    if (inside) return { sx, sy, pinned: false };
    const vx = sx - CX;
    const vy = sy - CY;
    const tx = vx > 0 ? (W - inset - CX) / vx : vx < 0 ? (inset - CX) / vx : Infinity;
    const ty = vy > 0 ? (H - inset - CY) / vy : vy < 0 ? (inset - CY) / vy : Infinity;
    const t = Math.min(tx, ty);
    return { sx: CX + vx * t, sy: CY + vy * t, pinned: true };
  };
  const line = (pts: Point[]) =>
    pts
      .map((p, i) => {
        const { sx, sy } = P(p);
        return `${i ? "L" : "M"}${fmt(sx)} ${fmt(sy)}`;
      })
      .join(" ");
  const poly = (pts: Point[]) => line(pts) + " Z";

  const total = m.checkpoints.length;
  const done = Math.max(0, Math.min(total, checkpoint));
  const finished = done >= total;
  // Checkpoint k sits at route[k + 1]; the GPS runs from the car to the destination.
  const remaining = finished || m.route.length < 2 ? [] : gpsPath(m.route, done, { x, z });
  const gps = remaining.length > 1 ? line(remaining) : "";
  const next = finished ? null : m.checkpoints[done];
  const dest = pin(m.destination, 13);
  const nextPin = next && done < total - 1 ? pin(next, 10) : null;
  const north = pin({ x, z: z - 10_000 }, 9);
  const got = new Set(collected ?? []);

  // Roads: one polyline per avenue/street, running a little past the grid.
  const roads = [
    ...AVENUES.map((ax) => line([{ x: ax, z: S0 - STUB }, { x: ax, z: S1 + STUB }])),
    ...STREETS.map((sz) => line([{ x: A0 - 12, z: sz }, { x: A1 + STUB, z: sz }])),
  ];
  // Blocks: the land squares between roads (drawn slightly lighter than the verge).
  const blocks: string[] = [];
  for (let i = 0; i < AVENUES.length - 1; i++)
    for (let j = 0; j < STREETS.length - 1; j++) {
      const bx0 = AVENUES[i] + 7,
        bx1 = AVENUES[i + 1] - 7,
        bz0 = STREETS[j] + 7,
        bz1 = STREETS[j + 1] - 7;
      blocks.push(poly([{ x: bx0, z: bz0 }, { x: bx1, z: bz0 }, { x: bx1, z: bz1 }, { x: bx0, z: bz1 }]));
    }
  const water = poly([
    { x: -2000, z: -2000 },
    { x: SHORE_X, z: -2000 },
    { x: SHORE_X, z: 2000 },
    { x: -2000, z: 2000 },
  ]);
  const beach = line([{ x: SHORE_X + 2, z: -2000 }, { x: SHORE_X + 2, z: 2000 }]);
  const clip = `mm-clip-${uid}`;
  const glow = `mm-glow-${uid}`;

  const label = `Radar. ${finished ? "Route complete." : `Checkpoint ${done + 1} of ${total}, ${next?.name ?? ""}.`} Destination ${m.destination.name}.${hot ? " Wanted." : ""}`;

  return (
    <svg
      className={`mm${hot ? " mm-hot" : ""}`}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={clip}>
          <rect width={W} height={H} rx="5" />
        </clipPath>
        {/* userSpaceOnUse: a straight (zero-width bbox) route would otherwise vanish */}
        <filter id={glow} filterUnits="userSpaceOnUse" x={-20} y={-20} width={W + 40} height={H + 40}>
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={W} height={H} fill="#3b4a46" />
        <path d={water} fill="#1d4e78" />
        <path d={beach} stroke="#6f8a78" strokeWidth={3 * SCALE} fill="none" />
        {blocks.map((d, i) => (
          <path key={i} d={d} fill="#4a5a55" />
        ))}
        <g fill="none" strokeLinecap="square">
          {roads.map((d, i) => (
            <path key={`o${i}`} d={d} stroke="#242b2c" strokeWidth={ROAD_W + 2.4} />
          ))}
          {roads.map((d, i) => (
            <path key={`r${i}`} d={d} stroke="#aeb4ad" strokeWidth={ROAD_W} />
          ))}
        </g>

        {gps && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={gps} stroke="#3d0726" strokeWidth="7.5" opacity=".75" />
            <path d={gps} stroke="#ff4fb0" strokeWidth="5" filter={`url(#${glow})`} />
            <path d={gps} stroke="#ffc2e4" strokeWidth="1.2" strokeDasharray="2 6" className="mm-flow" />
          </g>
        )}

        {CAMERAS.map((c) => {
          const { sx, sy } = P(c);
          if (sx < -12 || sx > W + 12 || sy < -12 || sy > H + 12) return null;
          return (
            <g key={c.id} transform={`translate(${fmt(sx)} ${fmt(sy)})`}>
              <circle r={20 * SCALE} fill="#ff3b4e" opacity=".13" />
              <circle r="5.6" fill="#1a0b10" stroke="#ff3b4e" strokeWidth="1.4" />
              <rect x="-3" y="-1.9" width="4.4" height="3.8" rx=".6" fill="#ff3b4e" />
              <path d="M1.4 -1 L3.4 -2.1 L3.4 2.1 L1.4 1 Z" fill="#ff3b4e" />
            </g>
          );
        })}

        {resprays &&
          RESPRAYS.map((r) => {
            const { sx, sy } = P(r);
            if (sx < -12 || sx > W + 12 || sy < -12 || sy > H + 12) return null;
            return (
              <g key={r.id} transform={`translate(${fmt(sx)} ${fmt(sy)})`}>
                <circle r="9" fill="none" stroke="#ff4fb0" strokeWidth="1.3" className="radar-pulse" />
                <circle r="6" fill="#ff4fb0" stroke="#fff" strokeWidth="1.2" />
                {/* spray can */}
                <rect x="-1.9" y="-1.6" width="3.8" height="5" rx=".8" fill="#2a0620" />
                <rect x="-1" y="-3.4" width="2" height="1.6" fill="#2a0620" />
                <circle cx="2.9" cy="-3.1" r=".6" fill="#2a0620" />
              </g>
            );
          })}

        {m.stashes
          .filter((s) => !got.has(s.id))
          .map((s) => {
            const { sx, sy } = P(s);
            if (sx < -12 || sx > W + 12 || sy < -12 || sy > H + 12) return null;
            return (
              <g key={s.id} transform={`translate(${fmt(sx)} ${fmt(sy)})`}>
                <circle r="6" fill="#ffcf4a" stroke="#1a1405" strokeWidth="1.3" />
                <text y="2.9" textAnchor="middle" className="mm-glyph" fill="#1a1405">
                  $
                </text>
              </g>
            );
          })}

        {nextPin && (
          <g transform={`translate(${fmt(nextPin.sx)} ${fmt(nextPin.sy)})`}>
            {!nextPin.pinned && <circle r="9" fill="none" stroke="#ffcf4a" strokeWidth="1.4" className="radar-pulse" />}
            <circle r={nextPin.pinned ? 4.5 : 5.2} fill="#ffcf4a" stroke="#141323" strokeWidth="1.5" />
          </g>
        )}

        {!finished && (
          <g transform={`translate(${fmt(dest.sx)} ${fmt(dest.sy)})`} filter={`url(#${glow})`}>
            <circle r="8" fill="#141323" stroke="#ffcf4a" strokeWidth="1.8" />
            <path d="M-2.4 4.6 L-2.4 -4.6" stroke="#ffcf4a" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M-2 -4.6 L4.4 -2.6 L-2 -0.4 Z" fill="#ffcf4a" />
          </g>
        )}

        {/* the player */}
        <g transform={`translate(${CX} ${CY})`}>
          {hot && <circle r="16" fill="none" stroke="#ff3b4e" strokeWidth="1.5" className="radar-pulse" />}
          <path
            d="M0 -8 L6 6 L0 3 L-6 6 Z"
            fill={finished ? "#7ee07a" : "#f0ead9"}
            stroke="#141323"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </g>

        {/* north blip on the rim (yields to the destination blip when they overlap) */}
        {(finished || Math.hypot(north.sx - dest.sx, north.sy - dest.sy) > 15) && <g transform={`translate(${fmt(north.sx)} ${fmt(north.sy)})`}>
          <circle r="5.4" fill="#141323" stroke="#f0ead9" strokeWidth=".9" opacity=".92" />
          <text y="2.6" textAnchor="middle" className="mm-glyph mm-n" fill="#f0ead9">
            N
          </text>
        </g>}

        {hot && <rect width={W} height={H} fill="none" stroke="#ff3b4e" strokeWidth="7" className="mm-siren" />}
        {/* inner vignette */}
        <rect x="1" y="1" width={W - 2} height={H - 2} rx="4" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="2" />
      </g>
    </svg>
  );
}
