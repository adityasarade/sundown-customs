export type DriveControls = {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  boost: boolean;
  drift?: boolean;
};
export type Checkpoint = { x: number; z: number; name: string };

export const ROAD_HALF_WIDTH = 13;
export const RUN_SECONDS = 90;
export const CHECKPOINTS: Checkpoint[] = [
  { x: 0, z: -90, name: "NORTH PIER" },
  { x: 130, z: -100, name: "EAST MARKET" },
  { x: 140, z: 40, name: "PALM HOTEL" },
  { x: 10, z: 50, name: "SUNSET GARAGE" },
];

export const RESPRAY = { x: 140, z: -38, radius: 9, name: "SPRAY & PRAY" };
export type DriveEvent =
  | "checkpoint"
  | "wanted"
  | "respray"
  | "lost"
  | "busted"
  | "bump"
  | "closing";
export type Cop = { lag: number };
type TrailPoint = { x: number; z: number; d: number };
export const MAX_STARS = 5;
export const starsFor = (heat: number) =>
  heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(heat / 20));

export type DriveState = {
  x: number;
  z: number;
  speed: number;
  heading: number;
  elapsed: number;
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
  resprayUsed: boolean;
  inBooth: boolean;
  bust: number;
  cops: Cop[];
  trail: TrailPoint[];
  odo: number;
  events: DriveEvent[];
};

export function createDriveState(): DriveState {
  return {
    x: 0,
    z: 40,
    speed: 0,
    heading: 0,
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
    resprayUsed: false,
    inBooth: false,
    bust: 0,
    cops: [],
    trail: [{ x: 0, z: 40, d: 0 }],
    odo: 0,
    events: [],
  };
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
type RoadProjection = {
  x: number;
  z: number;
  heading: number;
  distance: number;
};

function projectToRoad(x: number, z: number): RoadProjection {
  const candidates: RoadProjection[] = [
    { x: 0, z: clamp(z, -100, 50), heading: 0, distance: 0 },
    { x: clamp(x, 0, 140), z: -100, heading: Math.PI / 2, distance: 0 },
    { x: 140, z: clamp(z, -100, 50), heading: Math.PI, distance: 0 },
    { x: clamp(x, 0, 140), z: 50, heading: -Math.PI / 2, distance: 0 },
  ];
  for (const c of candidates) c.distance = Math.hypot(x - c.x, z - c.z);
  return candidates.reduce((best, c) =>
    c.distance < best.distance ? c : best,
  );
}

function onRoad(x: number, z: number) {
  const vertical =
    (Math.abs(x) <= ROAD_HALF_WIDTH &&
      z >= -100 - ROAD_HALF_WIDTH &&
      z <= 50 + ROAD_HALF_WIDTH) ||
    (Math.abs(x - 140) <= ROAD_HALF_WIDTH &&
      z >= -100 - ROAD_HALF_WIDTH &&
      z <= 50 + ROAD_HALF_WIDTH);
  const horizontal =
    (Math.abs(z + 100) <= ROAD_HALF_WIDTH &&
      x >= -ROAD_HALF_WIDTH &&
      x <= 140 + ROAD_HALF_WIDTH) ||
    (Math.abs(z - 50) <= ROAD_HALF_WIDTH &&
      x >= -ROAD_HALF_WIDTH &&
      x <= 140 + ROAD_HALF_WIDTH);
  return vertical || horizontal;
}

function updateCheckpoint(state: DriveState) {
  const target = CHECKPOINTS[state.checkpoint];
  if (target && distance(state, target) <= 21) {
    state.checkpoint += 1;
    state.events.push("checkpoint");
    // The pier cameras clock the custom paint: the chase starts here.
    if (state.checkpoint === 1 && !state.wantedTriggered) {
      state.wantedTriggered = true;
      state.heat = Math.max(state.heat, 60);
      state.cops = [{ lag: 70 }, { lag: 86 }, { lag: 102 }];
      state.events.push("wanted");
    }
  }
  if (state.checkpoint >= CHECKPOINTS.length) {
    state.checkpoint = CHECKPOINTS.length;
    state.finished = true;
    state.won = true;
  }
}

export function stepDrive(
  state: DriveState,
  controls: DriveControls,
  dt: number,
): DriveState {
  const next = { ...state };
  if (next.finished) return next;
  const t = clamp(dt, 0, 0.05);
  next.collisionCooldown = Math.max(0, next.collisionCooldown - t);
  const steering = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
  const usingBoost = controls.boost && controls.gas && next.boost > 0;
  const maxSpeed = usingBoost ? 38 : 29;
  const acceleration = controls.gas
    ? usingBoost
      ? 25
      : 17
    : controls.brake
      ? -26
      : -8;
  next.speed = clamp(next.speed + acceleration * t, 0, maxSpeed);
  if (usingBoost) next.boost = Math.max(0, next.boost - 27 * t);
  else next.boost = Math.min(100, next.boost + 6 * t);
  next.heading += steering * (0.65 + Math.min(1, next.speed / 18) * 0.95) * t;
  // Keep the angle numerically stable while allowing unlimited cornering around
  // the loop (a hard clamp makes the third and fourth turns impossible).
  next.heading = Math.atan2(Math.sin(next.heading), Math.cos(next.heading));
  next.x += Math.sin(next.heading) * next.speed * t;
  next.z -= Math.cos(next.heading) * next.speed * t;
  const drifting = Boolean(
    (controls.drift || controls.brake) && steering && next.speed > 9,
  );
  if (drifting) next.drift += next.speed * Math.abs(steering) * t * 0.9;
  next.events = [];
  next.elapsed += t;
  next.odo += next.speed * t;
  if (!onRoad(next.x, next.z)) {
    const projection = projectToRoad(next.x, next.z);
    next.x = projection.x + (next.x - projection.x) * 0.12;
    next.z = projection.z + (next.z - projection.z) * 0.12;
    next.speed *= 0.48;
    const delta = Math.atan2(
      Math.sin(next.heading - projection.heading),
      Math.cos(next.heading - projection.heading),
    );
    next.heading = projection.heading + clamp(delta, -0.45, 0.45);
    if (next.collisionCooldown <= 0) {
      next.collisions += 1;
      if (next.wantedTriggered && next.heat > 0)
        next.heat = clamp(next.heat + 6, 0, 100);
      next.collisionCooldown = 1;
    }
  }
  stepChase(next, t);
  updateCheckpoint(next);
  if (!next.finished && next.bust >= 1) {
    next.bust = 1;
    next.finished = true;
    next.won = false;
    next.busted = true;
    next.events.push("busted");
  }
  if (!next.finished && next.elapsed >= RUN_SECONDS) {
    next.elapsed = RUN_SECONDS;
    next.finished = true;
    next.won = false;
  }
  return next;
}

function stepChase(s: DriveState, t: number) {
  const last = s.trail[s.trail.length - 1];
  const step = Math.hypot(s.x - last.x, s.z - last.z);
  if (step > 1.5) {
    s.trail = [...s.trail.slice(-240), { x: s.x, z: s.z, d: last.d + step }];
  }
  // Entry is latched while inside the booth; it re-arms once the car leaves,
  // so a cancelled respray can be retried. Only a saved respray uses it up.
  const inside = distance(s, RESPRAY) < RESPRAY.radius;
  if (inside && !s.inBooth && !s.resprayUsed && s.heat > 0)
    s.events.push("respray");
  s.inBooth = inside;
  if (!s.cops.length) {
    s.bust = Math.max(0, s.bust - t);
    if (s.heat > 0 && s.wantedTriggered) {
      s.heat = Math.max(0, s.heat - 9 * t);
      if (s.heat === 0) s.events.push("lost");
    }
    return;
  }
  const stars = starsFor(s.heat);
  const copSpeed = 24 + stars * 1.2;
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
  if (s.cops.length < before && !s.cops.length) s.events.push("lost");
  const pinned = nearest < 15 && s.speed < 9;
  if (pinned && s.bust < 0.3 && s.bust + t * 0.3 >= 0.3)
    s.events.push("closing");
  s.bust = clamp(s.bust + (pinned ? t * 0.3 : -t * 0.5), 0, 1);
}

/** Where a pursuing cop is: it drives the exact line the player drove. */
export function copPose(state: DriveState, cop: Cop) {
  const target = state.trail[state.trail.length - 1].d - cop.lag;
  const trail = state.trail;
  let i = trail.length - 1;
  while (i > 0 && trail[i - 1].d > target) i--;
  const a = trail[Math.max(0, i - 1)],
    b = trail[i];
  const span = b.d - a.d || 1;
  const f = clamp((target - a.d) / span, 0, 1);
  const x = a.x + (b.x - a.x) * f,
    z = a.z + (b.z - a.z) * f;
  const heading = Math.atan2(b.x - a.x, -(b.z - a.z));
  return { x, z, heading };
}

/** Applies a respray: each 8% of changed pixels shakes off one star. */
export function applyRespray(state: DriveState, changed: number) {
  const next = { ...state, events: [] as DriveEvent[], resprayUsed: true };
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

export function runScore(state: DriveState) {
  const finishBonus = state.won ? 2500 : 0;
  const clean = state.won && state.wantedTriggered && state.heat <= 0 ? 1000 : 0;
  return Math.max(
    0,
    Math.round(
      finishBonus +
        state.checkpoint * 450 +
        state.drift * 3 +
        state.boost * 2 -
        state.elapsed * 6 -
        state.collisions * 125 -
        starsFor(state.heat) * 150,
    ),
  );
}

/** Cash shown on the HUD while driving: what the job has earned so far. */
export const livePayout = (s: DriveState) =>
  Math.round(s.checkpoint * 450 + s.drift * 3);
