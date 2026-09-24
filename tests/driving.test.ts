import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKPOINTS,
  RUN_SECONDS,
  createDriveState,
  runScore,
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
