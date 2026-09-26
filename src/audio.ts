type AudioContextConstructor = typeof AudioContext;

type Wave = OscillatorType;
export const STATIONS = [
  { name: "COASTLINE FM", freq: "88.7", genre: "Sunset synth-pop · 100 BPM" },
  { name: "NON-STOP NEON", freq: "101.3", genre: "Outrun synthwave · 118 BPM" },
  { name: "BAY SOUL", freq: "94.7", genre: "West-coast G-funk · 92 BPM" },
  { name: "FREESTYLE 105", freq: "105.9", genre: "Miami freestyle · 124 BPM" },
  { name: "BAY TALK", freq: "94.1", genre: "Solana Bay talk radio" },
] as const;

const BPMS = [100, 118, 92, 124, 82] as const;
const LOOK_AHEAD = 0.12;
const TIMER_MS = 25;
const SILENCE = 0.0001;

const TALK_LINES = [
  "Solana Bay traffic update: the causeway is backed up to last Tuesday. Take the scenic route, which is also backed up.",
  "A local man has repainted his car eleven times this week. He says the twelfth color will finally look innocent.",
  "Bay P D asks citizens to report suspicious paint jobs, especially any vehicle that changes color during a police chase.",
  "Tonight's forecast: hot, humid, and a one hundred percent chance somebody loses a flip-flop on Ocean Drive.",
  "The city council has approved another drawbridge. It will remain raised whenever you are late for something important.",
  "A pelican stole a tourist's lunch downtown. Police describe the suspect as gray, confident, and extremely full.",
  "Callers agree the left lane is for passing. Drivers on the causeway have requested a definition of passing.",
  "This is Bay Talk, where every opinion is locally sourced, loudly delivered, and parked across two spaces.",
] as const;

const STATION_IDENTS = [
  "You're cruising with Coastline F M, eighty eight point seven, Solana Bay's sunset soundtrack.",
  "You're locked to Non-Stop Neon, one oh one point three, Solana Bay's home of the long drive.",
  "This is Bay Soul, ninety four point seven, low riders, high tides, and nothing but glide.",
  "Freestyle one oh five, one oh five point nine, electro heat from the heart of Solana Bay.",
  "Bay Talk, ninety four point one, all the news that fits between the traffic jams.",
] as const;

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function clamp(value: number, low = 0, high = 1): number {
  return Math.min(high, Math.max(low, value));
}

function setEnvelope(
  param: AudioParam,
  when: number,
  attack: number,
  hold: number,
  release: number,
  peak: number,
): void {
  const top = Math.max(SILENCE, peak);
  param.setValueAtTime(SILENCE, when);
  param.exponentialRampToValueAtTime(top, when + Math.max(0.002, attack));
  param.setValueAtTime(top, when + attack + hold);
  param.exponentialRampToValueAtTime(
    SILENCE,
    when + attack + hold + Math.max(0.01, release),
  );
}

/** Procedural radio, vehicle, pursuit, and UI audio for Solana Bay. */
export class Radio {
  private context?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private musicBus?: GainNode;
  private musicPan?: StereoPannerNode;
  private effectsBus?: GainNode;
  private reverb?: ConvolverNode;
  private reverbReturn?: GainNode;
  private talkStaticGain?: GainNode;
  private engineGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private engineOscillators: OscillatorNode[] = [];
  private engineGrowl?: GainNode;
  private heatGain?: GainNode;
  private heatOscillators: OscillatorNode[] = [];
  private persistentSources: AudioScheduledSourceNode[] = [];
  private noiseBuffer?: AudioBuffer;
  private timer?: number;
  private nextStep = 0;
  private nextTime = 0;
  private running = false;
  private driving = false;
  private stationIndex = 0;
  private engineSpeed = 0;
  private boosting = false;
  private talkLine = 0;
  private speechToken = 0;

  public get station(): number {
    return this.stationIndex;
  }

  public async start(): Promise<void> {
    if (typeof window === "undefined") return;

    if (!this.context) {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextConstructor })
          .webkitAudioContext;
      if (!AudioCtor) return;
      this.buildAudioGraph(new AudioCtor());
    }

    const ctx = this.context;
    if (!ctx || !this.master) return;
    await ctx.resume();
    if (this.running) return;
    this.running = true;
    this.nextStep = 0;
    this.nextTime = ctx.currentTime + 0.04;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0.48, ctx.currentTime, 0.08);
    this.applyMusicLevel(0.08);
    this.applyEngine(0.08);
    this.applyTalkStatic(0.08);

    if (this.timer === undefined) {
      this.timer = window.setInterval(() => this.schedule(), TIMER_MS);
    }
    this.schedule();
  }

  public stop(): void {
    this.running = false;
    if (this.timer !== undefined && typeof window !== "undefined") {
      window.clearInterval(this.timer);
    }
    this.timer = undefined;
    const ctx = this.context;
    if (ctx && this.master) {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setTargetAtTime(SILENCE, ctx.currentTime, 0.06);
    }
  }

  public setDriving(driving: boolean): void {
    this.driving = driving;
    if (!this.running || !this.context) return;
    this.applyMusicLevel(0.25);
    this.applyEngine(0.12);
  }

  public setStation(index: number): void {
    const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
    const next = Math.max(0, Math.min(STATIONS.length - 1, safeIndex));
    if (next === this.stationIndex) return;
    this.stationIndex = next;
    if (!this.running || !this.context) return;

    const now = this.context.currentTime;
    this.tuningBurst(now);
    this.nextStep = 0;
    this.nextTime = now + 0.14;
    this.applyMusicLevel(0.05);
    this.applyTalkStatic(0.12);
    this.schedule();
    if (typeof window !== "undefined") {
      window.setTimeout(() => this.announce(STATION_IDENTS[next]), 180);
    }
  }

  /** Update the continuous engine layer. Does nothing until start() succeeds. */
  public setEngine(speed01: number, boosting: boolean): void {
    if (!this.running || !this.context) return;
    this.engineSpeed = clamp(Number.isFinite(speed01) ? speed01 : 0);
    this.boosting = boosting;
    this.applyEngine(0.07);
  }

  /** Set pursuit intensity. Zero cops silences the continuous police wail. */
  public setHeat(copsNearby: number): void {
    const ctx = this.context;
    const gain = this.heatGain;
    if (!this.running || !ctx || !gain) return;
    const cops = Math.max(0, Number.isFinite(copsNearby) ? copsNearby : 0);
    const target = cops === 0 ? SILENCE : Math.min(0.085, 0.025 + Math.sqrt(cops) * 0.018);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(target, ctx.currentTime, cops === 0 ? 0.14 : 0.32);
  }

  /** A temporary patrol siren for scripted moments. */
  public siren(seconds = 3): void {
    const ctx = this.activeContext();
    const destination = this.effectsBus;
    if (!ctx || !destination) return;
    const duration = clamp(Number.isFinite(seconds) ? seconds : 3, 0.15, 20);
    const start = ctx.currentTime;
    const end = start + duration;
    const osc = ctx.createOscillator();
    const wobble = ctx.createOscillator();
    const wobbleDepth = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 760;
    wobble.type = "sine";
    wobble.frequency.value = 1.25;
    wobbleDepth.gain.value = 210;
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    filter.Q.value = 1.2;
    setEnvelope(gain.gain, start, 0.08, Math.max(0, duration - 0.28), 0.2, 0.085);
    wobble.connect(wobbleDepth).connect(osc.frequency);
    osc.connect(filter).connect(gain).connect(destination);
    osc.start(start);
    wobble.start(start);
    osc.stop(end + 0.03);
    wobble.stop(end + 0.03);
  }

  public stinger(passed: boolean): void {
    const ctx = this.activeContext();
    if (!ctx) return;
    const start = ctx.currentTime;
    const notes = passed ? [62, 66, 69, 74] : [62, 61, 58, 54];
    notes.forEach((pitch, index) => {
      this.tone(
        midi(pitch),
        start + index * 0.13,
        index === notes.length - 1 ? 0.85 : 0.25,
        "square",
        0.065,
        index % 2 ? 0.12 : -0.12,
        1500,
        0.012,
        0.16,
      );
    });
    this.noiseHit(start, 0.14, 0.035, 900, 4200, 0, false);
  }

  public sfx(
    name:
      | "checkpoint"
      | "stash"
      | "respray"
      | "wanted"
      | "busted"
      | "lock"
      | "hijack"
      | "click"
      | "cash",
  ): void {
    const ctx = this.activeContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    switch (name) {
      case "checkpoint":
        [72, 76, 79, 84].forEach((pitch, i) =>
          this.tone(midi(pitch), now + i * 0.075, 0.42, "sine", 0.055, i * 0.08 - 0.12, 5000, 0.006, 0.34, true),
        );
        break;
      case "stash":
      case "cash":
        this.noiseHit(now, 0.055, 0.06, 2500, 9000, -0.18, false);
        this.noiseHit(now + 0.065, 0.045, 0.045, 3200, 10000, 0.18, false);
        [79, 84, 88].forEach((pitch, i) =>
          this.tone(midi(pitch), now + 0.09 + i * 0.045, 0.48, "sine", 0.052, i * 0.12 - 0.12, 7000, 0.003, 0.4, true),
        );
        break;
      case "respray":
        this.noiseHit(now, 0.9, 0.095, 1200, 7500, -0.15, true);
        this.noiseHit(now + 0.08, 0.72, 0.045, 2800, 11000, 0.22, false);
        break;
      case "wanted":
        [38, 45, 50].forEach((pitch, i) =>
          this.tone(midi(pitch), now + i * 0.012, 0.72, "sawtooth", 0.06, i * 0.12 - 0.12, 720, 0.008, 0.62, true),
        );
        this.noiseHit(now, 0.18, 0.045, 90, 850, 0, true);
        break;
      case "busted":
        [55, 51, 46].forEach((pitch, i) => {
          this.tone(midi(pitch), now + i * 0.24, 0.48, "square", 0.06, i % 2 ? 0.15 : -0.15, 1250, 0.015, 0.4, true);
          this.tone(midi(pitch - 12), now + i * 0.24, 0.5, "sawtooth", 0.035, 0, 700, 0.01, 0.42);
        });
        break;
      case "lock":
        this.noiseHit(now, 0.045, 0.07, 1500, 9000, -0.12, false);
        this.tone(105, now + 0.025, 0.17, "triangle", 0.09, 0.08, 480, 0.003, 0.14);
        this.noiseHit(now + 0.12, 0.025, 0.045, 2400, 9500, 0.15, false);
        break;
      case "hijack":
        for (let i = 0; i < 6; i += 1) {
          this.noiseHit(now + i * 0.045, 0.026, 0.055, 500 + i * 370, 9000, i % 2 ? 0.5 : -0.5, false);
          this.tone(180 + i * 93, now + i * 0.045, 0.035, "square", 0.027, i % 2 ? 0.35 : -0.35, 5500, 0.002, 0.025);
        }
        break;
      case "click":
        this.tone(1320, now, 0.035, "sine", 0.034, 0, 5000, 0.002, 0.025);
        this.noiseHit(now, 0.018, 0.018, 3000, 10000, 0, false);
        break;
    }
  }

  public announce(text: string): void {
    if (!this.running || !this.context || typeof window === "undefined") return;
    const speech = window.speechSynthesis;
    if (!speech || typeof SpeechSynthesisUtterance === "undefined") return;
    const clean = text.trim().slice(0, 320);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    const voices = speech.getVoices();
    utterance.voice =
      voices.find((voice) => voice.lang === "en-US") ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
      null;
    utterance.lang = utterance.voice?.lang ?? "en-US";
    utterance.rate = 1.05;
    utterance.pitch = [0.92, 1.08, 0.82, 1.14, 0.88][this.stationIndex] ?? 1;
    utterance.volume = 0.82;
    const token = ++this.speechToken;
    utterance.onstart = () => {
      if (token === this.speechToken) this.duckMusic(true);
    };
    const restore = (): void => {
      if (token === this.speechToken) this.duckMusic(false);
    };
    utterance.onend = restore;
    utterance.onerror = restore;
    speech.speak(utterance);
  }

  public dispose(): void {
    this.stop();
    this.speechToken += 1;
    for (const source of this.persistentSources) {
      try {
        source.stop();
      } catch {
        // A source may already have ended while the graph is being torn down.
      }
      source.disconnect();
    }
    this.persistentSources = [];
    this.engineOscillators = [];
    this.heatOscillators = [];
    const context = this.context;
    this.master?.disconnect();
    this.context = undefined;
    this.master = undefined;
    this.compressor = undefined;
    this.musicBus = undefined;
    this.musicPan = undefined;
    this.effectsBus = undefined;
    this.reverb = undefined;
    this.reverbReturn = undefined;
    this.talkStaticGain = undefined;
    this.engineGain = undefined;
    this.engineFilter = undefined;
    this.engineGrowl = undefined;
    this.heatGain = undefined;
    this.noiseBuffer = undefined;
    if (context) void context.close();
  }

  private buildAudioGraph(ctx: AudioContext): void {
    this.context = ctx;
    this.noiseBuffer = this.makeNoiseBuffer(ctx, 2.1);

    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    master.gain.value = SILENCE;
    compressor.threshold.value = -16;
    compressor.knee.value = 16;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;
    master.connect(compressor).connect(ctx.destination);
    this.master = master;
    this.compressor = compressor;

    const music = ctx.createGain();
    const musicPan = ctx.createStereoPanner();
    music.gain.value = 0.52;
    musicPan.pan.value = -0.03;
    music.connect(musicPan).connect(master);
    this.musicBus = music;
    this.musicPan = musicPan;

    const effects = ctx.createGain();
    effects.gain.value = 0.82;
    effects.connect(master);
    this.effectsBus = effects;

    const reverb = ctx.createConvolver();
    const reverbReturn = ctx.createGain();
    reverb.buffer = this.makeImpulse(ctx, 1.65);
    reverbReturn.gain.value = 0.16;
    reverb.connect(reverbReturn).connect(master);
    this.reverb = reverb;
    this.reverbReturn = reverbReturn;

    this.buildTalkStatic(ctx, music);
    this.buildEngine(ctx, effects);
    this.buildHeat(ctx, effects);
  }

  private buildTalkStatic(ctx: AudioContext, destination: AudioNode): void {
    if (!this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const lowpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    highpass.type = "highpass";
    highpass.frequency.value = 900;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 4600;
    gain.gain.value = SILENCE;
    source.connect(highpass).connect(lowpass).connect(gain).connect(destination);
    source.start();
    this.talkStaticGain = gain;
    this.persistentSources.push(source);
  }

  private buildEngine(ctx: AudioContext, destination: AudioNode): void {
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const body = ctx.createGain();
    const growl = ctx.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 1.25;
    gain.gain.value = SILENCE;
    body.gain.value = 0.55;
    growl.gain.value = SILENCE;
    filter.connect(gain).connect(destination);

    const sawA = ctx.createOscillator();
    const sawB = ctx.createOscillator();
    const pulse = ctx.createOscillator();
    sawA.type = "sawtooth";
    sawB.type = "sawtooth";
    pulse.type = "square";
    sawA.detune.value = -7;
    sawB.detune.value = 7;
    sawA.connect(body);
    sawB.connect(body);
    body.connect(filter);
    pulse.connect(growl).connect(filter);
    sawA.start();
    sawB.start();
    pulse.start();
    this.engineOscillators = [sawA, sawB, pulse];
    this.persistentSources.push(sawA, sawB, pulse);
    this.engineFilter = filter;
    this.engineGain = gain;
    this.engineGrowl = growl;
  }

  private buildHeat(ctx: AudioContext, destination: AudioNode): void {
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const pan = ctx.createStereoPanner();
    gain.gain.value = SILENCE;
    filter.type = "bandpass";
    filter.frequency.value = 980;
    filter.Q.value = 0.7;
    pan.pan.value = 0.12;
    filter.connect(gain).connect(pan).connect(destination);

    const lowTone = ctx.createOscillator();
    const highTone = ctx.createOscillator();
    const wail = ctx.createOscillator();
    const wailLow = ctx.createGain();
    const wailHigh = ctx.createGain();
    const doppler = ctx.createOscillator();
    const dopplerLow = ctx.createGain();
    const dopplerHigh = ctx.createGain();
    lowTone.type = "sawtooth";
    highTone.type = "triangle";
    lowTone.frequency.value = 650;
    highTone.frequency.value = 865;
    wail.type = "sine";
    wail.frequency.value = 0.68;
    wailLow.gain.value = 135;
    wailHigh.gain.value = -165;
    doppler.type = "sine";
    doppler.frequency.value = 0.19;
    dopplerLow.gain.value = 16;
    dopplerHigh.gain.value = 21;
    wail.connect(wailLow).connect(lowTone.frequency);
    wail.connect(wailHigh).connect(highTone.frequency);
    doppler.connect(dopplerLow).connect(lowTone.frequency);
    doppler.connect(dopplerHigh).connect(highTone.frequency);
    lowTone.connect(filter);
    highTone.connect(filter);
    lowTone.start();
    highTone.start();
    wail.start();
    doppler.start();
    this.heatOscillators = [lowTone, highTone, wail, doppler];
    this.persistentSources.push(lowTone, highTone, wail, doppler);
    this.heatGain = gain;
  }

  private activeContext(): AudioContext | undefined {
    return this.running ? this.context : undefined;
  }

  private applyMusicLevel(timeConstant: number): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const base = this.driving ? 0.52 : 0.4;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(base, ctx.currentTime, timeConstant);
  }

  private duckMusic(ducked: boolean): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!this.running || !ctx || !bus) return;
    const base = this.driving ? 0.52 : 0.4;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(ducked ? base * 0.6 : base, ctx.currentTime, ducked ? 0.08 : 0.22);
  }

  private applyTalkStatic(timeConstant: number): void {
    const ctx = this.context;
    const gain = this.talkStaticGain;
    if (!ctx || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(this.stationIndex === 4 && this.running ? 0.035 : SILENCE, ctx.currentTime, timeConstant);
  }

  private applyEngine(timeConstant: number): void {
    const ctx = this.context;
    const gain = this.engineGain;
    const filter = this.engineFilter;
    const growl = this.engineGrowl;
    if (!ctx || !gain || !filter || !growl || this.engineOscillators.length < 3) return;
    const now = ctx.currentTime;
    const speed = this.engineSpeed;
    const fundamental = 38 + speed * 105 + (this.boosting ? 16 : 0);
    this.engineOscillators[0].frequency.setTargetAtTime(fundamental, now, 0.05);
    this.engineOscillators[1].frequency.setTargetAtTime(fundamental * 1.012, now, 0.05);
    this.engineOscillators[2].frequency.setTargetAtTime(fundamental * 0.5, now, 0.05);
    filter.frequency.setTargetAtTime(430 + speed * 1750 + (this.boosting ? 620 : 0), now, 0.08);
    filter.Q.setTargetAtTime(this.boosting ? 2.2 : 1.15, now, 0.08);
    growl.gain.setTargetAtTime(this.boosting ? 0.34 : 0.07, now, 0.06);
    const target = this.driving && this.running ? 0.018 + speed * 0.025 + (this.boosting ? 0.012 : 0) : SILENCE;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(target, now, timeConstant);
  }

  private schedule(): void {
    const ctx = this.context;
    if (!this.running || !ctx || !this.musicBus) return;
    while (this.nextTime < ctx.currentTime + LOOK_AHEAD) {
      this.scheduleStep(this.nextStep, this.nextTime);
      this.nextStep += 1;
      this.nextTime += 60 / BPMS[this.stationIndex] / 4;
    }
  }

  private scheduleStep(step: number, when: number): void {
    switch (this.stationIndex) {
      case 0:
        this.scheduleCoastline(step, when);
        break;
      case 1:
        this.scheduleNeon(step, when);
        break;
      case 2:
        this.scheduleSoul(step, when);
        break;
      case 3:
        this.scheduleFreestyle(step, when);
        break;
      case 4:
        this.scheduleTalk(step, when);
        break;
    }
  }

  private songPosition(step: number): { beat: number; bar: number; inBar: number; section: number; fill: boolean } {
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    return {
      beat: Math.floor(inBar / 4),
      bar,
      inBar,
      section: Math.floor((bar % 32) / 8),
      fill: bar % 8 === 7,
    };
  }

  private scheduleCoastline(step: number, when: number): void {
    const p = this.songPosition(step);
    const roots = [45, 41, 36, 43];
    const chords = [
      [57, 60, 64, 71],
      [53, 57, 60, 64],
      [60, 64, 67, 71],
      [55, 59, 62, 69],
    ];
    const root = roots[p.bar % 4];
    if (p.inBar === 0 && !(p.section === 2 && p.bar % 4 === 2)) {
      this.pad(chords[p.bar % 4], when, 2.28, 0.017, 1250, p.bar % 2 ? 0.18 : -0.18);
    }
    if (p.inBar === 0 || (p.section >= 1 && p.inBar === 8)) this.kick(when, 0.085, 52);
    if (p.inBar === 4 || p.inBar === 12) this.snare(when, 0.038, true);
    if (p.inBar % 2 === 0 && p.section !== 2) this.hat(when, p.inBar % 4 === 2 ? 0.014 : 0.01, p.inBar % 4 === 2 ? 0.28 : -0.24);
    if (p.inBar % 4 === 0 || (p.section === 3 && p.inBar % 4 === 3)) {
      const bassOffsets = [0, 0, 7, 12];
      this.bass(midi(root + bassOffsets[p.beat]), when, 0.27, 0.052, 480);
    }
    if ((p.section === 1 || p.section === 3) && [2, 6, 10, 14].includes(p.inBar)) {
      const hook = [76, 79, 81, 79, 74, 76, 72, 71];
      this.tone(midi(hook[(p.bar * 2 + Math.floor(p.inBar / 4)) % hook.length]), when, 0.32, "triangle", 0.026, 0.26, 2600, 0.018, 0.25, true);
    }
    if (p.fill && p.inBar >= 12 && p.inBar % 2 === 0) this.tom(when, midi(43 + (p.inBar - 12) * 2), 0.04);
  }

  private scheduleNeon(step: number, when: number): void {
    const p = this.songPosition(step);
    const roots = [42, 38, 45, 40];
    const chords = [
      [54, 57, 61, 66],
      [50, 54, 57, 62],
      [57, 61, 64, 69],
      [52, 56, 59, 64],
    ];
    const root = roots[p.bar % 4];
    if (p.inBar % 4 === 0 && !(p.section === 2 && p.beat > 1)) this.kick(when, 0.1, 48);
    if (p.inBar === 4 || p.inBar === 12) this.snare(when, 0.052, true);
    if (p.inBar % 2 === 0 && p.section !== 2) this.hat(when, p.inBar % 4 === 2 ? 0.014 : 0.009, p.inBar % 4 === 2 ? 0.34 : -0.34);
    if (p.inBar === 0) this.pad(chords[p.bar % 4], when, 1.94, p.section === 2 ? 0.012 : 0.022, 1650, p.bar % 2 ? 0.24 : -0.24);

    const octave = p.inBar % 2 === 0 ? 0 : 12;
    if (!(p.section === 2 && p.inBar % 4 >= 2)) this.bass(midi(root + octave), when, 0.105, 0.043, 650);
    if (p.section !== 0 || p.bar % 2 === 1) {
      const arp = [0, 7, 12, 16, 12, 7, 19, 16, 0, 7, 14, 16, 12, 7, 4, 7];
      this.tone(midi(root + 24 + arp[p.inBar]), when, 0.105, "sawtooth", 0.021, p.inBar % 2 ? 0.31 : -0.31, 2900, 0.004, 0.085, p.inBar % 4 === 0);
    }
    if (p.fill && p.inBar >= 12) this.tom(when, midi(48 - (p.inBar - 12)), 0.05);
  }

  private scheduleSoul(step: number, when: number): void {
    const p = this.songPosition(step);
    const roots = [36, 32, 29, 31];
    const chords = [
      [60, 63, 67, 70],
      [56, 60, 63, 67],
      [53, 56, 60, 63],
      [55, 59, 62, 65],
    ];
    const swing = p.inBar % 4 === 2 ? 0.027 : 0;
    if (p.inBar === 0 || (p.section === 3 && p.inBar === 10)) this.kick(when, 0.09, 46);
    if (p.inBar === 4 || p.inBar === 12) this.clap(when, 0.05);
    if (p.inBar % 2 === 0 && !(p.section === 2 && p.beat === 0)) this.hat(when + swing, 0.012, p.inBar % 4 === 2 ? 0.38 : -0.25);
    if (p.inBar === 0 || p.inBar === 10) {
      const root = roots[p.bar % 4];
      this.bass(midi(root), when, p.inBar === 0 ? 0.52 : 0.28, 0.062, 340);
    }
    if (p.inBar === 2 || p.inBar === 8) this.rhodes(chords[p.bar % 4], when + swing, 0.68, 0.034);
    if ((p.section === 1 || p.section === 3) && [3, 7, 11, 15].includes(p.inBar)) {
      const melody = [72, 75, 79, 82, 80, 79, 75, 74];
      const target = midi(melody[(p.bar * 4 + Math.floor(p.inBar / 4)) % melody.length]);
      this.portamentoLead(target * 0.88, target, when + swing, 0.3);
    }
    if (p.fill && p.inBar >= 13) this.clap(when, 0.025 + (p.inBar - 13) * 0.008);
  }

  private scheduleFreestyle(step: number, when: number): void {
    const p = this.songPosition(step);
    const roots = [40, 36, 38, 35];
    const root = roots[p.bar % 4];
    if (p.inBar === 0 || p.inBar === 7 || (p.section === 3 && p.inBar === 10)) this.kick(when, 0.12, 43, 0.52);
    if (p.inBar === 4 || p.inBar === 12) this.clap(when, 0.058);
    if ([2, 6, 10, 14].includes(p.inBar)) this.cowbell(when, p.inBar % 8 === 2 ? -0.26 : 0.26);
    if (p.inBar % 2 === 0 && p.section !== 2) this.hat(when, 0.011, p.inBar % 4 === 2 ? 0.4 : -0.35);
    const bassPattern = [0, -1, 0, 7, 12, 7, 3, -1, 0, 7, 10, 7, 12, 10, 7, -1];
    const offset = bassPattern[p.inBar];
    if (offset >= 0 && !(p.section === 2 && p.inBar < 8)) this.bass(midi(root + offset), when, 0.115, 0.05, 720);
    if ((p.inBar === 0 && p.bar % 2 === 0) || (p.section === 3 && p.inBar === 8)) this.orchestraHit(midi(root + 24), when);
    if (p.section === 1 && [3, 9, 13].includes(p.inBar)) {
      const hook = [76, 79, 83, 81, 79, 74];
      this.tone(midi(hook[(p.bar + p.inBar) % hook.length]), when, 0.16, "square", 0.024, 0.2, 3000, 0.004, 0.13, true);
    }
    if (p.fill && p.inBar >= 12) this.snare(when, 0.025 + (p.inBar - 12) * 0.007, false);
  }

  private scheduleTalk(step: number, when: number): void {
    const p = this.songPosition(step);
    if (p.inBar === 0 && p.bar % 2 === 0) {
      this.tone(740, when, 0.045, "sine", 0.012, -0.3, 1800, 0.004, 0.035);
    }
    if (step > 0 && step % 128 === 64 && typeof window !== "undefined" && this.context) {
      const delay = Math.max(0, (when - this.context.currentTime) * 1000);
      const line = TALK_LINES[this.talkLine % TALK_LINES.length];
      this.talkLine += 1;
      window.setTimeout(() => {
        if (this.running && this.stationIndex === 4) this.announce(line);
      }, delay);
    }
  }

  private tone(
    frequency: number,
    when: number,
    duration: number,
    type: Wave,
    level: number,
    panValue: number,
    cutoff: number,
    attack: number,
    release: number,
    wet = false,
  ): void {
    const ctx = this.context;
    const destination = this.musicBus;
    if (!ctx || !destination) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, when);
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = type === "sawtooth" ? 1.4 : 0.7;
    pan.pan.value = clamp(panValue, -1, 1);
    const hold = Math.max(0.005, duration - attack - release);
    setEnvelope(gain.gain, when, attack, hold, release, level);
    osc.connect(filter).connect(gain).connect(pan).connect(destination);
    if (wet && this.reverb) gain.connect(this.reverb);
    osc.start(when);
    osc.stop(when + duration + 0.04);
  }

  private bass(frequency: number, when: number, duration: number, level: number, cutoff: number): void {
    const ctx = this.context;
    const destination = this.musicBus;
    if (!ctx || !destination) return;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    sub.type = "sine";
    osc.frequency.value = frequency;
    sub.frequency.value = frequency * 0.5;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff * 1.45, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff), when + duration);
    filter.Q.value = 2.2;
    setEnvelope(gain.gain, when, 0.006, Math.max(0.015, duration * 0.42), Math.max(0.04, duration * 0.54), level);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(destination);
    osc.start(when);
    sub.start(when);
    osc.stop(when + duration + 0.04);
    sub.stop(when + duration + 0.04);
  }

  private pad(notes: readonly number[], when: number, duration: number, level: number, cutoff: number, panValue: number): void {
    const ctx = this.context;
    const destination = this.musicBus;
    if (!ctx || !destination) return;
    notes.forEach((pitch, noteIndex) => {
      [-8, 8].forEach((detune, voiceIndex) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        const pan = ctx.createStereoPanner();
        osc.type = "sawtooth";
        osc.frequency.value = midi(pitch);
        osc.detune.value = detune;
        filter.type = "lowpass";
        filter.frequency.value = cutoff;
        filter.Q.value = 0.75;
        pan.pan.value = clamp(panValue + (voiceIndex ? 0.12 : -0.12) + (noteIndex - 1.5) * 0.035, -0.75, 0.75);
        setEnvelope(gain.gain, when, 0.16, Math.max(0.05, duration - 0.6), 0.44, level / notes.length);
        osc.connect(filter).connect(gain).connect(pan).connect(destination);
        if (this.reverb) gain.connect(this.reverb);
        osc.start(when);
        osc.stop(when + duration + 0.05);
      });
    });
  }

  private rhodes(notes: readonly number[], when: number, duration: number, level: number): void {
    notes.forEach((pitch, index) => {
      this.tone(midi(pitch), when + index * 0.006, duration, "sine", level / notes.length, (index - 1.5) * 0.11, 3600, 0.008, duration * 0.76, true);
      this.tone(midi(pitch) * 2.01, when + index * 0.006, duration * 0.58, "triangle", level * 0.22 / notes.length, (1.5 - index) * 0.11, 4800, 0.004, duration * 0.42, true);
    });
  }

  private portamentoLead(from: number, to: number, when: number, duration: number): void {
    const ctx = this.context;
    const destination = this.musicBus;
    if (!ctx || !destination) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(to, when + 0.09);
    osc.frequency.setTargetAtTime(to * 1.007, when + 0.11, 0.08);
    pan.pan.value = 0.24;
    setEnvelope(gain.gain, when, 0.018, duration * 0.52, duration * 0.42, 0.043);
    osc.connect(gain).connect(pan).connect(destination);
    if (this.reverb) gain.connect(this.reverb);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  private kick(when: number, level = 0.09, endFrequency = 48, decay = 0.22): void {
    const ctx = this.context;
    const destination = this.musicBus;
    if (!ctx || !destination) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(155, when);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, when + Math.min(decay, 0.18));
    setEnvelope(gain.gain, when, 0.002, 0.008, decay, level);
    osc.connect(gain).connect(destination);
    osc.start(when);
    osc.stop(when + decay + 0.04);
  }

  private snare(when: number, level: number, gated: boolean): void {
    this.noiseHit(when, gated ? 0.22 : 0.12, level, 950, 7800, 0.05, gated);
    this.tone(185, when, 0.12, "triangle", level * 0.55, -0.08, 900, 0.003, 0.1, gated);
  }

  private clap(when: number, level: number): void {
    [0, 0.018, 0.039].forEach((offset, index) =>
      this.noiseHit(when + offset, index === 2 ? 0.14 : 0.035, level * (index === 2 ? 0.72 : 0.45), 900, 7200, index % 2 ? 0.18 : -0.18, true),
    );
  }

  private hat(when: number, level: number, panValue: number): void {
    this.noiseHit(when, 0.045, level, 5200, 12500, panValue, false);
  }

  private tom(when: number, frequency: number, level: number): void {
    const ctx = this.context;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency * 1.7, when);
    osc.frequency.exponentialRampToValueAtTime(frequency, when + 0.12);
    setEnvelope(gain.gain, when, 0.003, 0.025, 0.18, level);
    osc.connect(gain).connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.24);
  }

  private cowbell(when: number, panValue: number): void {
    this.tone(540, when, 0.09, "square", 0.022, panValue, 2600, 0.002, 0.075, true);
    this.tone(845, when, 0.07, "square", 0.014, panValue, 3200, 0.002, 0.055, true);
  }

  private orchestraHit(frequency: number, when: number): void {
    [1, 1.26, 1.5, 2].forEach((ratio, index) =>
      this.tone(frequency * ratio, when + index * 0.004, 0.28, "sawtooth", 0.027, (index - 1.5) * 0.16, 1900, 0.003, 0.24, true),
    );
    this.noiseHit(when, 0.1, 0.024, 700, 4200, 0, true);
  }

  private noiseHit(
    when: number,
    duration: number,
    level: number,
    highpassFrequency: number,
    lowpassFrequency: number,
    panValue: number,
    wet: boolean,
  ): void {
    const ctx = this.context;
    const buffer = this.noiseBuffer;
    const destination = this.musicBus;
    if (!ctx || !buffer || !destination) return;
    const source = ctx.createBufferSource();
    const highpass = ctx.createBiquadFilter();
    const lowpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    source.buffer = buffer;
    highpass.type = "highpass";
    highpass.frequency.value = highpassFrequency;
    lowpass.type = "lowpass";
    lowpass.frequency.value = lowpassFrequency;
    pan.pan.value = clamp(panValue, -1, 1);
    setEnvelope(gain.gain, when, 0.002, Math.max(0.002, duration * 0.12), Math.max(0.01, duration * 0.86), level);
    source.connect(highpass).connect(lowpass).connect(gain).connect(pan).connect(destination);
    if (wet && this.reverb) gain.connect(this.reverb);
    const available = Math.max(0, buffer.duration - duration - 0.01);
    source.start(when, Math.random() * available, Math.min(duration + 0.03, buffer.duration));
  }

  private tuningBurst(when: number): void {
    const ctx = this.context;
    const buffer = this.noiseBuffer;
    const destination = this.effectsBus;
    if (!ctx || !buffer || !destination) return;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(650, when);
    filter.frequency.exponentialRampToValueAtTime(5200, when + 0.11);
    filter.Q.value = 0.85;
    pan.pan.setValueAtTime(-0.45, when);
    pan.pan.linearRampToValueAtTime(0.45, when + 0.13);
    setEnvelope(gain.gain, when, 0.006, 0.045, 0.1, 0.08);
    source.connect(filter).connect(gain).connect(pan).connect(destination);
    source.start(when, Math.random() * 1.5, 0.18);
  }

  private makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.ceil(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.025 * white) / 1.025;
      data[i] = white * 0.72 + brown * 0.28;
    }
    return buffer;
  }

  private makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.ceil(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const decay = (1 - i / length) ** 2.7;
        data[i] = (Math.random() * 2 - 1) * decay * (channel === 0 ? 0.92 : 1);
      }
    }
    return impulse;
  }
}
