import { useEffect } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Camera,
  Github,
  Image,
  Paintbrush,
  Play,
  Radio,
  Sparkles,
  Star,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
import "./home.css";

type HomeProps = {
  onStart: () => void;
  onSound: () => void;
  sound: boolean;
};

const slides = [
  { src: "/art/cover.webp", alt: "Orange coupe and Nico at a sunset marina" },
  { src: "/art/planning.webp", alt: "Heist planning table with a city map and pins" },
  { src: "/art/chase.webp", alt: "Orange coupe drifting away from police" },
  { src: "/art/respray.webp", alt: "Sports car in a neon respray booth" },
  { src: "/art/hijack.webp", alt: "Pirate broadcast hijack on a rooftop" },
  { src: "/art/anchor.webp", alt: "Bay 9 television news anchor" },
];

const jobs = [
  {
    number: "01",
    title: "PAINT YOUR RIDE",
    copy: "Unlayer React Image Editor is the paint booth. Your saved pixels are the car.",
    image: "/art/cover.webp",
    position: "center",
  },
  {
    number: "02",
    title: "DRAW THE PLAN",
    copy: "Sketch your getaway on Nico’s map. Your ink becomes the GPS, the checkpoints and the cash.",
    image: "/art/planning.webp",
    position: "center",
  },
  {
    number: "03",
    title: "GET NOTICED",
    copy: "Cameras on your route. Up to five stars. A helicopter.",
    image: "/art/chase.webp",
    position: "center",
  },
  {
    number: "04",
    title: "SPRAY & PRAY",
    copy: "Repaint mid-chase. Every 8% you change drops a star.",
    image: "/art/respray.webp",
    position: "center",
  },
  {
    number: "05",
    title: "INK & IRON",
    copy: "Design the tattoo your driver wears out the window — and on the mugshot.",
    image: "/art/parlor.webp",
    position: "center",
  },
  {
    number: "06",
    title: "HIJACK BAY 9",
    copy: "Take over the live news frame. Whatever you draw goes out on every billboard.",
    image: "/art/hijack.webp",
    position: "center",
  },
];

const tools = [
  { title: "PAINT BOOTH", detail: "Livery on the 3D car", icon: Paintbrush },
  { title: "THE PLAN", detail: "Drawn route → mission", icon: Star },
  { title: "CREW EMBLEM", detail: "Roof, HUD, feed", icon: Sparkles },
  { title: "SPRAY & PRAY", detail: "Mid-chase respray", icon: Image },
  { title: "INK & IRON", detail: "Tattoo on your driver", icon: Paintbrush },
  { title: "SIGNAL HIJACK", detail: "Air your own news", icon: Radio },
  { title: "SNAPPIX", detail: "Darkroom + borders", icon: Camera },
  { title: "DECAL RACK", detail: "Pre-built symbols", icon: Tv },
];

export default function Home({ onStart, onSound, sound }: HomeProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.repeat) onStart();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onStart]);

  return (
    <section className="h-home">
      <header className="h-hero" aria-label="Welcome to Sundown Customs">
        <div className="h-slides" aria-hidden="true">
          {slides.map((slide, index) => (
            <img
              className={`h-slide h-slide-${index + 1}`}
              src={slide.src}
              alt={slide.alt}
              key={slide.src}
            />
          ))}
        </div>
        <div className="h-hero-shade" aria-hidden="true" />
        <div className="h-scanlines" aria-hidden="true" />

        <div className="h-topbar">
          <div className="h-badge">
            <span className="h-live-dot" />
            SOLANA BAY <span className="h-badge-sep">·</span> 19:42
            <span className="h-badge-sep">·</span> 84°F
          </div>
          <button
            className="h-sound"
            type="button"
            onClick={onSound}
            aria-label={`Turn sound ${sound ? "off" : "on"}`}
            aria-pressed={sound}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span className="h-sound-copy">SOUND {sound ? "ON" : "OFF"}</span>
          </button>
        </div>

        <div className="h-hero-content">
          <div className="h-kicker"><span /> A SOLANA BAY STORY</div>
          <div className="h-logo" aria-label="Sundown Customs">
            <h1 className="h-logo-main">SUNDOWN</h1>
            <div className="h-logo-plate">
              <span className="h-plate-bolt" />
              CUSTOMS
              <span className="h-plate-bolt" />
            </div>
          </div>
          <p className="h-tagline">Paint it. Plan it. Get wanted.<br />Repaint it. Hijack the news.</p>
          <div className="h-wanted" aria-label="Five star wanted level">
            <span className="h-wanted-label">WANTED</span>
            <span className="h-stars">
              {[0, 1, 2, 3, 4].map((star) => (
                <Star key={star} className={`h-star h-star-${star + 1}`} size={23} fill="currentColor" />
              ))}
            </span>
          </div>
          <div className="h-actions">
            <button className="h-start" type="button" onClick={onStart}>
              <span className="h-start-icon"><Play size={19} fill="currentColor" /></span>
              <span className="h-start-text">START THE JOB</span>
              <ArrowUpRight className="h-start-arrow" size={22} />
            </button>
            <span className="h-key-hint"><kbd className="h-key">ENTER</kbd> PRESS TO PLAY</span>
          </div>
        </div>

        <a className="h-scroll-cue" href="#the-job" aria-label="Scroll to the job">
          <span className="h-scroll-word">SCROLL</span>
          <ArrowDown size={20} />
        </a>

        <div className="h-radio" aria-label="Solana Bay radio stations">
          <Radio className="h-radio-icon" size={17} />
          <div className="h-radio-window">
            <div className="h-radio-track">
              <span>NOW PLAYING — COASTLINE FM 88.7</span><b>◆</b>
              <span>NON-STOP NEON 101.3</span><b>◆</b>
              <span>BAY TALK 94.1</span><b>◆</b>
              <span>BAY SOUL 94.7</span><b>◆</b><span>FREESTYLE 105 105.9</span><b>◆</b>
              <span>NOW PLAYING — COASTLINE FM 88.7</span><b>◆</b>
              <span>NON-STOP NEON 101.3</span><b>◆</b>
              <span>BAY TALK 94.1</span><b>◆</b>
              <span>BAY SOUL 94.7</span><b>◆</b><span>FREESTYLE 105 105.9</span><b>◆</b>
            </div>
          </div>
        </div>
      </header>

      <main className="h-main">
        <section className="h-job" id="the-job">
          <div className="h-section-head">
            <div>
              <span className="h-eyebrow">THE PLAN / IF YOU CAN CALL IT THAT</span>
              <h2 className="h-section-title">THE JOB</h2>
            </div>
            <p className="h-section-intro">One car. One city. Absolutely no quiet choices.</p>
          </div>
          <div className="h-job-grid">
            {jobs.map((job) => (
              <article className="h-job-card" key={job.number}>
                <div className="h-job-image-wrap">
                  <img className="h-job-image" src={job.image} alt="" style={{ objectPosition: job.position }} />
                  <span className="h-job-number">{job.number}</span>
                  <span className="h-corner h-corner-tl" />
                  <span className="h-corner h-corner-br" />
                </div>
                <div className="h-job-copy">
                  <h3>{job.title}</h3>
                  <p>{job.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="h-nico">
          <div className="h-nico-glow" aria-hidden="true" />
          <div className="h-nico-heading">
            <span className="h-eyebrow h-eyebrow-pink">YOUR QUESTIONABLE CONNECTION</span>
            <h2 className="h-section-title h-nico-title">MEET<br />NICO</h2>
            <p>Shop owner. Bad influence.<br />Owes nobody an explanation.</p>
          </div>
          <div className="h-phone">
            <div className="h-phone-bar">
              <span>19:42</span>
              <span className="h-phone-notch" />
              <span>5G</span>
            </div>
            <img className="h-nico-photo" src="/art/nico.webp" alt="Nico, owner of Sundown Customs" />
            <div className="h-phone-contact">
              <span className="h-online" /> NICO — SUNDOWN CUSTOMS
            </div>
            <div className="h-messages">
              <p className="h-message h-message-1">Got a job for you.</p>
              <p className="h-message h-message-2">Make the car loud. Make it yours.</p>
              <p className="h-message h-message-3">Just… maybe not <em>that</em> memorable.</p>
            </div>
          </div>
          <div className="h-nico-stamp" aria-hidden="true">OPEN<br /><strong>LATE</strong></div>
        </section>

        <section className="h-built">
          <div className="h-built-copy">
            <span className="h-eyebrow">UNDER THE HOOD</span>
            <h2 className="h-built-title">BUILT WITH <span>UNLAYER</span></h2>
            <p>One image editor. Seven ways to cause trouble.</p>
          </div>
          <div className="h-tool-grid">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <div className="h-tool" key={tool.title}>
                  <Icon size={22} />
                  <span><strong>{tool.title}</strong><small>{tool.detail}</small></span>
                </div>
              );
            })}
          </div>
          <button className="h-start h-start-bottom" type="button" onClick={onStart}>
            <span className="h-start-icon"><Play size={19} fill="currentColor" /></span>
            <span className="h-start-text">START THE JOB</span>
            <ArrowUpRight className="h-start-arrow" size={22} />
          </button>
        </section>
      </main>

      <footer className="h-footer">
        <p>AN ORIGINAL FAN-MADE EXPERIENCE · NOT AFFILIATED WITH ROCKSTAR GAMES · <span>#BuiltWithImageEditor</span></p>
        <a href="https://github.com/adityasarade/sundown-customs" target="_blank" rel="noreferrer">
          <Github size={17} /> VIEW THE REPO <ArrowUpRight size={14} />
        </a>
      </footer>
    </section>
  );
}
