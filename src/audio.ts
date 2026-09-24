type AudioContextWithWebkit = typeof AudioContext & { new (): AudioContext };

const BPM = 84;
const STEP_SECONDS = 60 / BPM;
const SCHEDULE_AHEAD = 0.16;

export const STATIONS = [
  { name: "COASTLINE FM", freq: "88.7", genre: "Sunset synth-pop" },
  { name: "NON-STOP NEON", freq: "101.3", genre: "Outrun · 128 BPM" },
  { name: "BAY TALK", freq: "94.1", genre: "Call-in static" },
] as const;

const NOTE_FREQUENCIES: Record<string, number> = {
  D2: 73.42,
  F2: 87.31,
  G2: 98,
  A2: 110,
  C3: 130.81,
  D3: 146.83,
  F3: 174.61,
  G3: 196,
  A3: 220,
  C4: 261.63,
  D4: 293.66,
};

function note(name: string): number {
  return NOTE_FREQUENCIES[name] ?? 110;
}

function envelope(
  context: AudioContext,
  gain: GainNode,
  start: number,
  attack: number,
  release: number,
  peak: number,
): void {
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, peak),
    start + attack,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  void context;
}

/** A tiny original coastal radio bed. It only creates/resumes audio after start() is called. */
export class Radio {
  private context?: AudioContext;
  private master?: GainNode;
  private timer?: number;
  private nextStep = 0;
  private nextTime = 0;
  private running = false;
  private driving = false;
  private stationIndex = 0;

  public get station(): number {
    return this.stationIndex;
  }

  /** Select one of the compact, synthesized stations. */
  public setStation(index: number): void {
    const next = Math.max(0, Math.min(STATIONS.length - 1, Math.trunc(index)));
    if (next === this.stationIndex) return;
    this.stationIndex = next;
    if (!this.context || !this.running) return;
    const now = this.context.currentTime;
    this.tuningBurst(now);
    // The scheduler only looks a fraction of a second ahead, so resetting it
    // makes the new programme take over as soon as the dial is turned.
    this.nextTime = now + 0.015;
    this.nextStep = 0;
    this.schedule();
  }

  public async start(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextWithWebkit })
          .webkitAudioContext;
      if (!AudioCtor) return;
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
    if (!this.master || !this.context) return;
    const target = this.driving ? 0.037 : 0.028;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.18);
    if (this.running) return;
    this.running = true;
    this.nextTime = this.context.currentTime + 0.04;
    this.nextStep = 0;
    this.timer = window.setInterval(() => this.schedule(), 70);
    this.schedule();
  }

  public stop(): void {
    this.running = false;
    if (this.timer !== undefined && typeof window !== "undefined")
      window.clearInterval(this.timer);
    this.timer = undefined;
    if (this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.12);
    }
  }

  public setDriving(driving: boolean): void {
    this.driving = driving;
    if (this.context && this.master && this.running) {
      this.master.gain.setTargetAtTime(
        driving ? 0.037 : 0.028,
        this.context.currentTime,
        0.2,
      );
    }
  }

  /** Two-tone patrol siren, only audible once the radio has been switched on. */
  public siren(seconds = 3): void {
    const ctx = this.context;
    if (!ctx || !this.running) return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = "sawtooth";
    const t = ctx.currentTime;
    for (let i = 0; i < seconds * 2; i++) {
      osc.frequency.setValueAtTime(i % 2 ? 620 : 860, t + i * 0.5);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    osc.connect(lp).connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.1);
  }

  /** Short rising brass-like stinger for a completed or failed job. */
  public stinger(passed: boolean): void {
    const ctx = this.context;
    if (!ctx || !this.running) return;
    const t = ctx.currentTime;
    const notes = passed ? [293.7, 370, 440, 587.3] : [293.7, 277.2, 246.9, 196];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      const at = t + i * 0.13;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (i === 3 ? 1.1 : 0.3));
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 1.2);
    });
  }

  public dispose(): void {
    this.stop();
    if (this.master) this.master.disconnect();
    const context = this.context;
    this.master = undefined;
    this.context = undefined;
    if (context) void context.close();
  }

  private schedule(): void {
    if (!this.running || !this.context || !this.master) return;
    while (this.nextTime < this.context.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.nextStep, this.nextTime);
      this.nextTime += this.stepSeconds();
      this.nextStep = (this.nextStep + 1) % 16;
    }
  }

  private stepSeconds(): number {
    return this.stationIndex === 1 ? 60 / 128 / 4 : STEP_SECONDS;
  }

  private scheduleStep(step: number, when: number): void {
    if (!this.context || !this.master) return;
    if (this.stationIndex === 1) {
      this.scheduleOutrun(step, when);
      return;
    }
    if (this.stationIndex === 2) {
      this.scheduleTalk(step, when);
      return;
    }
    const beat = step % 4;
    const barStep = step % 16;

    if (barStep === 0 || barStep === 8) this.kick(when);
    if (barStep === 4 || barStep === 12) this.snare(when);
    if (this.driving || beat % 2 === 0) this.hat(when, 0.014);

    const bassLine = [
      "D2",
      "D2",
      "F2",
      "G2",
      "A2",
      "G2",
      "F2",
      "D2",
      "C3",
      "C3",
      "A2",
      "G2",
      "F2",
      "G2",
      "A2",
      "C3",
    ];
    this.bass(note(bassLine[barStep]), when, step % 4 === 0 ? 0.23 : 0.16);

    if (barStep === 0 || barStep === 8) {
      const chord =
        barStep === 0
          ? [note("D3"), note("F3"), note("A3")]
          : [note("C3"), note("F3"), note("G3")];
      chord.forEach((frequency, index) =>
        this.chime(frequency, when + index * 0.018),
      );
    }
  }

  private scheduleOutrun(step: number, when: number): void {
    const barStep = step % 16;
    if (barStep % 4 === 0) this.kick(when);
    if (barStep === 4 || barStep === 12) this.snare(when);
    if (barStep % 2 === 0) this.hat(when, 0.012);

    const roots = [73.42, 87.31, 65.41, 73.42]; // D minor, F, C, D minor
    const root = roots[Math.floor(barStep / 4)];
    const arp = [1, 1.5, 2, 3, 2, 1.5, 2, 4][barStep % 8];
    this.bass(root, when, 0.11);
    this.outrunLead(root * arp, when, 0.105);
  }

  private scheduleTalk(step: number, when: number): void {
    this.staticBed(when, STEP_SECONDS + 0.04);
    // Irregular little band-passed syllables keep it suggestive, never legible.
    if (step % 3 === 0 && Math.random() > 0.38) {
      this.voiceBlip(when + 0.04 + Math.random() * 0.18);
    }
  }

  private tuningBurst(when: number): void {
    if (!this.context || !this.master) return;
    const buffer = this.noiseBuffer(0.15);
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    envelope(this.context, gain, when, 0.004, 0.146, 0.032);
    noise.buffer = buffer;
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(when);
    noise.stop(when + 0.16);
  }

  private staticBed(when: number, duration: number): void {
    if (!this.context || !this.master) return;
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    noise.buffer = this.noiseBuffer(duration);
    filter.type = "bandpass";
    filter.frequency.value = 1050;
    filter.Q.value = 0.45;
    envelope(this.context, gain, when, 0.01, duration, 0.028);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(when);
    noise.stop(when + duration + 0.02);
  }

  private voiceBlip(when: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const duration = 0.05 + Math.random() * 0.11;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(120 + Math.random() * 190, when);
    oscillator.frequency.linearRampToValueAtTime(160 + Math.random() * 300, when + duration);
    filter.type = "bandpass";
    filter.frequency.value = 900 + Math.random() * 700;
    filter.Q.value = 3.5;
    envelope(this.context, gain, when, 0.008, duration, 0.035);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  private outrunLead(frequency: number, when: number, duration: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2100, when);
    filter.Q.value = 1.8;
    envelope(this.context, gain, when, 0.004, duration, 0.075);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.025);
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    if (!this.context) throw new Error("Audio context is unavailable");
    const buffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * seconds),
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1)
      data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  private kick(when: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(108, when);
    oscillator.frequency.exponentialRampToValueAtTime(48, when + 0.14);
    envelope(this.context, gain, when, 0.004, 0.16, 0.62);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(when);
    oscillator.stop(when + 0.2);
  }

  private snare(when: number): void {
    if (!this.context || !this.master) return;
    const buffer = this.context.createBuffer(
      1,
      this.context.sampleRate * 0.12,
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    }
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "highpass";
    filter.frequency.value = 1400;
    envelope(this.context, gain, when, 0.002, 0.13, 0.19);
    noise.buffer = buffer;
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(when);
    noise.stop(when + 0.13);
  }

  private hat(when: number, level: number): void {
    if (!this.context || !this.master) return;
    const buffer = this.context.createBuffer(
      1,
      this.context.sampleRate * 0.045,
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1)
      data[index] = Math.random() * 2 - 1;
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "highpass";
    filter.frequency.value = 6500;
    envelope(this.context, gain, when, 0.001, 0.045, level);
    noise.buffer = buffer;
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(when);
    noise.stop(when + 0.05);
  }

  private bass(frequency: number, when: number, duration: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(640, when);
    filter.Q.value = 1.2;
    envelope(this.context, gain, when, 0.012, duration, 0.18);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.08);
  }

  private chime(frequency: number, when: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, when);
    envelope(this.context, gain, when, 0.025, 0.7, 0.055);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(when);
    oscillator.stop(when + 0.78);
  }
}
