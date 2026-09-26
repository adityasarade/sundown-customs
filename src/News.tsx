import { useMemo, useState } from "react";
import { ArrowRight, Camera, Download, Radio, RotateCcw } from "lucide-react";
import type { RunResult } from "./World";
import { downloadImage } from "./artwork";
import { composeBroadcast } from "./broadcast";

type Props = {
  alias: string;
  outcome: "passed" | "busted" | "failed";
  result: RunResult;
  cctv: string;
  before: string;
  after: string;
  changed: number;
  emblem?: string;
  tattoo?: string;
  onPhoto: () => void;
  onRetry: () => void;
  onHijack?: () => void;
};

function copy({ alias, outcome, result, after, changed }: Props) {
  const pct = Math.round(changed * 100);
  if (outcome === "busted")
    return {
      headline: `LOCAL MENACE “${alias}” IN CUSTODY. PAINT JOB SEIZED AS EVIDENCE.`,
      line: `“Officers say the suspect’s custom livery was ‘extremely memorable’, which, experts note, is the opposite of what you want. Back to you, Dana.”`,
    };
  if (outcome === "failed")
    return {
      headline: `DELIVERY DRIVER “${alias}” MISSES THE MEET. BLAMES THE SUNSET.`,
      line: `“The coupe was last seen admiring its own reflection near the marina. Nobody was impressed, except everyone. Back to you, Dana.”`,
    };
  if (after && !result.stars)
    return {
      headline: `MYSTERY COUPE VANISHES AFTER ${pct}% “MAKEOVER”.`,
      line: `“Police had a perfect description of the car. Then it was ${pct}% a different car. Chief Varga calls it ‘an insult to paint’. Back to you, Dana.”`,
    };
  return {
    headline: `CUSTOM COUPE LEADS BAY PD ON A ${result.stars}-STAR SUNSET TOUR.`,
    line: `“Witnesses describe the livery as ‘loud’, ‘personal’ and ‘honestly? kind of iconic’. Police are still looking for it. It’s very easy to spot. Back to you, Dana.”`,
  };
}

async function exportBroadcast(p: Props, headline: string) {
  const url = await composeBroadcast({
    alias: p.alias,
    headline,
    cctv: p.cctv,
    before: p.before,
    after: p.after,
    changed: p.changed,
    emblem: p.emblem,
    score: p.result.score,
  });
  downloadImage(url, "sundown-bay9-news.png");
}

export default function News(p: Props) {
  const { headline, line } = useMemo(() => copy(p), [p]);
  const [busy, setBusy] = useState(false);
  const pct = Math.round(p.changed * 100);
  const ticker = [
    `SOLANA BAY PD CONSIDERS BANNING THE COLOUR ORANGE`,
    `SPRAY & PRAY OWNER: “NEVER SEEN THAT CAR BEFORE IN MY LIFE”`,
    `MARINA CROWD RATES ${p.alias}’S LIVERY 10/10`,
    `PAYOUT REPORTED: $${p.result.score.toLocaleString()}`,
    `LOCAL SUNSET CONTINUES TO BE A SUNSET`,
    `TRAFFIC: EAST ROAD CLEAR, SUSPICIOUSLY`,
  ].join("  ◆  ");
  return (
    <section className={`news ${p.outcome}`}>
      <div className="news-bg" />
      <header className="news-top">
        <span className="news-logo">
          BAY<b>9</b>
        </span>
        <span className="news-live">● LIVE</span>
        <span className="news-place">SOLANA BAY · 19:48</span>
        {p.emblem && (
          <span className="news-crew">
            <img src={p.emblem} alt="Suspect crew emblem" />
            SUSPECT CREW
          </span>
        )}
      </header>
      <div className="news-inset">
        <div className="cctv">
          <img src={p.cctv} alt="Security-camera still of your car" />
          <span>
            <i /> CAM 04 · NORTH PIER · 19:44
          </span>
        </div>
        <div className="paint-compare">
          <figure>
            <img src={p.before} alt="The livery police saw" />
            <figcaption>PAINT THEY SAW</figcaption>
          </figure>
          <b className={p.after ? "" : "same"}>
            {p.after ? `${pct}% NEW` : "SAME PAINT"}
          </b>
          <figure>
            <img src={p.after || p.before} alt="Your livery now" />
            <figcaption>{p.after ? "PAINT NOW" : "STILL THE SAME"}</figcaption>
          </figure>
        </div>
      </div>
      {p.tattoo && (
        <figure className="news-ink">
          <img src={p.tattoo} alt="Witness sketch of the suspect's tattoo" />
          <figcaption>WITNESS: “HE HAD THIS TATTOO”</figcaption>
        </figure>
      )}
      <div className="lower-third">
        <div className="lt-head">
          <span>BREAKING</span>
          <h2>{headline}</h2>
        </div>
        <p>{line}</p>
      </div>
      <div className="ticker" aria-hidden="true">
        <div>
          <span>{ticker}</span>
          <span>{ticker}</span>
        </div>
      </div>
      <div className="news-actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await exportBroadcast(p, headline);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} /> {busy ? "PRINTING…" : "SAVE THE BROADCAST"}
        </button>
        {p.onHijack && (
          <button className="btn hijack-btn" onClick={p.onHijack}>
            <Radio size={16} /> HIJACK THE SIGNAL
          </button>
        )}
        <button className="btn secondary" onClick={p.onPhoto}>
          <Camera size={16} /> PHOTO MODE <ArrowRight size={15} />
        </button>
        <button className="btn text" onClick={p.onRetry}>
          <RotateCcw size={14} /> Run it back
        </button>
      </div>
    </section>
  );
}
