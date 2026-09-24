import { X } from "lucide-react";

/** GTA-style help box: short, contextual, dismissible. */
export default function Guide({
  tip,
  onClose,
  placement = "top",
}: {
  tip: { id: string; title?: string; text: string } | null;
  onClose: () => void;
  placement?: "top" | "editor";
}) {
  if (!tip) return null;
  return (
    <div className={`gta-help ${placement}`} role="status" key={tip.id}>
      {tip.title && <b>{tip.title}</b>}
      <p dangerouslySetInnerHTML={{ __html: tip.text }} />
      <button aria-label="Dismiss tip" onClick={onClose}>
        <X size={14} />
      </button>
      <i className="gta-help-timer" />
    </div>
  );
}
