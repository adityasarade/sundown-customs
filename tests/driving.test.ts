import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKPOINTS,
  RESPRAY,
  RUN_SECONDS,
  applyRespray,
  copPose,
  createDriveState,
  runScore,
  starsFor,
  stepDrive,
} from "../src/driving.ts";

const idle = {
  left: false,
  right: false,
  gas: false,
  brake: false,
  boost: false,
};

test("defines the four stops around the coastal loop", () => {
  assert.equal(CHECKPOINTS.length, 4);
  assert.deepEqual(CHECKPOINTS[0], { x: 0, z: -90, name: "NORTH PIER" });
  assert.deepEqual(CHECKPOINTS[1], { x: 130, z: -100, name: "EAST MARKET" });
});

test("ends an unattended run at ninety seconds", () => {
  let result = createDriveState();
  for (let i = 0; i < RUN_SECONDS * 20 + 20; i += 1)
    result = stepDrive(result, { ...idle, gas: true }, 0.05);
  assert.equal(result.finished, true);
  assert.equal(result.won, false);
  assert.equal(result.elapsed, RUN_SECONDS);
});

test("accumulates drift and rate-limits wall collisions", () => {
  let state = createDriveState();
  for (let i = 0; i < 50; i += 1)
    state = stepDrive(
      state,
      { ...idle, gas: true, right: true, drift: true },
      0.05,
    );
  assert.ok(state.drift > 0);
  assert.ok(state.collisions <= 3);
});

test("wraps heading cleanly through repeated turns", () => {
  let state = createDriveState();
  for (let i = 0; i < 500; i += 1)
    state = stepDrive(state, { ...idle, gas: true, right: true }, 0.05);
  assert.ok(state.heading <= Math.PI && state.heading >= -Math.PI);
  assert.ok(Number.isFinite(state.x) && Number.isFinite(state.z));
});

test("can complete a full coastal loop with four deliberate turns", () => {
  let state = createDriveState();
  const controls = {
    left: false,
    right: false,
    gas: true,
    brake: false,
    boost: false,
  };
  for (let i = 0; i < 800 && !state.finished; i += 1) {
    const seconds = i * 0.05;
    controls.right =
      (seconds > 5 && seconds < 6.3) ||
      (seconds > 11.5 && seconds < 12.8) ||
      (seconds > 18 && seconds < 19.3) ||
      (seconds > 24.5 && seconds < 25.8);
    state = stepDrive(state, controls, 0.05);
  }
  assert.equal(state.won, true);
  assert.equal(state.checkpoint, CHECKPOINTS.length);
});

test("keeps scores nonnegative and rewards a completed route", () => {
  const base = createDriveState();
  assert.ok(runScore(base) >= 0);
  assert.ok(
    runScore({
      ...base,
      finished: true,
      won: true,
      checkpoint: 4,
      elapsed: 40,
    }) > runScore(base),
  );
});

test("reaching NORTH PIER clocks the paint and puts three cops on the chase", () => {
  let state = createDriveState();
  let sawWanted = false;
  for (let i = 0; i < 400 && !sawWanted; i += 1) {
    state = stepDrive(state, { ...idle, gas: true }, 0.05);
    if (state.events.includes("wanted")) sawWanted = true;
  }
  assert.ok(sawWanted, "expected a wanted event before reaching the pier");
  assert.equal(state.wantedTriggered, true);
  assert.ok(state.heat >= 60);
  assert.equal(starsFor(state.heat), 3);
  assert.equal(state.cops.length, 3);
  assert.ok(state.events.includes("checkpoint"));
});

test("a respray clears stars in proportion to how much paint changed", () => {
  const wanted = {
    ...createDriveState(),
    wantedTriggered: true,
    heat: 60,
    cops: [{ lag: 70 }, { lag: 86 }, { lag: 102 }],
  };
  assert.equal(starsFor(wanted.heat), 3);

  const light = applyRespray(wanted, 0.09);
  assert.equal(light.cleared, 1);
  assert.equal(starsFor(light.state.heat), 2);
  assert.ok(light.state.cops.length > 0);
  assert.equal(light.state.events.includes("lost"), false);

  const heavy = applyRespray(wanted, 0.3);
  assert.equal(heavy.cleared, 3);
  assert.equal(heavy.remaining, 0);
  assert.equal(heavy.state.heat, 0);
  assert.equal(heavy.state.cops.length, 0);
  assert.ok(heavy.state.events.includes("lost"));

  const untouched = applyRespray(wanted, 0);
  assert.equal(untouched.cleared, 1, "a respray always shakes off at least one star");
});

test("stalling with a cop on your bumper eventually busts you", () => {
  let state = {
    ...createDriveState(),
    wantedTriggered: true,
    heat: 60,
    speed: 0,
    cops: [{ lag: 11 }],
  };
  for (let i = 0; i < 120 && !state.finished; i += 1) {
    state = stepDrive(state, idle, 0.05);
  }
  assert.equal(state.finished, true);
  assert.equal(state.busted, true);
  assert.equal(state.won, false);
});

test("driving into the respray booth with heat emits one respray event", () => {
  let state = {
    ...createDriveState(),
    heat: 10,
    x: RESPRAY.x,
    z: RESPRAY.z,
    speed: 0,
  };
  let resprayEvents = 0;
  for (let i = 0; i < 20; i += 1) {
    state = stepDrive(state, idle, 0.05);
    resprayEvents += state.events.filter((e) => e === "respray").length;
  }
  assert.equal(resprayEvents, 1);
  assert.equal(state.resprayUsed, false, "only a saved respray uses the booth");
  assert.equal(applyRespray(state, 0.3).state.resprayUsed, true);
});

test("copPose keeps a pursuing cop on finite coordinates along the trail", () => {
  let state = createDriveState();
  for (let i = 0; i < 60; i += 1)
    state = stepDrive(state, { ...idle, gas: true, right: true }, 0.05);
  assert.ok(state.trail.length > 1);
  const pose = copPose(state, { lag: 20 });
  assert.ok(Number.isFinite(pose.x));
  assert.ok(Number.isFinite(pose.z));
  assert.ok(Number.isFinite(pose.heading));
});
