import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOTHS,
  BOOTH_RADIUS,
  CAMERA_RADIUS,
  CHECKPOINTS,
  CHECKPOINT_RADIUS,
  RESPRAY,
  RUN_SECONDS,
  STASH_RADIUS,
  applyRespray,
  copPose,
  createDriveState,
  livePayout,
  patrolIndex,
  runScore,
  scoreBreakdown,
  starsFor,
  stepDrive,
  type DriveControls,
  type DriveEvent,
  type DriveState,
} from "../src/driving.ts";
import {
  LANDMARKS,
  START,
  defaultMission,
  landmarks,
  missionFromPath,
  onRoad,
  type Landmark,
  type Mission,
} from "../src/city.ts";

const DT = 0.05;
const idle: DriveControls = { left: false, right: false, gas: false, brake: false, boost: false };
const lm = (id: string) => LANDMARKS.find((l) => l.id === id)!;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Steps with fixed controls, collecting every event emitted along the way. */
function run(state: DriveState, controls: DriveControls, steps: number) {
  const events: DriveEvent[] = [];
  for (let i = 0; i < steps; i++) {
    state = stepDrive(state, controls, DT);
    events.push(...state.events);
  }
  return { state, events };
}
const count = (events: DriveEvent[], e: DriveEvent) => events.filter((x) => x === e).length;

/**
 * A simple autopilot: steer toward the next checkpoint (consecutive
 * checkpoints are adjacent grid nodes, so the straight line is the road),
 * lift and brake when the error is large.
 */
function autopilot(state: DriveState, maxSteps = 6000) {
  const events: DriveEvent[] = [];
  const log: { event: DriveEvent; checkpoint: number; t: number }[] = [];
  for (let i = 0; i < maxSteps && !state.finished; i++) {
    const cp = state.mission.checkpoints[state.checkpoint];
    const err = wrap(Math.atan2(cp.x - state.x, -(cp.z - state.z)) - state.heading);
    const hard = Math.abs(err) > 0.5 && state.speed > 12;
    state = stepDrive(
      state,
      { left: err < -0.06, right: err > 0.06, gas: !hard, brake: hard, boost: false },
      DT,
    );
    assert.ok(Number.isFinite(state.x) && Number.isFinite(state.z), "pose stays finite");
    for (const event of state.events) {
      events.push(event);
      log.push({ event, checkpoint: state.checkpoint, t: state.elapsed });
    }
  }
  return { state, events, log };
}

/** A parked state at (x, z) facing `heading`, optionally mid-chase. */
function parked(x: number, z: number, heading = 0, extra: Partial<DriveState> = {}): DriveState {
  const base = createDriveState(extra.mission);
  return { ...base, x, z, heading, trail: [{ x, z, d: 0 }], ...extra };
}

const stash = (id: string) => landmarks("stash").find((s) => s.id === id)!;
const PATHS: Record<string, { path: string[]; dest: Landmark; stashes?: Landmark[] }> = {
  "marina (west avenue)": { path: ["0:50", "0:-100", "0:-250", "0:-400"], dest: lm("marina") },
  "causeway (zig-zag through town)": {
    path: ["0:50", "0:-100", "150:-100", "150:-250", "300:-250", "300:-400", "450:-400"],
    dest: lm("causeway"),
    stashes: [stash("stash-6")],
  },
  "causeway (coast road, two crates)": {
    path: ["0:50", "150:50", "300:50", "450:50", "450:-100", "450:-250", "450:-400"],
    dest: lm("causeway"),
    stashes: [stash("stash-3"), stash("stash-4")],
  },
  "motel (beach road)": {
    path: ["0:50", "150:50", "300:50", "450:50"],
    dest: lm("motel"),
    stashes: [stash("stash-3")],
  },
};

/* ───────────────────────── State & aliases ───────────────────────── */

test("createDriveState defaults to Nico's mission at the garage pad", () => {
  const s = createDriveState();
  const m = defaultMission();
  assert.deepEqual(s.mission, m);
  assert.equal(s.limit, m.seconds);
  // Nico's route runs straight up the west avenue: the pad, facing north.
  assert.deepEqual(m.start, START);
  assert.equal(s.x, START.x);
  assert.equal(s.z, START.z);
  assert.equal(s.heading, START.heading);
  assert.deepEqual(s.trail, [{ x: START.x, z: START.z, d: 0 }]);
  assert.deepEqual(s.collected, []);
  assert.equal(s.inBooth, null);
  assert.equal(s.lastBooth, null);
  assert.equal(s.wantedReason, null);
  assert.equal(s.wantedTriggered, false);
  assert.equal(s.checkpoint, 0);
  assert.equal(s.finished, false);
  assert.deepEqual(s.cops, []);
  assert.ok(onRoad(s.x, s.z));
});

test("createDriveState starts the car at mission.start, facing the first leg", () => {
  // East-first route: the car sits just east of the garage node, facing east.
  const m = missionFromPath(PATHS["motel (beach road)"].path, lm("motel"));
  assert.deepEqual(m.start, { x: 10, z: 50, heading: Math.PI / 2 });
  const s = createDriveState(m);
  assert.equal(s.x, 10);
  assert.equal(s.z, 50);
  assert.equal(s.heading, Math.PI / 2);
  assert.deepEqual(s.trail, [{ x: 10, z: 50, d: 0 }], "the cop trail is seeded at the start");
  assert.ok(onRoad(s.x, s.z));
  // A few seconds of throttle moves the car east along Beach Road, not north.
  const { state } = run(s, { ...idle, gas: true }, 40);
  assert.ok(state.x > 30, `drove east (${state.x})`);
  assert.ok(Math.abs(state.z - 50) < 0.001, "stays on the street centre-line");
  assert.equal(state.collisions, 0, "no kerb hit off the line");
  // Any custom start is honoured verbatim.
  const custom = createDriveState({ ...defaultMission(), start: { x: 150, z: -175, heading: Math.PI } });
  assert.deepEqual([custom.x, custom.z, custom.heading], [150, -175, Math.PI]);
  assert.equal(copPose(custom, { lag: 30 }).x, 150);
});

test("createDriveState takes the mission's clock", () => {
  const m: Mission = { ...defaultMission(), seconds: 123 };
  const s = createDriveState(m);
  assert.equal(s.mission, m);
  assert.equal(s.limit, 123);
});

test("deprecated aliases are derived from the default mission and first booth", () => {
  const m = defaultMission();
  assert.deepEqual(CHECKPOINTS, m.checkpoints);
  assert.equal(RUN_SECONDS, m.seconds);
  const booth = landmarks("respray")[0];
  assert.equal(RESPRAY.x, booth.x);
  assert.equal(RESPRAY.z, booth.z);
  assert.equal(RESPRAY.name, booth.name);
  assert.equal(RESPRAY.radius, BOOTH_RADIUS);
  assert.deepEqual(BOOTHS, landmarks("respray"));
});

/* ───────────────────────── Completing missions ───────────────────────── */

test("the autopilot completes Nico's default mission and gets clocked by the pier cam", () => {
  const m = defaultMission();
  const { state, events, log } = autopilot(createDriveState(m));
  assert.equal(state.won, true);
  assert.equal(state.finished, true);
  assert.equal(state.busted, false);
  assert.equal(state.checkpoint, m.checkpoints.length);
  assert.ok(state.elapsed < state.limit);
  assert.equal(count(events, "checkpoint"), m.checkpoints.length);
  assert.equal(count(events, "wanted"), 1);
  assert.equal(state.wantedReason, "camera");
  // Pier cam sits between the first and second checkpoint.
  assert.equal(log.find((e) => e.event === "wanted")!.checkpoint, 1);
  assert.ok(runScore(state) > 0);
});

for (const [name, { path, dest, stashes }] of Object.entries(PATHS)) {
  test(`the autopilot completes a hand-made route to ${name}`, () => {
    const m = missionFromPath(path, dest, { stashes: stashes ?? [] });
    const { state, events } = autopilot(createDriveState(m));
    assert.equal(state.won, true, "reached the destination");
    assert.equal(state.busted, false);
    assert.equal(state.checkpoint, path.length - 1);
    assert.equal(count(events, "checkpoint"), path.length - 1);
    assert.ok(state.elapsed < state.limit, "inside the clock");
    assert.deepEqual(
      [...state.collected].sort(),
      (stashes ?? []).map((s) => s.id).sort(),
      "grabbed every crate on the line",
    );
    assert.equal(count(events, "stash"), (stashes ?? []).length);
    assert.equal(count(events, "wanted"), 1, "exactly one wanted trigger");
    assert.equal(state.wantedReason, m.camerasOnRoute.length ? "camera" : "patrol");
    // Finishing is final: further steps change nothing and emit nothing.
    const after = stepDrive(state, { ...idle, gas: true }, DT);
    assert.equal(after.x, state.x);
    assert.equal(after.elapsed, state.elapsed);
    assert.deepEqual(after.events, []);
  });
}

test("the same inputs always produce the same run (deterministic)", () => {
  const a = autopilot(createDriveState());
  const b = autopilot(createDriveState());
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.log, b.log);
});

/* ───────────────────────── Checkpoints ───────────────────────── */

test("checkpoints are taken strictly in order", () => {
  const m = defaultMission();
  const [first, second] = m.checkpoints;
  // Sitting on the second gate before the first does nothing.
  let { state, events } = run(parked(second.x, second.z, 0, { mission: m }), idle, 4);
  assert.equal(state.checkpoint, 0);
  assert.equal(count(events, "checkpoint"), 0);
  // The first gate counts once, even while the car lingers in it.
  ({ state, events } = run({ ...state, x: first.x, z: first.z }, idle, 10));
  assert.equal(state.checkpoint, 1);
  assert.equal(count(events, "checkpoint"), 1);
  // Now the second gate counts.
  ({ state, events } = run({ ...state, x: second.x, z: second.z }, idle, 2));
  assert.equal(state.checkpoint, 2);
});

test("a checkpoint is reached within its radius but not beyond", () => {
  const m = defaultMission();
  const cp = m.checkpoints[0]; // (0, -25)
  const near = run(parked(cp.x, cp.z + CHECKPOINT_RADIUS - 0.5, 0, { mission: m }), idle, 1);
  assert.equal(near.state.checkpoint, 1);
  const far = run(parked(cp.x, cp.z + CHECKPOINT_RADIUS + 1, 0, { mission: m }), idle, 1);
  assert.equal(far.state.checkpoint, 0);
});

test("reaching the last checkpoint wins; a single-gate mission never calls a patrol", () => {
  const m = missionFromPath(["0:50", "150:50"], lm("motel"));
  assert.equal(m.checkpoints.length, 1);
  const { state, events } = run(parked(150, 50, Math.PI / 2, { mission: m }), idle, 3);
  assert.equal(state.finished, true);
  assert.equal(state.won, true);
  assert.equal(state.checkpoint, 1);
  assert.equal(count(events, "wanted"), 0);
});

/* ───────────────────────── Wanted: cameras & patrols ───────────────────────── */

test("passing within 20 of any camera gives three stars and three cops, once", () => {
  const cam = lm("cam-pier"); // (0, -175) on the west avenue
  const outside = run(parked(cam.x, cam.z + CAMERA_RADIUS + 1), idle, 3);
  assert.equal(outside.state.wantedTriggered, false);
  const { state, events } = run(parked(cam.x, cam.z + CAMERA_RADIUS - 1), idle, 20);
  assert.equal(count(events, "wanted"), 1);
  assert.equal(state.wantedTriggered, true);
  assert.equal(state.wantedReason, "camera");
  assert.equal(state.heat >= 55, true);
  assert.equal(starsFor(60), 3);
  assert.equal(state.cops.length, 3);
});

test("a camera off the planned route still clocks the car", () => {
  const cam = lm("cam-market"); // (225, -250), not on the default route
  assert.ok(!defaultMission().camerasOnRoute.some((c) => c.id === cam.id));
  const { state, events } = run(parked(cam.x - 10, cam.z, Math.PI / 2), idle, 1);
  assert.equal(count(events, "wanted"), 1);
  assert.equal(state.wantedReason, "camera");
  assert.equal(starsFor(state.heat), 3);
});

test("a camera-free route gets spotted by a patrol at max(1, n - 2)", () => {
  const m = missionFromPath(PATHS["motel (beach road)"].path, lm("motel"));
  assert.equal(m.camerasOnRoute.length, 0);
  assert.equal(patrolIndex(m), 1);
  const [first] = m.checkpoints;
  const { state, events } = run(parked(first.x, first.z, Math.PI / 2, { mission: m }), idle, 1);
  assert.equal(state.checkpoint, 1);
  assert.deepEqual(events, ["checkpoint", "wanted"]);
  assert.equal(state.wantedReason, "patrol");
  assert.equal(state.heat, 20);
  assert.equal(starsFor(state.heat), 1);
  assert.equal(state.cops.length, 1);
});

test("the patrol waits until checkpoint max(1, n - 2) on a long clean route", () => {
  const m = missionFromPath(PATHS["causeway (coast road, two crates)"].path, lm("causeway"));
  assert.equal(m.camerasOnRoute.length, 0);
  const n = m.checkpoints.length; // 6
  assert.equal(patrolIndex(m), n - 2);
  let state = createDriveState(m);
  for (let k = 0; k < n - 1; k++) {
    const cp = m.checkpoints[k];
    const r = run({ ...state, x: cp.x, z: cp.z }, idle, 1);
    state = r.state;
    assert.equal(state.checkpoint, k + 1);
    assert.equal(state.wantedTriggered, k + 1 >= n - 2, `wanted after checkpoint ${k + 1}`);
  }
  assert.equal(state.wantedReason, "patrol");
});

test("never both: after a patrol, cameras do not raise the heat again", () => {
  const cam = lm("cam-bridge");
  const s = parked(cam.x, cam.z, Math.PI, {
    wantedTriggered: true,
    wantedReason: "patrol",
    heat: 20,
    cops: [{ lag: 80 }],
  });
  const { state, events } = run(s, idle, 5);
  assert.equal(count(events, "wanted"), 0);
  assert.equal(state.wantedReason, "patrol");
  assert.equal(state.cops.length, 1);
  assert.ok(state.heat <= 20);
});

test("never both: a route with cameras ahead gets no patrol", () => {
  const m = defaultMission(); // pier cam lies between checkpoints 1 and 2
  assert.equal(patrolIndex(m), 1);
  const cp = m.checkpoints[0];
  const { state, events } = run(parked(cp.x, cp.z, 0, { mission: m }), idle, 1);
  assert.equal(state.checkpoint, 1);
  assert.equal(count(events, "wanted"), 0);
  assert.equal(state.wantedTriggered, false);
});

test("a driver who dodges the planned cameras is still picked up by a patrol", () => {
  // Route passes the pier cam between gates 1 and 2; the car teleports past it.
  const m = defaultMission();
  let state = createDriveState(m);
  for (const k of [0, 1]) state = run({ ...state, x: m.checkpoints[k].x, z: m.checkpoints[k].z }, idle, 1).state;
  assert.equal(state.checkpoint, 2);
  assert.equal(state.wantedReason, "patrol");
  assert.equal(starsFor(state.heat), 1);
});

test("patrolIndex follows max(1, n - 2)", () => {
  const mk = (n: number) => ({ ...defaultMission(), checkpoints: Array.from({ length: n }, () => ({ x: 0, z: 0, name: "" })) });
  assert.equal(patrolIndex(mk(1)), 1);
  assert.equal(patrolIndex(mk(2)), 1);
  assert.equal(patrolIndex(mk(3)), 1);
  assert.equal(patrolIndex(mk(4)), 2);
  assert.equal(patrolIndex(mk(6)), 4);
});

/* ───────────────────────── Stashes ───────────────────────── */

test("driving within 7 of a marked crate collects it exactly once", () => {
  const crate = stash("stash-1"); // (75, -100) on a street
  const m: Mission = { ...defaultMission(), stashes: [crate] };
  const miss = run(parked(crate.x - STASH_RADIUS - 0.5, crate.z, Math.PI / 2, { mission: m }), idle, 2);
  assert.deepEqual(miss.state.collected, []);
  const { state, events } = run(parked(crate.x - STASH_RADIUS + 0.5, crate.z, Math.PI / 2, { mission: m }), idle, 10);
  assert.deepEqual(state.collected, [crate.id]);
  assert.equal(count(events, "stash"), 1);
  assert.equal(livePayout(state), Math.round(state.checkpoint * 300 + 750 + state.drift * 3));
});

test("unmarked crates are not pickups", () => {
  const crate = stash("stash-1");
  const { state, events } = run(parked(crate.x, crate.z, Math.PI / 2), idle, 3);
  assert.deepEqual(state.collected, []);
  assert.equal(count(events, "stash"), 0);
});

test("stepDrive does not mutate its input", () => {
  const crate = stash("stash-1");
  const m: Mission = { ...defaultMission(), stashes: [crate] };
  const before = parked(crate.x, crate.z, Math.PI / 2, { mission: m, cops: [{ lag: 40 }], heat: 60, wantedTriggered: true, speed: 20 });
  const snapshot = structuredClone(before);
  stepDrive(before, { ...idle, gas: true }, DT);
  assert.deepEqual(before, snapshot);
});

/* ───────────────────────── Spray & Pray ───────────────────────── */

test("every Spray & Pray booth fires one respray per visit and re-arms on leaving", () => {
  const [east, west] = BOOTHS;
  const chase: Partial<DriveState> = { wantedTriggered: true, wantedReason: "camera", heat: 60, cops: [{ lag: 110 }] };
  let { state, events } = run(parked(east.x, east.z, 0, chase), idle, 20);
  assert.equal(count(events, "respray"), 1, "latched while inside");
  assert.equal(state.inBooth, east.id);
  assert.equal(state.lastBooth, east.id);
  assert.equal(state.resprayUsed, false, "only a saved respray uses it up");

  ({ state, events } = run({ ...state, z: east.z + BOOTH_RADIUS + 10 }, idle, 2));
  assert.equal(state.inBooth, null);
  assert.equal(count(events, "respray"), 0);

  ({ state, events } = run({ ...state, x: east.x, z: east.z }, idle, 5));
  assert.equal(count(events, "respray"), 1, "re-armed after leaving");

  ({ state, events } = run({ ...state, x: west.x, z: west.z, heading: Math.PI / 2 }, idle, 5));
  assert.equal(count(events, "respray"), 1);
  assert.equal(state.inBooth, west.id);
  assert.equal(state.lastBooth, west.id);

  const applied = applyRespray(state, 0.3).state;
  assert.equal(applied.resprayUsed, true);
  assert.equal(applied.usedBooth, west.id);
  const reheat = { ...applied, heat: 40, cops: [{ lag: 110 }], x: east.x, z: east.z, inBooth: null };
  ({ events } = run(reheat, idle, 5));
  assert.equal(count(events, "respray"), 0, "one successful respray per run");
});

test("a booth ignores a car with no heat", () => {
  const { state, events } = run(parked(BOOTHS[0].x, BOOTHS[0].z), idle, 5);
  assert.equal(count(events, "respray"), 0);
  assert.equal(state.inBooth, BOOTHS[0].id, "still tracks which booth the car is in");
  assert.equal(state.lastBooth, null);
});

test("a respray clears stars in proportion to how much paint changed", () => {
  const wanted = { ...createDriveState(), wantedTriggered: true, heat: 60, cops: [{ lag: 70 }, { lag: 86 }, { lag: 102 }] };
  const light = applyRespray(wanted, 0.09);
  assert.equal(light.cleared, 1);
  assert.equal(starsFor(light.state.heat), 2);
  assert.equal(light.state.cops.length, 2);
  assert.ok(light.state.cops.every((c, i) => c.lag === wanted.cops[i].lag + 45));
  assert.equal(light.state.events.includes("lost"), false);

  const heavy = applyRespray(wanted, 0.3);
  assert.equal(heavy.cleared, 3);
  assert.equal(heavy.remaining, 0);
  assert.equal(heavy.state.heat, 0);
  assert.deepEqual(heavy.state.cops, []);
  assert.deepEqual(heavy.state.events, ["lost"]);

  assert.equal(applyRespray(wanted, 0).cleared, 1, "a respray always shakes off at least one star");
  assert.equal(wanted.heat, 60, "input untouched");
});

/* ───────────────────────── Chase, bust, timeout ───────────────────────── */

test("stalling with a cop on your bumper eventually busts you", () => {
  const s = parked(0, 0, 0, { wantedTriggered: true, wantedReason: "camera", heat: 60, cops: [{ lag: 11 }] });
  const { state, events } = run(s, idle, 120);
  assert.equal(state.finished, true);
  assert.equal(state.busted, true);
  assert.equal(state.won, false);
  assert.equal(count(events, "busted"), 1);
  assert.equal(count(events, "closing"), 1);
  assert.ok(events.includes("bump"));
});

test("outrunning every cop loses them and the heat decays", () => {
  const s = parked(0, 20, 0, { wantedTriggered: true, heat: 20, cops: [{ lag: 119.9 }], speed: 29 });
  const { state, events } = run(s, { ...idle, gas: true }, 2);
  assert.deepEqual(state.cops, []);
  assert.ok(events.includes("lost"));
  const cooled = run({ ...state, x: 0, z: 30, speed: 0 }, idle, 60);
  assert.equal(cooled.state.heat, 0);
  assert.equal(starsFor(cooled.state.heat), 0);
});

test("shaking the last cop clears the wanted level with a single \"lost\"", () => {
  const s = parked(0, 20, 0, { wantedTriggered: true, wantedReason: "camera", heat: 60, cops: [{ lag: 119.9 }], speed: 29 });
  const { state, events } = run(s, { ...idle, gas: true }, 200);
  assert.equal(count(events, "lost"), 1, "announced once, not again when heat hits zero");
  assert.equal(state.heat, 0);
  assert.equal(starsFor(state.heat), 0);
  // A clean getaway is now possible straight away.
  assert.equal(scoreBreakdown({ ...state, won: true }).clean, 1000);
});

test("an unattended run times out exactly at the mission's limit", () => {
  const m: Mission = { ...defaultMission(), seconds: 12 };
  const { state } = run(createDriveState(m), idle, 12 / DT + 40);
  assert.equal(state.finished, true);
  assert.equal(state.won, false);
  assert.equal(state.busted, false);
  assert.equal(state.elapsed, 12);
  assert.equal(state.limit, 12);
});

test("large frame times are clamped to 50 ms", () => {
  const s = stepDrive(createDriveState(), { ...idle, gas: true }, 5);
  assert.ok(Math.abs(s.elapsed - 0.05) < 1e-9);
});

/* ───────────────────────── Physics & roads ───────────────────────── */

test("hitting a kerb keeps the car's travel direction in both lanes", () => {
  // Southbound on the x=150 avenue drifting east into the block.
  let { state } = run(parked(12.5 + 150, -175, Math.PI - 0.3, { speed: 25 }), { ...idle, gas: true }, 3);
  assert.ok(onRoad(state.x, state.z));
  assert.ok(Math.abs(wrap(state.heading - Math.PI)) <= 0.46, `still southbound (${state.heading})`);
  assert.ok(state.collisions >= 1);
  // Northbound on the same avenue drifting east.
  ({ state } = run(parked(12.5 + 150, -175, 0.3, { speed: 25 }), { ...idle, gas: true }, 3));
  assert.ok(Math.abs(wrap(state.heading)) <= 0.46, `still northbound (${state.heading})`);
  // Westbound on a street drifting south.
  ({ state } = run(parked(75, -100 + 12.5, -Math.PI / 2 - 0.3, { speed: 25 }), { ...idle, gas: true }, 3));
  assert.ok(Math.abs(wrap(state.heading + Math.PI / 2)) <= 0.46, `still westbound (${state.heading})`);
});

test("a kerb hit pins the car to the road edge instead of teleporting it", () => {
  const x0 = 150 + 12.9;
  let state = parked(x0, -175, 0.4, { speed: 25 });
  let maxJump = 0;
  for (let i = 0; i < 40; i++) {
    const prev = state;
    state = stepDrive(state, { ...idle, gas: true, right: true }, 1 / 60);
    maxJump = Math.max(maxJump, Math.hypot(state.x - prev.x, state.z - prev.z));
    assert.ok(onRoad(state.x, state.z));
  }
  assert.ok(state.collisions >= 1);
  assert.ok(maxJump < 1.5, `largest per-frame move ${maxJump.toFixed(2)} (no sideways snap)`);
  assert.ok(state.speed > 5, "scraping the wall slows but does not stall the car");
});

test("the car cannot leave the road network", () => {
  // Hold full right lock with gas for a long time from the start.
  let state = createDriveState({ ...defaultMission(), seconds: 999 });
  for (let i = 0; i < 1200; i++) {
    state = stepDrive(state, { ...idle, gas: true, right: i % 200 < 120 }, DT);
    assert.ok(onRoad(state.x, state.z), `on road at step ${i}: ${state.x}, ${state.z}`);
  }
});

test("accumulates drift and rate-limits wall collisions", () => {
  const { state } = run(createDriveState(), { ...idle, gas: true, right: true, drift: true }, 50);
  assert.ok(state.drift > 0);
  assert.ok(state.collisions <= 3);
});

test("wraps heading cleanly through repeated turns", () => {
  const { state } = run(createDriveState({ ...defaultMission(), seconds: 999 }), { ...idle, gas: true, right: true }, 500);
  assert.ok(state.heading <= Math.PI && state.heading >= -Math.PI);
  assert.ok(Number.isFinite(state.x) && Number.isFinite(state.z));
});

test("boost drains while used and recharges otherwise", () => {
  const boosted = run(parked(0, 40), { ...idle, gas: true, boost: true }, 20).state;
  assert.ok(boosted.boost < 100);
  assert.ok(boosted.speed > 17);
  const rested = run({ ...boosted, speed: 0 }, idle, 20).state;
  assert.ok(rested.boost > boosted.boost);
});

test("copPose follows the driven line behind the car", () => {
  const { state } = run(createDriveState(), { ...idle, gas: true }, 60);
  assert.ok(state.trail.length > 1);
  const pose = copPose(state, { lag: 20 });
  for (const v of [pose.x, pose.z, pose.heading]) assert.ok(Number.isFinite(v));
  assert.ok(pose.z > state.z, "cop is behind (south of) a northbound car");
  assert.ok(Math.abs(wrap(pose.heading)) < 0.2, "cop faces the same way");
  const fresh = copPose(createDriveState(), { lag: 30 });
  assert.equal(fresh.x, defaultMission().start.x);
  assert.equal(fresh.z, defaultMission().start.z);
});

/* ───────────────────────── Scoring ───────────────────────── */

test("runScore follows the contract formula", () => {
  const base = createDriveState();
  const s: DriveState = {
    ...base,
    won: true,
    finished: true,
    checkpoint: 3,
    collected: ["stash-1", "stash-2"],
    drift: 100,
    boost: 50,
    elapsed: 40,
    collisions: 2,
    heat: 30, // 2★
    wantedTriggered: true,
  };
  const expected = 2500 + 3 * 300 + 2 * 750 + 100 * 3 + 50 * 2 - 40 * 6 - 2 * 125 - 2 * 150;
  assert.equal(runScore(s), expected);
  // Clean getaway: won, was wanted, no stars left.
  assert.equal(runScore({ ...s, heat: 0 }), expected + 2 * 150 + 1000);
  // No bonus if never wanted.
  assert.equal(runScore({ ...s, heat: 0, wantedTriggered: false }), expected + 2 * 150);
  // Losing drops the finish bonus.
  assert.equal(runScore({ ...s, won: false }), expected - 2500);
  assert.equal(scoreBreakdown(s).total, runScore(s));
  assert.equal(scoreBreakdown({ ...s, heat: 0 }).clean, 1000);
});

test("scores are never negative and a finished route beats an idle one", () => {
  const base = createDriveState();
  assert.ok(runScore(base) >= 0);
  assert.equal(runScore({ ...base, boost: 0, elapsed: 500, collisions: 50, heat: 100 }), 0);
  assert.ok(runScore({ ...base, finished: true, won: true, checkpoint: 3, elapsed: 40 }) > runScore(base));
});

test("livePayout counts checkpoints, stashes and drift", () => {
  const s = { ...createDriveState(), checkpoint: 2, collected: ["stash-3"], drift: 10.4 };
  assert.equal(livePayout(s), 2 * 300 + 750 + 31);
});

test("starsFor maps heat to 0-5 stars", () => {
  assert.equal(starsFor(0), 0);
  assert.equal(starsFor(-5), 0);
  assert.equal(starsFor(1), 1);
  assert.equal(starsFor(20), 1);
  assert.equal(starsFor(21), 2);
  assert.equal(starsFor(60), 3);
  assert.equal(starsFor(100), 5);
  assert.equal(starsFor(999), 5);
});

test("reaching the last gate after the clock runs out is a loss, not a win", () => {
  const mission = defaultMission();
  const last = mission.checkpoints[mission.checkpoints.length - 1];
  let state = createDriveState(mission);
  state = { ...state, checkpoint: mission.checkpoints.length - 1, x: last.x, z: last.z + 30, heading: 0, speed: 29, elapsed: mission.seconds - 0.01 };
  for (let i = 0; i < 60 && !state.finished; i++) state = stepDrive(state, { ...idle, gas: true }, DT);
  assert.equal(state.finished, true);
  assert.equal(state.won, false);
});
