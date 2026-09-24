type AudioContextWithWebkit = typeof AudioContext & { new (): AudioContext };

const BPM = 84;
const STEP_SECONDS = 60 / BPM;
const SCHEDULE_AHEAD = 0.16;

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
      this.nextTime += STEP_SECONDS;
      this.nextStep = (this.nextStep + 1) % 16;
    }
  }

  private scheduleStep(step: number, when: number): void {
    if (!this.context || !this.master) return;
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
