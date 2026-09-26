import { useEffect, useState } from "react";
import { Check, ChevronRight, Lock, Signal, Star, Target, Wifi, BatteryFull, X } from "lucide-react";
import "./jobs.css";

export type JobStatus = "done" | "next" | "optional" | "locked";
export type JobStep = { id: string; title: string; sub: string; status: JobStatus };

export type JobsProps = {
  steps: JobStep[];
  onSelect(id: string): void;
  objective: string;
  /** Optional close button in the phone header. */
  onClose?: () => void;
};

const CHIP: Record<JobStatus, string> = {
  done: "DONE",
  next: "UP NEXT",
  optional: "SIDE JOB",
  locked: "LOCKED",
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
}

function StepIcon({ status, index }: { status: JobStatus; index: number }) {
  if (status === "done") return <Check size={16} strokeWidth={3.2} />;
  if (status === "locked") return <Lock size={14} strokeWidth={2.6} />;
  if (status === "optional") return <Star size={15} strokeWidth={2.6} />;
  return <b>{index + 1}</b>;
}

/** GTA-style phone job list — Nico texts you the heist steps. */
export default function Jobs({ steps, onSelect, objective, onClose }: JobsProps) {
  const done = steps.filter((s) => s.status === "done").length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  return (
    <section className="bayphone" aria-label="BayPhone jobs">
      <div className="bp-bezel">
        <div className="bp-status">
          <Clock />
          <i className="bp-notch" aria-hidden="true" />
          <span className="bp-icons" aria-hidden="true">
            <Signal size={12} strokeWidth={2.6} />
            <Wifi size={12} strokeWidth={2.6} />
            <BatteryFull size={14} strokeWidth={2.4} />
          </span>
        </div>

        <header className="bp-head">
          <img className="bp-avatar" src="/art/nico.webp" alt="" width={44} height={44} />
          <div className="bp-who">
            <b>BAYPHONE · JOBS</b>
            <span>
              <i className="bp-online" /> Nico is online
            </span>
          </div>
          {onClose && (
            <button type="button" className="bp-close" onClick={onClose} aria-label="Put the phone away">
              <X size={16} strokeWidth={2.8} />
            </button>
          )}
        </header>

        <div className="bp-objective">
          <Target size={15} strokeWidth={2.8} aria-hidden="true" />
          <p>{objective}</p>
        </div>

        <div
          className="bp-progress"
          role="progressbar"
          aria-label="Heist progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          aria-valuetext={`${done} of ${steps.length} jobs done`}
        >
          <span>
            HEIST PROGRESS <b>{done}/{steps.length}</b>
          </span>
          <div className="bp-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>

        <ol className="bp-list">
          {steps.map((s, i) => {
            const locked = s.status === "locked";
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`bp-step bp-${s.status}`}
                  disabled={locked}
                  aria-current={s.status === "next" ? "step" : undefined}
                  onClick={() => onSelect(s.id)}
                >
                  <span className="bp-icon">
                    <StepIcon status={s.status} index={i} />
                  </span>
                  <span className="bp-text">
                    <b>{s.title}</b>
                    <small>{s.sub}</small>
                  </span>
                  <span className="bp-chip">{CHIP[s.status]}</span>
                  {!locked && <ChevronRight className="bp-go" size={16} strokeWidth={2.8} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ol>
        <i className="bp-home" aria-hidden="true" />
      </div>
    </section>
  );
}

/** Compact objective chip for the top bar. */
export function ObjectivePill({ text }: { text: string }) {
  return (
    <div className="objective-pill" role="status" aria-live="polite">
      <i className="op-dot" aria-hidden="true" />
      <span className="op-label">OBJECTIVE</span>
      <span className="op-text">{text}</span>
    </div>
  );
}
