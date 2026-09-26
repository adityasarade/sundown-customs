/**
 * Heist Night driving rules: arcade car physics on the Solana Bay road grid,
 * mission checkpoints, wanted level (cameras / patrol), stash pickups,
 * Spray & Pray booths, the pursuit and the payout. Pure logic (no DOM, no
 * three.js) so it runs in Node tests.
 *
 * World coordinates: x = east, z = south. Heading 0 drives toward −z (north)
 * and increases clockwise (π/2 = east).
 */
import {
  ROAD_HALF_WIDTH,
  defaultMission,
  landmarks,
  onRoad,
  projectToRoad,
  segmentDistance,
  type Checkpoint,
  type Landmark,
  type Mission,
  type Point,
} from "./city.ts";

export { ROAD_HALF_WIDTH } from "./city.ts";
export type { Checkpoint } from "./city.ts";

export type DriveControls = {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  boost: boolean;
  drift?: boolean;
};

export type DriveEvent =
  | "checkpoint"
  | "wanted"
  | "respray"
  | "stash"
  | "lost"
  | "busted"
  | "bump"
  | "closing";
export type Cop = { lag: number };
export type WantedReason = "camera" | "patrol";
type TrailPoint = { x: number; z: number; d: number };

export const MAX_STARS = 5;
export const starsFor = (heat: number) =>
  heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(heat / 20));

/** Reach a checkpoint gate within this many world units. */
export const CHECKPOINT_RADIUS = 16;
/** Passing a traffic camera this close clocks the car. */
export const CAMERA_RADIUS = 20;
/** Drive this close to a marked crate to grab it. */
export const STASH_RADIUS = 7;
/** Size of a Spray & Pray booth's trigger zone. */
export const BOOTH_RADIUS = 9;

export const CAMERA_HEAT = 60; // 3★
export const PATROL_HEAT = 20; // 1★
const CAMERA_COPS = [70, 86, 102];
const PATROL_COPS = [80];
/** After a kerb hit the car sits this far from the centre-line (just inside the edge). */
const KERB_INSET = ROAD_HALF_WIDTH - 0.6;
/** Heading (rad) off the lane direction a kerb hit bounces the car back to. */
const GLANCE = 0.12;

/** All Spray & Pray booths in the city. */
export const BOOTHS: Landmark[] = landmarks("respray");

export type DriveState = {
  x: number;
  z: number;
  speed: number;
  heading: number;
  elapsed: number;
  /** Index of the next checkpoint (= checkpoints reached so far). */
  checkpoint: number;
  drift: number;
  boost: number;
  heat: number;
  collisions: number;
  collisionCooldown: number;
  finished: boolean;
  won: boolean;
  busted: boolean;
  wantedTriggered: boolean;
  wantedReason: WantedReason | null;
  resprayUsed: boolean;
  /** Booth whose respray was applied (null until `applyRespray`). */
  usedBooth: string | null;
  /** Id of the booth the car is currently inside. */
  inBooth: string | null;
  /** Booth that fired the latest "respray" event. */
  lastBooth: string | null;
  /** Ids of mission stashes already picked up. */
  collected: string[];
  bust: number;
  cops: Cop[];
  trail: TrailPoint[];
  odo: number;
  events: DriveEvent[];
  mission: Mission;
  /** Seconds on the clock for this run (= mission.seconds). */
  limit: number;
};

export function createDriveState(mission: Mission = defaultMission()): DriveState {
  // The car starts wherever the mission says, already facing its first leg.
  const start = mission.start;
  return {
    x: start.x,
    z: start.z,
    speed: 0,
    heading: start.heading,
    elapsed: 0,
    checkpoint: 0,
    drift: 0,
    boost: 100,
    heat: 0,
    collisions: 0,
    collisionCooldown: 0,
    finished: false,
    won: false,
    busted: false,
    wantedTriggered: false,
    wantedReason: null,
    resprayUsed: false,
    usedBooth: null,
    inBooth: null,
    lastBooth: null,
    collected: [],
    bust: 0,
    cops: [],
    trail: [{ x: start.x, z: start.z, d: 0 }],
    odo: 0,
    events: [],
    mission,
    limit: mission.seconds,
  };
}

/* ───────────── Deprecated aliases (pre-v3 fixed loop), derived from Nico's route ───────────── */

const DEFAULT_MISSION = defaultMission();
/** @deprecated use `state.limit` / `mission.seconds`. */
export const RUN_SECONDS = DEFAULT_MISSION.seconds;
/** @deprecated use `mission.checkpoints`. */
export const CHECKPOINTS: Checkpoint[] = DEFAULT_MISSION.checkpoints;
/** @deprecated use `BOOTHS` / `landmarks("respray")`. */
export const RESPRAY = {
  id: BOOTHS[0].id,
  x: BOOTHS[0].x,
  z: BOOTHS[0].z,
  radius: BOOTH_RADIUS,
  name: BOOTHS[0].name,
};

/* ───────────────────────── Helpers ───────────────────────── */

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Checkpoint index at which a patrol spots a car that avoided every camera. */
export const patrolIndex = (mission: Mission) => Math.max(1, mission.checkpoints.length - 2);

/** Cameras on the part of the route still ahead of checkpoint index `from`. */
function camerasAhead(mission: Mission, from: number) {
  const r = mission.route;
  // Checkpoint k sits at route[k + 1]; the car has just reached route[from].
  return landmarks("camera").filter((c) => {
    for (let i = Math.max(1, from + 1); i < r.length; i++)
      if (segmentDistance(c, r[i - 1], r[i]) < 16) return true;
    return false;
  });
}

function setWanted(s: DriveState, reason: WantedReason) {
  s.wantedTriggered = true;
  s.wantedReason = reason;
  s.heat = Math.max(s.heat, reason === "camera" ? CAMERA_HEAT : PATROL_HEAT);
  s.cops = (reason === "camera" ? CAMERA_COPS : PATROL_COPS).map((lag) => ({ lag }));
  s.events.push("wanted");
}

function updateCheckpoint(s: DriveState) {
  const cps = s.mission.checkpoints;
  const target = cps[s.checkpoint];
  if (target && distance(s, target) <= CHECKPOINT_RADIUS) {
    s.checkpoint += 1;
    s.events.push("checkpoint");
    if (s.checkpoint >= cps.length) {
      s.checkpoint = cps.length;
      s.finished = true;
      s.won = true;
      return;
    }
    // A clean route still gets noticed: a patrol car picks the car up late.
    if (
      !s.wantedTriggered &&
      s.checkpoint >= patrolIndex(s.mission) &&
      camerasAhead(s.mission, s.checkpoint).length === 0
    )
      setWanted(s, "patrol");
  }
}

function updateCameras(s: DriveState) {
  if (s.wantedTriggered || s.finished) return;
  if (landmarks("camera").some((c) => distance(s, c) < CAMERA_RADIUS)) setWanted(s, "camera");
}

function updateStashes(s: DriveState) {
  for (const stash of s.mission.stashes) {
    if (s.collected.includes(stash.id) || distance(s, stash) >= STASH_RADIUS) continue;
    s.collected = [...s.collected, stash.id];
    s.events.push("stash");
  }
}

/**
 * Booth entry is latched per booth while inside; it re-arms once the car
 * leaves, so a cancelled respray can be retried. Only a saved respray
 * (`applyRespray`) uses it up — one per run.
 */
function updateBooths(s: DriveState) {
  const booth = BOOTHS.find((b) => distance(s, b) < BOOTH_RADIUS) ?? null;
  const id = booth ? booth.id : null;
  if (id && id !== s.inBooth && !s.resprayUsed && s.heat > 0) {
    s.lastBooth = id;
    s.events.push("respray");
  }
  s.inBooth = id;
}

/* ───────────────────────── Simulation ───────────────────────── */

export function stepDrive(state: DriveState, controls: DriveControls, dt: number): DriveState {
  if (state.finished) return { ...state, events: [] };
  const next: DriveState = { ...state, cops: state.cops.map((c) => ({ ...c })), events: [] };
  const t = clamp(dt, 0, 0.05);
  next.collisionCooldown = Math.max(0, next.collisionCooldown - t);
  const steering = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
  const usingBoost = controls.boost && controls.gas && next.boost > 0;
  const maxSpeed = usingBoost ? 38 : 29;
  const acceleration = controls.gas ? (usingBoost ? 25 : 17) : controls.brake ? -26 : -8;
  next.speed = clamp(next.speed + acceleration * t, 0, maxSpeed);
  if (usingBoost) next.boost = Math.max(0, next.boost - 27 * t);
  else next.boost = Math.min(100, next.boost + 6 * t);
  next.heading = wrapAngle(next.heading + steering * (0.65 + Math.min(1, next.speed / 18) * 0.95) * t);
  next.x += Math.sin(next.heading) * next.speed * t;
  next.z -= Math.cos(next.heading) * next.speed * t;
  const drifting = Boolean((controls.drift || controls.brake) && steering && next.speed > 9);
  if (drifting) next.drift += next.speed * Math.abs(steering) * t * 0.9;
  next.elapsed += t;
  next.odo += next.speed * t;

  if (!onRoad(next.x, next.z)) {
    // Hit the kerb: pin the car to the road edge it crossed (no sideways
    // teleport) and glance it off the wall, keeping the lane direction it was
    // travelling (projectToRoad picks the nearer of the two directions).
    const p = projectToRoad(next.x, next.z, next.heading);
    const d = p.distance || 1;
    const nx = (next.x - p.x) / d,
      nz = (next.z - p.z) / d; // outward normal: centre-line → wall
    next.x = p.x + nx * KERB_INSET;
    next.z = p.z + nz * KERB_INSET;
    // Of the two shallow glancing headings either side of the lane, take the
    // one that points back onto the road.
    const into = (h: number) => Math.sin(h) * nx - Math.cos(h) * nz;
    const a = wrapAngle(p.heading + GLANCE),
      b = wrapAngle(p.heading - GLANCE);
    next.heading = into(a) <= into(b) ? a : b;
    if (next.collisionCooldown <= 0) {
      next.speed *= 0.48;
      next.collisions += 1;
      if (next.wantedTriggered && next.heat > 0) next.heat = clamp(next.heat + 6, 0, 100);
      next.collisionCooldown = 1;
    } else next.speed *= 0.9; // scraping along the wall
  }

  stepChase(next, t);
  updateBooths(next);
  // The clock runs out before a late crossing can count as a win.
  if (next.elapsed >= next.limit) {
    next.elapsed = next.limit;
    next.finished = true;
    next.won = false;
    return next;
  }
  updateCheckpoint(next);
  updateCameras(next);
  updateStashes(next);

  if (!next.finished && next.bust >= 1) {
    next.bust = 1;
    next.finished = true;
    next.won = false;
    next.busted = true;
    next.events.push("busted");
  }
  if (!next.finished && next.elapsed >= next.limit) {
    next.elapsed = next.limit;
    next.finished = true;
    next.won = false;
  }
  return next;
}

function stepChase(s: DriveState, t: number) {
  const last = s.trail[s.trail.length - 1];
  const step = Math.hypot(s.x - last.x, s.z - last.z);
  if (step > 1.5) s.trail = [...s.trail.slice(-240), { x: s.x, z: s.z, d: last.d + step }];
  if (!s.cops.length) {
    // Nobody chasing: any leftover heat (e.g. a kerb hit after the chase)
    // cools off quietly — "lost" was already announced when the cops dropped.
    s.bust = Math.max(0, s.bust - t);
    if (s.heat > 0) s.heat = Math.max(0, s.heat - 9 * t);
    return;
  }
  const copSpeed = 24 + starsFor(s.heat) * 1.2;
  let nearest = Infinity;
  for (const cop of s.cops) {
    cop.lag = clamp(cop.lag + (s.speed - copSpeed) * t, 11, 200);
    if (cop.lag < 11.5 && s.collisionCooldown <= 0) {
      // Rammed from behind: lose speed and a little more heat.
      s.speed *= 0.62;
      s.collisions += 1;
      s.collisionCooldown = 1.1;
      s.heat = clamp(s.heat + 4, 0, 100);
      cop.lag = 19;
      s.events.push("bump");
    }
    nearest = Math.min(nearest, cop.lag);
  }
  const before = s.cops.length;
  s.cops = s.cops.filter((c) => c.lag < 120);
  if (s.cops.length < before && !s.cops.length) {
    // Shook the last cop: the wanted level clears (one "lost" per escape,
    // matching the "LOST THEM · wanted level cleared" beat).
    s.heat = 0;
    s.bust = 0;
    s.events.push("lost");
    return;
  }
  const pinned = nearest < 15 && s.speed < 9;
  if (pinned && s.bust < 0.3 && s.bust + t * 0.3 >= 0.3) s.events.push("closing");
  s.bust = clamp(s.bust + (pinned ? t * 0.3 : -t * 0.5), 0, 1);
}

/** Where a pursuing cop is: it drives the exact line the player drove. */
export function copPose(state: DriveState, cop: Cop) {
  const trail = state.trail;
  const target = trail[trail.length - 1].d - cop.lag;
  let i = trail.length - 1;
  while (i > 0 && trail[i - 1].d > target) i--;
  const a = trail[Math.max(0, i - 1)],
    b = trail[i];
  const span = b.d - a.d || 1;
  const f = clamp((target - a.d) / span, 0, 1);
  const x = a.x + (b.x - a.x) * f,
    z = a.z + (b.z - a.z) * f;
  const heading = a === b ? state.heading : Math.atan2(b.x - a.x, -(b.z - a.z));
  return { x, z, heading };
}

/** Applies a respray: each 8% of changed pixels shakes off one star. */
export function applyRespray(state: DriveState, changed: number) {
  const next: DriveState = {
    ...state,
    events: [],
    resprayUsed: true,
    usedBooth: state.lastBooth ?? state.inBooth,
  };
  const stars = starsFor(next.heat);
  const cleared = Math.min(stars, Math.max(1, Math.floor(changed / 0.08)));
  next.heat = Math.max(0, (stars - cleared) * 20 - 1);
  const remaining = starsFor(next.heat);
  next.cops = next.cops
    .slice(0, Math.min(next.cops.length, remaining))
    .map((c) => ({ lag: c.lag + 45 }));
  next.bust = 0;
  if (!remaining) {
    next.cops = [];
    next.heat = 0;
    next.events.push("lost");
  }
  return { state: next, cleared, remaining };
}

/* ───────────────────────── Scoring ───────────────────────── */

export const CHECKPOINT_CASH = 300;
export const STASH_CASH = 750;

/** Itemised payout, for the result screen. */
export function scoreBreakdown(state: DriveState) {
  const stars = starsFor(state.heat);
  const items = {
    finish: state.won ? 2500 : 0,
    checkpoints: state.checkpoint * CHECKPOINT_CASH,
    stashes: state.collected.length * STASH_CASH,
    drift: Math.round(state.drift * 3),
    boost: Math.round(state.boost * 2),
    time: -Math.round(state.elapsed * 6),
    collisions: -state.collisions * 125,
    heat: -stars * 150,
    clean: state.won && state.wantedTriggered && stars === 0 ? 1000 : 0,
  };
  const total = Math.max(0, Object.values(items).reduce((a, b) => a + b, 0));
  return { ...items, total };
}

export function runScore(state: DriveState) {
  return scoreBreakdown(state).total;
}

/** Cash shown on the HUD while driving: what the job has earned so far. */
export const livePayout = (s: DriveState) =>
  Math.round(s.checkpoint * CHECKPOINT_CASH + s.collected.length * STASH_CASH + s.drift * 3);
