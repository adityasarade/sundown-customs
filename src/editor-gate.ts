/**
 * The editor gate: decides whether a Save coming out of Unlayer React Image
 * Editor represents a real edit, or an untouched frame being pushed through.
 *
 * Why this is a pure function in `lib/` instead of an `if` inside `onSave`:
 * the gate is the one place in Dead Air that can make the experience
 * *uncompletable*, so it has to be readable and unit-testable on its own.
 *
 * The package documents `hasChanges()` as "whether the editor has unsaved
 * changes" (see `@unlayer/react-image-editor/dist/index.d.ts`). Reading it
 * inside `onSave` — i.e. after the save — races the runtime's own dirty-flag
 * reset: a CDN build that clears the flag on save would make every genuine
 * edit look untouched. So the caller tracks `hasChanges()` *while* the visitor
 * works and passes the last-known-true value here, plus two image snapshots.
 *
 * Priority of signals, strongest first:
 *  1. `sawChanges` — the dirty flag was observed true during editing.
 *  2. `current` vs `baseline` — two `getImage()` reads, so the same encoder on
 *     both sides: differing bytes prove an edit, identical bytes prove none.
 *  3. `saved` vs `baseline` — the onSave data URL against the starting image.
 *  4. Nothing measurable: allow the save. Ambiguity must never lock a visitor
 *     out of their own broadcast.
 */
export type EditorGateSignals = {
  /** The `dataUrl` handed to `onSave` by the editor. */
  saved: string;
  /**
   * `getImage()` captured before the visitor touched anything: in `onLoad`, or
   * from the first later read where the editor reported itself clean (onLoad
   * can fire before the image is actually in the canvas).
   */
  baseline: string | null;
  /** `getImage()` read at save time. Null when the method is unavailable. */
  current: string | null;
  /** True if `hasChanges()` was ever observed true while editing. */
  sawChanges: boolean;
  /** True if `hasChanges()` could actually be read at least once. */
  changeTrackingAvailable: boolean;
};

export type EditorGateVerdict = {
  /** True when the save may proceed. */
  edited: boolean;
  /** Which signal decided it. Useful in tests and when debugging a runtime. */
  reason:
    | "tracked-changes"
    | "snapshot-differs"
    | "snapshot-identical"
    | "saved-differs"
    | "saved-identical"
    | "no-tracked-changes"
    | "unverifiable";
};

const filled = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Two image strings are only worth comparing when both are real encoded
 * bitmaps. `getImage()` can hand back the source *URL* (or an empty canvas)
 * in the moments right after mount, and comparing that against a later data
 * URL would read as an edit that never happened.
 */
export const comparableImages = (a: string | null, b: string | null) =>
  filled(a) &&
  filled(b) &&
  a.startsWith("data:image/") &&
  b.startsWith("data:image/") &&
  a.length > 512 &&
  b.length > 512;

export function judgeEditorSave(signals: EditorGateSignals): EditorGateVerdict {
  const { saved, baseline, current, sawChanges, changeTrackingAvailable } =
    signals;
  if (sawChanges) return { edited: true, reason: "tracked-changes" };
  if (comparableImages(baseline, current) && current !== baseline)
    return { edited: true, reason: "snapshot-differs" };
  // Two identical getImage() reads only get to reject when the dirty flag was
  // also readable, so a stale or stubbed getImage() cannot block a real edit.
  if (
    changeTrackingAvailable &&
    comparableImages(baseline, current) &&
    current === baseline
  )
    return { edited: false, reason: "snapshot-identical" };
  if (comparableImages(baseline, saved) && saved !== baseline)
    return { edited: true, reason: "saved-differs" };
  if (comparableImages(baseline, saved) && saved === baseline)
    return { edited: false, reason: "saved-identical" };
  if (changeTrackingAvailable)
    return { edited: false, reason: "no-tracked-changes" };
  return { edited: true, reason: "unverifiable" };
}
