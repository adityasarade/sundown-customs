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
  if (target && distance(state, target) <= 21) state.checkpoint += 1;
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
  next.heat = clamp(
    next.heat + (drifting ? next.speed * t * 0.3 : -t * 1.4),
    0,
    100,
  );
  next.elapsed += t;
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
      next.heat = clamp(next.heat + 9, 0, 100);
      next.collisionCooldown = 1;
    }
  }
  updateCheckpoint(next);
  if (!next.finished && next.elapsed >= RUN_SECONDS) {
    next.elapsed = RUN_SECONDS;
    next.finished = true;
    next.won = false;
  }
  return next;
}

export function runScore(state: DriveState) {
  const finishBonus = state.won ? 2500 : 0;
  return Math.max(
    0,
    Math.round(
      finishBonus +
        state.checkpoint * 450 +
        state.drift * 3 +
        state.boost * 2 -
        state.elapsed * 6 -
        state.collisions * 125,
    ),
  );
}
