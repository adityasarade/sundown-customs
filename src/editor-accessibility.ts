/**
 * Keep the native editor's Save/Cancel actions named for assistive technology.
 * Below 640px Unlayer hides the (translated) label text, leaving icon-only
 * buttons, so the label is copied into aria-label.
 */
export function labelEditorActions(host: HTMLElement, names: string[] = []) {
  const wanted = new Set(["Save", "Cancel", ...names]);
  const label = () => {
    host.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const name = button.textContent?.trim();
      if (name && wanted.has(name) && button.getAttribute("aria-label") !== name)
        button.setAttribute("aria-label", name);
    });
  };
  label();
  const observer = new MutationObserver(label);
  observer.observe(host, { childList: true, subtree: true });
  return () => observer.disconnect();
}
