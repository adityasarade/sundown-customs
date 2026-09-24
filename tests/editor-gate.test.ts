import assert from "node:assert/strict";
import test from "node:test";
import { judgeEditorSave } from "../src/editor-gate.ts";
const image = "data:image/png;base64," + "a".repeat(600);
const initial = {
  saved: image,
  baseline: image,
  current: image,
  sawChanges: false,
  changeTrackingAvailable: true,
};
test("rejects unchanged native saves", () =>
  assert.equal(judgeEditorSave(initial).edited, false));
test("retains a real edit when the runtime clears its dirty flag during Save", () =>
  assert.equal(judgeEditorSave({ ...initial, sawChanges: true }).edited, true));
test("accepts a changed rendered snapshot", () =>
  assert.equal(
    judgeEditorSave({ ...initial, current: image + "b", saved: image + "b" })
      .edited,
    true,
  ));
test("missing runtime signals do not lose user artwork", () =>
  assert.equal(
    judgeEditorSave({
      ...initial,
      baseline: null,
      current: null,
      changeTrackingAvailable: false,
    }).edited,
    true,
  ));
