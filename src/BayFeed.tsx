import { useEffect, useState } from "react";
import { Download, Heart, MessageCircle, Repeat2, X } from "lucide-react";
import { downloadImage } from "./artwork";

type Props = {
  photo: string;
  alias: string;
  avatar: string;
  score: number;
  outcome: "passed" | "busted" | "failed";
  onClose: () => void;
};

/** A parody social feed that "posts" the visitor's finished Snappix photo. */
export default function BayFeed({ photo, alias, avatar, score, outcome, onClose }: Props) {
  const target = 1200 + Math.round(score * 2.4);
  const [likes, setLikes] = useState(0);
  const [shown, setShown] = useState(0);
  const handle = alias.toLowerCase().replace(/[^a-z0-9]/g, "") || "ghost";
  const comments = [
    { who: "nico_sundown", text: "that is MY car?? ok it looks incredible. still my car." },
    outcome === "busted"
      ? { who: "BayPD_Official", text: "Thank you for the evidence photo. See you in court." }
      : { who: "BayPD_Official", text: "We have several questions about this vehicle." },
    { who: "dana_bay9", text: "Chief Varga just threw his coffee at the TV. Iconic." },
    { who: "marina_mike", text: "10/10 would get chased by this paint job" },
    { who: "sprayandpray", text: "never seen this car before in my life 👀" },
  ];
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 2200);
      setLikes(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timers = comments.map((_, i) => setTimeout(() => setShown(i + 1), 700 + i * 650));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return (
    <div className="modal-scrim bayfeed-scrim">
      <section className="bayfeed" aria-label="BAYFEED post">
        <header>
          <span className="bf-logo">
            BAY<b>FEED</b>
          </span>
          <button aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="bf-user">
          <img src={avatar} alt="" />
          <div>
            <b>@{handle}</b>
            <small>Solana Bay · just now</small>
          </div>
          <span className="bf-follow">Follow</span>
        </div>
        <img className="bf-photo" src={photo} alt="Your finished Snappix photograph" />
        <div className="bf-actions">
          <span className="liked">
            <Heart size={18} fill="currentColor" /> {likes.toLocaleString()}
          </span>
          <span>
            <MessageCircle size={18} /> {comments.length}
          </span>
          <span>
            <Repeat2 size={18} /> {Math.round(likes / 9).toLocaleString()}
          </span>
        </div>
        <p className="bf-caption">
          <b>@{handle}</b> fresh paint, zero regrets. #SolanaBay #SprayAndPray
          #BuiltWithImageEditor
        </p>
        <ul className="bf-comments">
          {comments.slice(0, shown).map((c) => (
            <li key={c.who}>
              <b>@{c.who}</b> {c.text}
            </li>
          ))}
        </ul>
        <button
          className="btn primary full"
          onClick={() => downloadImage(photo, "sundown-snappix.png")}
        >
          <Download size={16} /> SAVE THE SNAPPIX
        </button>
      </section>
    </div>
  );
}
