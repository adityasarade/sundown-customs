/**
 * Warm Unlayer's hosted image-editor runtime while the visitor is still in the
 * van, so that pressing FREEZE & EDIT THIS FRAME opens a working desk instead
 * of a spinner.
 *
 * `@unlayer/react-image-editor` injects `cdn.unlayer.com/image-editor/embed.js`
 * on mount, waits for it, calls `window.ImageEditor.load()` to pull the
 * versioned bundle, and only then creates the editor. That whole chain used to
 * start at the moment the visitor asked for the editor, which put the slowest
 * network work in the one place where they are waiting on it.
 *
 * Nothing here is a private API. The wrapper's loader is deliberately
 * cooperative: it returns immediately if `window.ImageEditor` already exists,
 * and otherwise reuses an existing `<script>` tag with the same resolved `src`
 * rather than requesting a second copy. So pre-injecting the documented embed
 * URL — and then calling the documented `load()` exactly as the wrapper does —
 * is the supported way to move this cost earlier.
 *
 * Failure handling matters here: if our tag errors, it is removed from the DOM
 * again. A dead tag left in place would make the wrapper adopt it and sit on
 * its own 30-second reuse timeout instead of failing fast into the app's
 * "the image desk did not connect" recovery card.
 */
const EMBED_URL = "https://cdn.unlayer.com/image-editor/embed.js";

let warming = false;

/** Start the plate download once the editor runtime is no longer competing. */
function warmPlate(plate?: string) {
  if (!plate) return;
  const image = new Image();
  // Explicitly last in line: the editor runtime and anything the visitor can
  // currently see both matter more than a plate they have not asked for yet.
  image.fetchPriority = "low";
  image.decoding = "async";
  image.src = plate;
}

/**
 * Idempotent. Safe to call on every render of the screen that triggers it.
 *
 * @param plate Optional canonical PNG to pull down after the runtime lands —
 *   the angle the visitor is most likely to open first.
 */
export function warmImageEditor(plate?: string) {
  if (typeof window === "undefined" || warming) return;
  warming = true;
  if (window.ImageEditor) {
    void window.ImageEditor.load()
      .catch(() => {})
      .then(() => warmPlate(plate));
    return;
  }
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${EMBED_URL}"]`,
  );
  const tag = existing ?? document.createElement("script");
  tag.addEventListener(
    "load",
    () => {
      void (window.ImageEditor?.load() ?? Promise.resolve())
        .catch(() => {})
        .then(() => warmPlate(plate));
    },
    { once: true },
  );
  tag.addEventListener(
    "error",
    () => {
      // Leave no adopted-but-dead tag behind; see the note above.
      tag.remove();
      warming = false;
    },
    { once: true },
  );
  if (existing) return;
  tag.src = EMBED_URL;
  tag.async = true;
  document.head.appendChild(tag);
}
