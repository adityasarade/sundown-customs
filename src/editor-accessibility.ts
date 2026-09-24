/** Keep the native editor's responsive Save/Cancel icons named for assistive technology. */
export function labelEditorActions(host: HTMLElement) {
  const label = () => {
    host.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const name = button.textContent?.trim();
      if (
        (name === "Save" || name === "Cancel") &&
        !button.hasAttribute("aria-label")
      ) {
        button.setAttribute("aria-label", name);
      }
    });
  };
  label();
  const observer = new MutationObserver(label);
  observer.observe(host, { childList: true, subtree: true });
  return () => observer.disconnect();
}
